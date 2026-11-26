import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  calls,
  signalingEvents,
  users,
  type SignalingJsonLog,
} from "@/db/schema";
import { authenticateRequest } from "@/lib/auth";
import { broadcastGlobalRealtimeEvent } from "@/lib/privacy-search";
import { and, asc, eq, inArray } from "drizzle-orm";
import { notifyUser } from "@/lib/signal-bus";
import { checkRateLimit } from "@/lib/privacy-search";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    await db
      .update(users)
      .set({ lastSeenAt: new Date() })
      .where(eq(users.id, auth.sub));

    const pending = await db
      .select()
      .from(signalingEvents)
      .where(
        and(
          eq(signalingEvents.toUserId, auth.sub),
          eq(signalingEvents.delivered, false)
        )
      )
      .orderBy(asc(signalingEvents.createdAt))
      .limit(50);

    if (pending.length > 0) {
      await db
        .update(signalingEvents)
        .set({ delivered: true })
        .where(
          inArray(
            signalingEvents.id,
            pending.map((e) => e.id)
          )
        );
    }

    return NextResponse.json({
      events: pending,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("GET /api/signaling error:", error);
    return NextResponse.json(
      { error: "فشل جلب إشارات الاتصال" },
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

    const rate = checkRateLimit(`signaling:${auth.sub}`, 180, 60_000);
    if (!rate.allowed) {
      return NextResponse.json({ error: "طلبات الإشارة كثيرة جداً، حاول بعد قليل" }, { status: 429 });
    }

    const body = await req.json();
    const eventType = String(body.eventType || "");

    // Heartbeat ping: refreshes lastSeenAt without clobbering manual status
    if (eventType === "presence-ping") {
      const [me] = await db
        .select({ presenceStatus: users.presenceStatus })
        .from(users)
        .where(eq(users.id, auth.sub))
        .limit(1);

      const keepManual =
        me?.presenceStatus === "unavailable" ||
        me?.presenceStatus === "busy" ||
        me?.presenceStatus === "in_call" ||
        me?.presenceStatus === "offline";

      await db
        .update(users)
        .set({
          ...(keepManual ? {} : { presenceStatus: "online" }),
          lastSeenAt: new Date(),
        })
        .where(eq(users.id, auth.sub));

      return NextResponse.json({ ok: true });
    }

    // Explicit realtime status switch: online | unavailable | in_call | offline
    if (eventType === "presence-set") {
      const valid = ["online", "unavailable", "in_call", "offline"];
      const requested = String(body.status || "online");
      const nextStatus = valid.includes(requested) ? requested : "online";
      const now = new Date();

      await db
        .update(users)
        .set({ presenceStatus: nextStatus, lastSeenAt: now })
        .where(eq(users.id, auth.sub));

      await broadcastGlobalRealtimeEvent({
        fromUserId: auth.sub,
        eventType: "presence-changed",
        payload: {
          userId: auth.sub,
          presenceStatus: nextStatus,
          lastSeenAt: now.toISOString(),
        },
      });

      return NextResponse.json({
        ok: true,
        presenceStatus: nextStatus,
        lastSeenAt: now.toISOString(),
      });
    }

    const toUserId = String(body.toUserId || "").trim();
    const callId = body.callId ? String(body.callId).trim() : null;
    const payload = (body.payload || {}) as Record<string, unknown>;
    const allowedEventTypes = new Set([
      "call-invite", "call-answer", "ice-candidate", "call-end", "call-reject",
      "friend-updated", "new-message", "new-notification", "presence-changed",
    ]);

    if (!allowedEventTypes.has(eventType)) {
      return NextResponse.json({ error: "نوع إشارة غير مسموح" }, { status: 400 });
    }

    if (!toUserId || !eventType || toUserId === auth.sub) {
      return NextResponse.json(
        { error: "حقول toUserId و eventType مطلوبة" },
        { status: 400 }
      );
    }

    if (callId) {
      const [existingCall] = await db
        .select()
        .from(calls)
        .where(eq(calls.id, callId))
        .limit(1);

      if (!existingCall ||
        (existingCall.callerId !== auth.sub && existingCall.calleeId !== auth.sub) ||
        ![existingCall.callerId, existingCall.calleeId].includes(toUserId) ||
        toUserId === auth.sub) {
        return NextResponse.json({ error: "المكالمة غير موجودة أو لا تملك صلاحية الإشارة إليها" }, { status: 404 });
      }

      if (existingCall.status === "ended" || existingCall.status === "missed") {
        return NextResponse.json({ error: "انتهت هذه المكالمة ولا تقبل إشارات جديدة" }, { status: 409 });
      }
      if (eventType === "call-answer" && existingCall.calleeId !== auth.sub) {
        return NextResponse.json({ error: "المستلم فقط يمكنه الرد على المكالمة" }, { status: 403 });
      }
      if (eventType === "call-invite" && existingCall.callerId !== auth.sub) {
        return NextResponse.json({ error: "المتصل الأصلي فقط يمكنه إرسال دعوة المكالمة" }, { status: 403 });
      }

      if (existingCall) {
        const nowIso = new Date().toISOString();
        const sig: SignalingJsonLog = existingCall.signalingJson ?? {
          iceCandidates: [],
          events: [],
        };
        const nextSig: SignalingJsonLog = {
          ...sig,
          iceCandidates: [...(sig.iceCandidates ?? [])],
          events: [...(sig.events ?? [])],
        };

        let nextStatus: "ringing" | "answered" | "ended" | "missed" = existingCall.status;
        let endAt = existingCall.endAt;

        if (eventType === "call-answer" && payload.sdp) {
          const sdpObj = payload.sdp as { type: string; sdp?: string };
          nextSig.answer = {
            type: sdpObj.type || "answer",
            sdp: sdpObj.sdp,
            at: nowIso,
          };
          nextSig.iceConnectionState = "connected";
          nextSig.events?.push({
            step: "call-answer",
            detail: `تم استلام SDP Answer من ${auth.displayName}`,
            at: nowIso,
          });
          nextStatus = "answered";

          // Mark both participants as 'in_call' (مشغول بمكالمة)
          await db
            .update(users)
            .set({ presenceStatus: "in_call", lastSeenAt: new Date() })
            .where(
              inArray(users.id, [existingCall.callerId, existingCall.calleeId])
            );

          // Not awaited: presence fan-out must not delay the answer reaching the caller.
          void broadcastGlobalRealtimeEvent({
            fromUserId: auth.sub,
            eventType: "presence-changed",
            payload: { userId: auth.sub, presenceStatus: "in_call" },
          });
        } else if (
          eventType === "ice-candidate" &&
          payload.candidate &&
          (sig.iceCandidates?.length ?? 0) < 8
        ) {
          const candObj = payload.candidate as {
            candidate?: string;
            sdpMid?: string | null;
            sdpMLineIndex?: number | null;
          };
          if (candObj.candidate) {
            nextSig.iceCandidates?.push({
              from: auth.username,
              candidate: candObj.candidate,
              sdpMid: candObj.sdpMid ?? "0",
              sdpMLineIndex: candObj.sdpMLineIndex ?? 0,
              at: nowIso,
            });
          }
        } else if (eventType === "call-end" || eventType === "call-reject") {
          nextStatus =
            eventType === "call-reject" || existingCall.status === "ringing"
              ? "missed"
              : "ended";
          endAt = new Date();
          nextSig.iceConnectionState = "closed";
          nextSig.events?.push({
            step: eventType,
            detail:
              eventType === "call-reject"
                ? `اعتذار عن الرد من ${auth.displayName}`
                : `إنهاء المكالمة بواسطة ${auth.displayName}`,
            at: nowIso,
          });

          // Restore 'in_call' participants back to 'online'
          await db
            .update(users)
            .set({ presenceStatus: "online", lastSeenAt: new Date() })
            .where(
              and(
                inArray(users.id, [
                  existingCall.callerId,
                  existingCall.calleeId,
                ]),
                eq(users.presenceStatus, "in_call")
              )
            );

          void broadcastGlobalRealtimeEvent({
            fromUserId: auth.sub,
            eventType: "presence-changed",
            payload: { userId: auth.sub, presenceStatus: "online" },
          });
        }

        await db
          .update(calls)
          .set({
            status: nextStatus,
            endAt,
            signalingJson: nextSig,
          })
          .where(eq(calls.id, callId));
      }
    }

    if (!callId) {
      const safeNonCallEvents = new Set(["friend-updated", "new-message", "new-notification", "presence-changed"]);
      if (!safeNonCallEvents.has(eventType)) {
        return NextResponse.json({ error: "معرف المكالمة مطلوب لهذا النوع من الإشارات" }, { status: 400 });
      }
      const [recipient] = await db.select({ id: users.id }).from(users).where(eq(users.id, toUserId)).limit(1);
      if (!recipient) return NextResponse.json({ error: "المستلم غير موجود" }, { status: 404 });
    }

    const [inserted] = await db
      .insert(signalingEvents)
      .values({
        callId: callId || undefined,
        fromUserId: auth.sub,
        toUserId,
        eventType,
        payload: {
          ...payload,
          callId,
          fromUser: {
            id: auth.sub,
            username: auth.username,
            displayName: auth.displayName,
          },
        },
      })
      .returning();

    notifyUser(toUserId);
    return NextResponse.json({ ok: true, event: inserted });
  } catch (error) {
    console.error("POST /api/signaling error:", error);
    return NextResponse.json(
      { error: "تعذر تمرير حزمة الإشارة" },
      { status: 500 }
    );
  }
}
