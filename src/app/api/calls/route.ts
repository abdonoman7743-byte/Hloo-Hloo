import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  calls,
  friends,
  signalingEvents,
  users,
  type SignalingJsonLog,
} from "@/db/schema";
import { authenticateRequest } from "@/lib/auth";
import { notifyUser } from "@/lib/signal-bus";
import {
  broadcastGlobalRealtimeEvent,
  getResolvedPrivacy,
  isScopeAllowed,
} from "@/lib/privacy-search";
import { ensureSeeded } from "@/lib/seed";
import { and, desc, eq, inArray, or } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureSeeded();
    const auth = await authenticateRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const allUsers = await db.select().from(users);
    const userMap = new Map(
      allUsers.map((u) => [
        u.id,
        {
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          avatarUrl: u.avatarUrl,
        },
      ])
    );

    const rows = await db
      .select()
      .from(calls)
      .where(or(eq(calls.callerId, auth.sub), eq(calls.calleeId, auth.sub)))
      .orderBy(desc(calls.createdAt))
      .limit(40);

    const enriched = rows.map((c) => {
      const durationSec =
        c.startAt && c.endAt
          ? Math.max(
              0,
              Math.round(
                (new Date(c.endAt).getTime() - new Date(c.startAt).getTime()) /
                  1000
              )
            )
          : null;

      return {
        ...c,
        durationSec,
        direction: c.callerId === auth.sub ? "outgoing" : "incoming",
        caller: userMap.get(c.callerId) ?? null,
        callee: userMap.get(c.calleeId) ?? null,
      };
    });

    return NextResponse.json({ calls: enriched });
  } catch (error) {
    console.error("GET /api/calls error:", error);
    return NextResponse.json(
      { error: "تعذر جلب سجل المكالمات" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const body = await req.json();
    const calleeId = String(body.calleeId || "").trim();
    const callType = body.type === "audio" ? "audio" : "video";
    const offer = body.offer as { type: string; sdp?: string } | undefined;
    const transportMode =
      (body.transportMode as SignalingJsonLog["transportMode"]) ||
      "P2P Direct (STUN)";

    if (!calleeId || calleeId === auth.sub) {
      return NextResponse.json(
        { error: "يرجى تحديد الطرف المستقبِل للمكالمة" },
        { status: 400 }
      );
    }

    const [callee] = await db
      .select()
      .from(users)
      .where(eq(users.id, calleeId))
      .limit(1);

    if (!callee) {
      return NextResponse.json(
        { error: "المستخدم المطلوب غير موجود" },
        { status: 404 }
      );
    }

    // Verify account privacy & call permissions
    if (calleeId !== auth.sub) {
      const rels = await db
        .select()
        .from(friends)
        .where(
          or(
            and(eq(friends.userId, auth.sub), eq(friends.friendId, calleeId)),
            and(eq(friends.userId, calleeId), eq(friends.friendId, auth.sub))
          )
        );

      if (rels.some((r) => r.status === "blocked")) {
        return NextResponse.json(
          { error: "لا يمكن الاتصال بهذا المستخدم بسبب الحظر" },
          { status: 403 }
        );
      }

      const isFriend = rels.some((r) => r.status === "accepted");
      const priv = getResolvedPrivacy(callee);
      const canCall =
        isScopeAllowed(priv.callPermission, false, isFriend) &&
        (callee.availabilityMode !== "private" || isFriend);

      if (!canCall) {
        return NextResponse.json(
          {
            error:
              "صلاحيات خصوصية هذا الحساب تسمح بالمكالمات للأصدقاء فقط",
          },
          { status: 403 }
        );
      }
    }

    const nowIso = new Date().toISOString();
    const initialSignaling: SignalingJsonLog = {
      transportMode,
      iceConnectionState: "checking",
      offer: offer
        ? { type: offer.type, sdp: offer.sdp, at: nowIso }
        : undefined,
      iceCandidates: [],
      events: [
        {
          step: "call-invite",
          detail: `بدء مكالمة ${
            callType === "video" ? "مرئية" : "صوتية"
          } وإرسال SDP Offer`,
          at: nowIso,
        },
      ],
    };

    const [created] = await db
      .insert(calls)
      .values({
        callerId: auth.sub,
        calleeId,
        status: "ringing",
        type: callType,
        startAt: new Date(),
        signalingJson: initialSignaling,
      })
      .returning();

    // Update caller presence to 'in_call' (مشغول بمكالمة)
    await db
      .update(users)
      .set({ presenceStatus: "in_call", lastSeenAt: new Date() })
      .where(eq(users.id, auth.sub));

    await broadcastGlobalRealtimeEvent({
      fromUserId: auth.sub,
      eventType: "presence-changed",
      payload: { userId: auth.sub, presenceStatus: "in_call" },
    });

    if (created && calleeId !== auth.sub) {
      const [callerProfile] = await db
        .select()
        .from(users)
        .where(eq(users.id, auth.sub))
        .limit(1);

      await db.insert(signalingEvents).values({
        callId: created.id,
        fromUserId: auth.sub,
        toUserId: calleeId,
        eventType: "call-invite",
        payload: {
          callId: created.id,
          callType,
          offer,
          caller: {
            id: auth.sub,
            username: auth.username,
            displayName: callerProfile?.displayName || auth.displayName,
            avatarUrl: callerProfile?.avatarUrl || null,
          },
        },
      });
      notifyUser(calleeId);
    }

    return NextResponse.json({ call: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/calls error:", error);
    return NextResponse.json(
      { error: "تعذر إنشاء جلسة الاتصال" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const body = await req.json();
    const callId = String(body.callId || "").trim();
    if (!callId) {
      return NextResponse.json(
        { error: "معرف المكالمة callId مطلوب" },
        { status: 400 }
      );
    }

    const [existing] = await db
      .select()
      .from(calls)
      .where(eq(calls.id, callId))
      .limit(1);

    if (!existing) {
      return NextResponse.json(
        { error: "المكالمة غير موجودة" },
        { status: 404 }
      );
    }

    // Only the two call participants may modify a call.
    if (existing.callerId !== auth.sub && existing.calleeId !== auth.sub) {
      return NextResponse.json(
        { error: "المكالمة غير موجودة" },
        { status: 404 }
      );
    }

    const requestedStatus = body.status;
    if (["ended", "missed"].includes(existing.status) && requestedStatus && requestedStatus !== existing.status) {
      return NextResponse.json({ error: "لا يمكن إعادة فتح مكالمة منتهية" }, { status: 409 });
    }
    if (requestedStatus === "answered" && existing.status !== "ringing") {
      return NextResponse.json({ error: "المكالمة لم تعد في حالة انتظار الرد" }, { status: 409 });
    }
    if (requestedStatus === "answered" && existing.calleeId !== auth.sub) {
      return NextResponse.json({ error: "المستلم فقط يمكنه قبول المكالمة" }, { status: 403 });
    }
    if (["ended", "missed"].includes(String(requestedStatus)) &&
        !["ringing", "answered"].includes(existing.status)) {
      return NextResponse.json({ error: "لا يمكن تغيير حالة مكالمة منتهية" }, { status: 409 });
    }
    if (requestedStatus && !["ringing", "answered", "ended", "missed"].includes(String(requestedStatus))) {
      return NextResponse.json({ error: "حالة المكالمة غير صالحة" }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const currentSig: SignalingJsonLog = existing.signalingJson ?? {
      iceCandidates: [],
      events: [],
    };

    const updatedSig: SignalingJsonLog = {
      ...currentSig,
      iceCandidates: [...(currentSig.iceCandidates ?? [])],
      events: [...(currentSig.events ?? [])],
    };

    if (body.offer) {
      updatedSig.offer = {
        type: body.offer.type,
        sdp: body.offer.sdp,
        at: nowIso,
      };
    }

    if (body.answer) {
      updatedSig.answer = {
        type: body.answer.type,
        sdp: body.answer.sdp,
        at: nowIso,
      };
      updatedSig.events?.push({
        step: "call-answer",
        detail: "استلام SDP Answer وتثبيت الوصف البعيد (setRemoteDescription)",
        at: nowIso,
      });
    }

    if (Array.isArray(body.iceCandidates)) {
      for (const cand of body.iceCandidates) {
        updatedSig.iceCandidates?.push({
          from: cand.from || auth.username,
          candidate: String(cand.candidate || ""),
          sdpMid: cand.sdpMid ?? "0",
          sdpMLineIndex: cand.sdpMLineIndex ?? 0,
          at: nowIso,
        });
      }
    } else if (body.iceCandidate) {
      updatedSig.iceCandidates?.push({
        from: body.iceCandidate.from || auth.username,
        candidate: String(body.iceCandidate.candidate || ""),
        sdpMid: body.iceCandidate.sdpMid ?? "0",
        sdpMLineIndex: body.iceCandidate.sdpMLineIndex ?? 0,
        at: nowIso,
      });
    }

    if (body.transportMode) {
      updatedSig.transportMode = body.transportMode;
    }

    if (body.iceConnectionState) {
      updatedSig.iceConnectionState = body.iceConnectionState;
    }

    if (body.eventStep) {
      updatedSig.events?.push({
        step: String(body.eventStep.step || "signal"),
        detail: String(body.eventStep.detail || ""),
        at: nowIso,
      });
    }

    const validStatuses = ["ringing", "answered", "ended", "missed"] as const;
    const nextStatus = validStatuses.includes(body.status)
      ? (body.status as (typeof validStatuses)[number])
      : existing.status;

    const isEnding = nextStatus === "ended" || nextStatus === "missed";

    const [updated] = await db
      .update(calls)
      .set({
        status: nextStatus,
        startAt:
          nextStatus === "answered" && !existing.startAt
            ? new Date()
            : existing.startAt,
        endAt: isEnding ? new Date() : existing.endAt,
        signalingJson: updatedSig,
      })
      .where(eq(calls.id, callId))
      .returning();

    if (isEnding) {
      await db
        .update(users)
        .set({ presenceStatus: "online", lastSeenAt: new Date() })
        .where(
          and(
            inArray(users.id, [existing.callerId, existing.calleeId]),
            eq(users.presenceStatus, "in_call")
          )
        );

      await broadcastGlobalRealtimeEvent({
        fromUserId: auth.sub,
        eventType: "presence-changed",
        payload: { userId: auth.sub, presenceStatus: "online" },
      });
    }

    return NextResponse.json({ call: updated });
  } catch (error) {
    console.error("PATCH /api/calls error:", error);
    return NextResponse.json(
      { error: "تعذر تحديث بيانات المكالمة" },
      { status: 500 }
    );
  }
}
