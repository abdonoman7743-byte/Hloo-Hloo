import { NextResponse } from "next/server";
import { db } from "@/db";
import { friends, messages, signalingEvents, users } from "@/db/schema";
import { authenticateRequest } from "@/lib/auth";
import {
  buildSafeProfileForViewer,
  getResolvedPrivacy,
  isScopeAllowed,
  pushUserNotification,
  recordAuditLog,
} from "@/lib/privacy-search";
import { ensureSeeded } from "@/lib/seed";
import { and, desc, eq, ne, or, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

function formatViewerSafeContact(
  u: typeof users.$inferSelect,
  viewerId: string,
  isFriend: boolean,
  nowMs: number
) {
  const safe = buildSafeProfileForViewer({
    target: u,
    viewerId,
    relationship: isFriend ? "friend" : "none",
    nowMs,
  });

  return {
    id: u.id,
    username: u.username,
    firstName: safe.firstName,
    displayName: safe.displayName,
    email: safe.visibleEmail || "",
    phone: safe.visiblePhone || null,
    city: safe.city,
    groupTag: safe.groupTag,
    availabilityMode: safe.availabilityMode,
    avatarUrl: safe.avatarUrl,
    bio: safe.bio,
    presenceStatus: safe.presenceStatus,
    effectivePresence: safe.presenceStatus,
    lastSeenAt: safe.lastSeenAt,
    canMessageInternally: safe.canMessageInternally,
    canCall: safe.canCall,
  };
}

export async function GET(req: Request) {
  try {
    await ensureSeeded();
    const auth = await authenticateRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const meId = auth.sub;
    const nowMs = Date.now();

    const [allUsers, relations, myMessages] = await Promise.all([
      db.select().from(users).where(ne(users.id, meId)),
      db
        .select()
        .from(friends)
        .where(or(eq(friends.userId, meId), eq(friends.friendId, meId))),
      db
        .select()
        .from(messages)
        .where(or(eq(messages.senderId, meId), eq(messages.receiverId, meId)))
        .orderBy(desc(messages.createdAt)),
    ]);

    const userMap = new Map(allUsers.map((u) => [u.id, u]));

    const latestMsgByPeer = new Map<string, typeof messages.$inferSelect>();
    for (const m of myMessages) {
      if (m.groupId) continue;
      const peerId = m.senderId === meId ? m.receiverId : m.senderId;
      if (peerId && !latestMsgByPeer.has(peerId)) {
        latestMsgByPeer.set(peerId, m);
      }
    }

    const acceptedIds = new Set<string>();
    const blockedIds = new Set<string>();
    const incomingRequests: Array<{
      requestId: string;
      createdAt: Date;
      user: ReturnType<typeof formatViewerSafeContact>;
    }> = [];
    const outgoingRequests: Array<{
      requestId: string;
      createdAt: Date;
      user: ReturnType<typeof formatViewerSafeContact>;
    }> = [];

    for (const rel of relations) {
      const otherId = rel.userId === meId ? rel.friendId : rel.userId;
      const otherUser = userMap.get(otherId);
      if (!otherUser) continue;

      if (rel.status === "blocked") {
        blockedIds.add(otherId);
      } else if (rel.status === "accepted") {
        acceptedIds.add(otherId);
      } else if (rel.status === "pending") {
        if (rel.friendId === meId) {
          incomingRequests.push({
            requestId: rel.id,
            createdAt: rel.createdAt,
            user: formatViewerSafeContact(otherUser, meId, false, nowMs),
          });
        } else {
          outgoingRequests.push({
            requestId: rel.id,
            createdAt: rel.createdAt,
            user: formatViewerSafeContact(otherUser, meId, false, nowMs),
          });
        }
      }
    }

    // Include both accepted friends AND direct message peers so private chats with any user persist in Chats list
    const chatContactIds = new Set<string>([
      ...Array.from(acceptedIds),
      ...Array.from(latestMsgByPeer.keys()),
    ]);

    const contactsWithChatsOrFriends = Array.from(chatContactIds)
      .filter((id) => !blockedIds.has(id) && userMap.has(id))
      .map((id) => {
        const u = userMap.get(id)!;
        const isFriend = acceptedIds.has(id);
        const lastMsg = latestMsgByPeer.get(id);
        return {
          ...formatViewerSafeContact(u, meId, isFriend, nowMs),
          lastMessage: lastMsg
            ? {
                id: lastMsg.id,
                type: lastMsg.type,
                content: lastMsg.content,
                senderId: lastMsg.senderId,
                createdAt: lastMsg.createdAt,
              }
            : null,
        };
      })
      .sort((a, b) => {
        const tA = a.lastMessage
          ? new Date(a.lastMessage.createdAt).getTime()
          : 0;
        const tB = b.lastMessage
          ? new Date(b.lastMessage.createdAt).getTime()
          : 0;
        if (tB !== tA) return tB - tA;
        if (a.presenceStatus === "online" && b.presenceStatus !== "online")
          return -1;
        if (b.presenceStatus === "online" && a.presenceStatus !== "online")
          return 1;
        return 0;
      });

    const pendingIds = new Set([
      ...incomingRequests.map((r) => r.user.id),
      ...outgoingRequests.map((r) => r.user.id),
    ]);

    const discoverUsers = allUsers
      .filter((u) => {
        if (
          acceptedIds.has(u.id) ||
          blockedIds.has(u.id) ||
          pendingIds.has(u.id)
        ) {
          return false;
        }
        const priv = getResolvedPrivacy(u);
        return (
          u.availabilityMode !== "private" &&
          isScopeAllowed(priv.searchVisibility, false, false)
        );
      })
      .map((u) => formatViewerSafeContact(u, meId, false, nowMs));

    return NextResponse.json({
      friends: contactsWithChatsOrFriends,
      acceptedFriendIds: Array.from(acceptedIds),
      incomingRequests,
      outgoingRequests,
      discoverUsers,
    });
  } catch (error) {
    console.error("GET /api/friends error:", error);
    return NextResponse.json(
      { error: "تعذر جلب جهات الاتصال" },
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
    const targetUsername = String(body.username || "")
      .trim()
      .replace(/^@/, "")
      .toLowerCase();
    const targetUserId = String(body.targetUserId || "").trim();

    let target: typeof users.$inferSelect | undefined;
    if (targetUserId) {
      [target] = await db
        .select()
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);
    } else if (targetUsername) {
      [target] = await db
        .select()
        .from(users)
        .where(sql`LOWER(${users.username}) = ${targetUsername}`)
        .limit(1);
    }

    if (!target) {
      return NextResponse.json(
        { error: "لم يتم العثور على المستخدم المطلوب" },
        { status: 404 }
      );
    }

    if (target.id === auth.sub) {
      return NextResponse.json(
        { error: "لا يمكنك إرسال طلب صداقة لنفسك" },
        { status: 400 }
      );
    }

    const priv = getResolvedPrivacy(target);
    if (
      target.availabilityMode === "private" ||
      priv.searchVisibility === "nobody"
    ) {
      return NextResponse.json(
        { error: "هذا المستخدم غير متاح لاستقبال طلبات الإضافة حالياً" },
        { status: 403 }
      );
    }

    const existing = await db
      .select()
      .from(friends)
      .where(
        or(
          and(eq(friends.userId, auth.sub), eq(friends.friendId, target.id)),
          and(eq(friends.userId, target.id), eq(friends.friendId, auth.sub))
        )
      );

    if (existing.some((r) => r.status === "blocked")) {
      return NextResponse.json(
        { error: "تعذر إرسال طلب الصداقة لهذا الحساب" },
        { status: 403 }
      );
    }

    if (existing.some((r) => r.status === "accepted")) {
      return NextResponse.json(
        { error: "أنتما صديقان بالفعل" },
        { status: 409 }
      );
    }

    // Strict duplicate prevention: already sent pending request
    if (
      existing.some(
        (r) => r.userId === auth.sub && r.status === "pending"
      )
    ) {
      return NextResponse.json(
        { error: "لقد أرسلت طلب صداقة لهذا المستخدم مسبقاً وهو قيد الانتظار" },
        { status: 409 }
      );
    }

    // If the target already sent an incoming pending request to me, accept it automatically!
    if (
      existing.some(
        (r) => r.userId === target.id && r.status === "pending"
      )
    ) {
      await db
        .delete(friends)
        .where(
          or(
            and(eq(friends.userId, auth.sub), eq(friends.friendId, target.id)),
            and(eq(friends.userId, target.id), eq(friends.friendId, auth.sub))
          )
        );

      await db
        .insert(friends)
        .values([
          { userId: auth.sub, friendId: target.id, status: "accepted" },
          { userId: target.id, friendId: auth.sub, status: "accepted" },
        ])
        .onConflictDoNothing();

      await db.insert(signalingEvents).values({
        fromUserId: auth.sub,
        toUserId: target.id,
        eventType: "friend-updated",
        payload: { action: "accepted", byUserId: auth.sub },
      });

      return NextResponse.json(
        {
          ok: true,
          autoAccepted: true,
          message: `كان لديك طلب وارد من ${target.displayName} وتم قبوله تلقائياً!`,
        },
        { status: 200 }
      );
    }

    await db
      .insert(friends)
      .values({
        userId: auth.sub,
        friendId: target.id,
        status: "pending",
      })
      .onConflictDoNothing();

    await pushUserNotification({
      userId: target.id,
      actorId: auth.sub,
      type: "friend_request",
      title: "طلب صداقة جديد",
      body: `أرسل إليك ${auth.displayName} (@${auth.username}) طلب إضافة كصديق.`,
      meta: { senderId: auth.sub, username: auth.username },
    });

    await db.insert(signalingEvents).values({
      fromUserId: auth.sub,
      toUserId: target.id,
      eventType: "friend-updated",
      payload: { action: "request_sent", byUserId: auth.sub },
    });

    await recordAuditLog({
      actorId: auth.sub,
      targetUserId: target.id,
      action: "friend_request_sent",
      metadata: { targetUsername: target.username },
      req,
    });

    return NextResponse.json(
      { ok: true, message: `تم إرسال طلب الصداقة إلى ${target.displayName}` },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/friends error:", error);
    return NextResponse.json(
      { error: "تعذر إرسال طلب الصداقة" },
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
    const action = String(body.action || "");
    const peerUserId = String(body.peerUserId || "");

    if (
      !peerUserId ||
      ![
        "accept",
        "reject",
        "cancel",
        "block",
        "unblock",
        "remove",
      ].includes(action)
    ) {
      return NextResponse.json(
        { error: "بيانات الإجراء غير صالحة" },
        { status: 400 }
      );
    }

    if (peerUserId === auth.sub) {
      return NextResponse.json({ error: "إجراء غير صالح على حسابك" }, { status: 400 });
    }
    const [peerExists] = await db.select({ id: users.id }).from(users).where(eq(users.id, peerUserId)).limit(1);
    if (!peerExists) {
      return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
    }

    if (action === "cancel") {
      await db
        .delete(friends)
        .where(
          and(
            eq(friends.userId, auth.sub),
            eq(friends.friendId, peerUserId),
            eq(friends.status, "pending")
          )
        );

      await db.insert(signalingEvents).values({
        fromUserId: auth.sub,
        toUserId: peerUserId,
        eventType: "friend-updated",
        payload: { action: "request_cancelled", byUserId: auth.sub },
      });

      await recordAuditLog({
        actorId: auth.sub,
        targetUserId: peerUserId,
        action: "friend_request_cancelled",
        req,
      });

      return NextResponse.json({ ok: true, status: "cancelled" });
    }

    if (action === "accept") {
      // Only the recipient of an existing pending request may accept it.
      const [incomingRequest] = await db
        .select({ id: friends.id })
        .from(friends)
        .where(and(
          eq(friends.userId, peerUserId),
          eq(friends.friendId, auth.sub),
          eq(friends.status, "pending")
        ))
        .limit(1);

      if (!incomingRequest) {
        return NextResponse.json({ error: "لا يوجد طلب صداقة وارد لقبوله" }, { status: 404 });
      }

      await db
        .delete(friends)
        .where(
          or(
            and(eq(friends.userId, auth.sub), eq(friends.friendId, peerUserId)),
            and(eq(friends.userId, peerUserId), eq(friends.friendId, auth.sub))
          )
        );

      await db
        .insert(friends)
        .values([
          { userId: auth.sub, friendId: peerUserId, status: "accepted" },
          { userId: peerUserId, friendId: auth.sub, status: "accepted" },
        ])
        .onConflictDoNothing();

      await pushUserNotification({
        userId: peerUserId,
        actorId: auth.sub,
        type: "friend_accepted",
        title: "تم قبول طلب الصداقة ✅",
        body: `وافق ${auth.displayName} (@${auth.username}) على طلب صداقتك!`,
        meta: { peerId: auth.sub, username: auth.username },
      });

      await db.insert(signalingEvents).values({
        fromUserId: auth.sub,
        toUserId: peerUserId,
        eventType: "friend-updated",
        payload: { action: "accepted", byUserId: auth.sub },
      });

      await recordAuditLog({
        actorId: auth.sub,
        targetUserId: peerUserId,
        action: "friend_request_accepted",
        req,
      });

      return NextResponse.json({ ok: true, status: "accepted" });
    }

    if (action === "block") {
      await db
        .delete(friends)
        .where(
          or(
            and(eq(friends.userId, auth.sub), eq(friends.friendId, peerUserId)),
            and(eq(friends.userId, peerUserId), eq(friends.friendId, auth.sub))
          )
        );

      await db
        .insert(friends)
        .values({
          userId: auth.sub,
          friendId: peerUserId,
          status: "blocked",
        })
        .onConflictDoNothing();

      await pushUserNotification({
        userId: auth.sub,
        type: "block_notice",
        title: "تم حظر المستخدم بنجاح",
        body: "لن يتمكن هذا المستخدم من البحث عنك أو مراسلتك حتى تلغي الحظر.",
      });

      await recordAuditLog({
        actorId: auth.sub,
        targetUserId: peerUserId,
        action: "block_user",
        req,
      });

      return NextResponse.json({ ok: true, status: "blocked" });
    }

    if (action === "unblock") {
      await db
        .delete(friends)
        .where(
          and(
            eq(friends.userId, auth.sub),
            eq(friends.friendId, peerUserId),
            eq(friends.status, "blocked")
          )
        );

      await recordAuditLog({
        actorId: auth.sub,
        targetUserId: peerUserId,
        action: "unblock_user",
        req,
      });

      return NextResponse.json({ ok: true, status: "unblocked" });
    }

    // Reject is valid only for a real incoming pending request.
    const existingPendingIncoming = await db
      .select()
      .from(friends)
      .where(
        and(
          eq(friends.userId, peerUserId),
          eq(friends.friendId, auth.sub),
          eq(friends.status, "pending")
        )
      )
      .limit(1);

    if (action === "reject" && existingPendingIncoming.length === 0) {
      return NextResponse.json({ error: "لا يوجد طلب وارد لرفضه" }, { status: 404 });
    }

    await db
      .delete(friends)
      .where(
        or(
          and(eq(friends.userId, auth.sub), eq(friends.friendId, peerUserId)),
          and(eq(friends.userId, peerUserId), eq(friends.friendId, auth.sub))
        )
      );

    if (existingPendingIncoming.length > 0 || action === "reject") {
      await pushUserNotification({
        userId: peerUserId,
        actorId: auth.sub,
        type: "friend_rejected",
        title: "تحديث بخصوص طلب الصداقة",
        body: `اعتذر ${auth.displayName} عن قبول طلب الإضافة حالياً.`,
      });
    }

    await db.insert(signalingEvents).values({
      fromUserId: auth.sub,
      toUserId: peerUserId,
      eventType: "friend-updated",
      payload: { action: "removed_or_rejected", byUserId: auth.sub },
    });

    await recordAuditLog({
      actorId: auth.sub,
      targetUserId: peerUserId,
      action:
        action === "reject" ? "friend_request_rejected" : "friend_removed",
      req,
    });

    return NextResponse.json({ ok: true, status: "removed" });
  } catch (error) {
    console.error("PATCH /api/friends error:", error);
    return NextResponse.json(
      { error: "تعذر تحديث حالة الصداقة" },
      { status: 500 }
    );
  }
}
