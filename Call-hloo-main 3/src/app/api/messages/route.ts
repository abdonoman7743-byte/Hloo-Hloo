import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  friends,
  messages,
  signalingEvents,
  users,
  type MediaMeta,
} from "@/db/schema";
import { authenticateRequest } from "@/lib/auth";
import {
  getResolvedPrivacy,
  isScopeAllowed,
  pushUserNotification,
} from "@/lib/privacy-search";
import { PUBLIC_TEAM_GROUP_ID } from "@/types/oboud";
import { and, asc, count, eq, ne, or } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function ensureGroupSeedMessages() {
  const [existing] = await db
    .select({ value: count() })
    .from(messages)
    .where(eq(messages.groupId, PUBLIC_TEAM_GROUP_ID));

  if ((existing?.value ?? 0) > 0) return;

  const allUsers = await db.select().from(users);
  const byName = Object.fromEntries(allUsers.map((u) => [u.username, u]));
  const oboud = byName["oboud"];
  const sara = byName["sara"];
  const omar = byName["omar"];

  if (!oboud || !sara || !omar) return;
  const now = Date.now();

  await db.insert(messages).values([
    {
      senderId: oboud.id,
      groupId: PUBLIC_TEAM_GROUP_ID,
      type: "text",
      content:
        "مرحباً بالجميع في غرفة فريق عبود العامة! يمكنكم هنا مشاركة التحديثات والصور والرسائل الصوتية من الجوال أو سطح المكتب.",
      createdAt: new Date(now - 1000 * 60 * 40),
    },
    {
      senderId: sara.id,
      groupId: PUBLIC_TEAM_GROUP_ID,
      type: "text",
      content:
        "تم تحسين صفحة تسجيل الدخول وتجربة التصفح على الجوال لتكون سريعة ومريحة بيد واحدة.",
      createdAt: new Date(now - 1000 * 60 * 25),
    },
    {
      senderId: omar.id,
      groupId: PUBLIC_TEAM_GROUP_ID,
      type: "text",
      content:
        "ممتاز! خوادم الإشارات و Coturn TLS جاهزة بالكامل لاستقبال المكالمات المباشرة.",
      createdAt: new Date(now - 1000 * 60 * 12),
    },
  ]);
}

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const url = new URL(req.url);
    const groupId = url.searchParams.get("groupId");
    const peerId = url.searchParams.get("peerId");

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

    if (groupId) {
      if (groupId !== PUBLIC_TEAM_GROUP_ID) {
        return NextResponse.json({ error: "الغرفة غير موجودة أو غير متاحة" }, { status: 404 });
      }
      if (groupId === PUBLIC_TEAM_GROUP_ID) {
        await ensureGroupSeedMessages();
      }
      const list = await db
        .select()
        .from(messages)
        .where(eq(messages.groupId, groupId))
        .orderBy(asc(messages.createdAt));

      return NextResponse.json({
        messages: list.map((m) => ({
          ...m,
          sender: userMap.get(m.senderId) ?? null,
        })),
      });
    }

    if (!peerId) {
      return NextResponse.json(
        { error: "يرجى تحديد معرف الطرف الآخر peerId أو الغرفة groupId" },
        { status: 400 }
      );
    }

    const [peer] = await db.select().from(users).where(eq(users.id, peerId)).limit(1);
    if (!peer) return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
    const relationRows = await db.select().from(friends).where(or(
      and(eq(friends.userId, auth.sub), eq(friends.friendId, peerId)),
      and(eq(friends.userId, peerId), eq(friends.friendId, auth.sub))
    ));
    if (relationRows.some((r) => r.status === "blocked")) {
      return NextResponse.json({ error: "لا يمكن الوصول إلى هذه المحادثة" }, { status: 403 });
    }
    const isPeerFriend = relationRows.some((r) => r.status === "accepted");
    const peerPrivacy = getResolvedPrivacy(peer);
    if (!peerPrivacy.allowedContactMethods.internalMessage ||
        !isScopeAllowed(peerPrivacy.messagePermission, false, isPeerFriend) ||
        (peer.availabilityMode === "private" && !isPeerFriend)) {
      return NextResponse.json({ error: "هذه المحادثة غير متاحة وفق إعدادات الخصوصية" }, { status: 403 });
    }

    const list = await db
      .select()
      .from(messages)
      .where(
        or(
          and(
            eq(messages.senderId, auth.sub),
            eq(messages.receiverId, peerId)
          ),
          and(
            eq(messages.senderId, peerId),
            eq(messages.receiverId, auth.sub)
          )
        )
      )
      .orderBy(asc(messages.createdAt));

    return NextResponse.json({
      messages: list.map((m) => ({
        ...m,
        sender: userMap.get(m.senderId) ?? null,
      })),
    });
  } catch (error) {
    console.error("GET /api/messages error:", error);
    return NextResponse.json(
      { error: "تعذر جلب الرسائل" },
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
    const receiverId = body.receiverId ? String(body.receiverId).trim() : null;
    const groupId = body.groupId ? String(body.groupId).trim() : null;
    const rawType = String(body.type || "text");
    const validTypes = ["text", "image", "audio", "video"] as const;
    const type = validTypes.includes(rawType as (typeof validTypes)[number])
      ? (rawType as (typeof validTypes)[number])
      : "text";
    const content = String(body.content || "").trim();
    const mediaMeta = (body.mediaMeta || null) as MediaMeta | null;
    const maxContentLength = type === "text" ? 10_000 : 12_000_000;

    if ((!receiverId && !groupId) || !content || content.length > maxContentLength) {
      return NextResponse.json(
        { error: "المستلم ومحتوى الرسالة مطلوبان" },
        { status: 400 }
      );
    }

    if (groupId && groupId !== PUBLIC_TEAM_GROUP_ID) {
      return NextResponse.json({ error: "الغرفة غير موجودة أو غير متاحة" }, { status: 404 });
    }

    if (receiverId && !groupId) {
      const [recipient] = await db
        .select()
        .from(users)
        .where(eq(users.id, receiverId))
        .limit(1);

      if (!recipient) {
        return NextResponse.json(
          { error: "المستلم غير موجود" },
          { status: 404 }
        );
      }

      const rels = await db
        .select()
        .from(friends)
        .where(
          or(
            and(
              eq(friends.userId, auth.sub),
              eq(friends.friendId, receiverId)
            ),
            and(
              eq(friends.userId, receiverId),
              eq(friends.friendId, auth.sub)
            )
          )
        );

      if (rels.some((r) => r.status === "blocked")) {
        return NextResponse.json(
          { error: "لا يمكن إرسال رسائل لهذا الحساب بسبب الحظر" },
          { status: 403 }
        );
      }

      const isFriend = rels.some((r) => r.status === "accepted");
      const priv = getResolvedPrivacy(recipient);
      const allowedToMessage =
        priv.allowedContactMethods.internalMessage &&
        isScopeAllowed(priv.messagePermission, false, isFriend) &&
        (recipient.availabilityMode !== "private" || isFriend);

      if (!allowedToMessage) {
        return NextResponse.json(
          {
            error:
              "إعدادات خصوصية هذا المستخدم تقيّد استقبال الرسائل للأصدقاء فقط",
          },
          { status: 403 }
        );
      }
    }

    const [senderProfile] = await db
      .select()
      .from(users)
      .where(eq(users.id, auth.sub))
      .limit(1);

    const [created] = await db
      .insert(messages)
      .values({
        senderId: auth.sub,
        receiverId: groupId ? null : receiverId,
        groupId: groupId || null,
        type,
        content,
        mediaMeta: mediaMeta ?? undefined,
      })
      .returning();

    const enrichedMessage = {
      ...created,
      sender: senderProfile
        ? {
            id: senderProfile.id,
            username: senderProfile.username,
            displayName: senderProfile.displayName,
            avatarUrl: senderProfile.avatarUrl,
          }
        : null,
    };

    if (created) {
      if (groupId) {
        const peers = await db
          .select({ id: users.id })
          .from(users)
          .where(ne(users.id, auth.sub));

        if (peers.length > 0) {
          await db.insert(signalingEvents).values(
            peers.map((p) => ({
              fromUserId: auth.sub,
              toUserId: p.id,
              eventType: "new-message",
              payload: {
                message: enrichedMessage,
                senderName: auth.displayName,
                groupId,
              },
            }))
          );
        }
      } else if (receiverId) {
        await db.insert(signalingEvents).values({
          fromUserId: auth.sub,
          toUserId: receiverId,
          eventType: "new-message",
          payload: {
            message: enrichedMessage,
            senderName: auth.displayName,
          },
        });

        await pushUserNotification({
          userId: receiverId,
          actorId: auth.sub,
          type: "new_message",
          title: `رسالة جديدة من ${auth.displayName}`,
          body:
            type === "image"
              ? "📷 أرسل إليك صورة مرفقة"
              : type === "audio"
              ? "🎙️ أرسل إليك رسالة صوتية"
              : content.slice(0, 90),
          meta: { senderId: auth.sub, username: auth.username },
        });
      }
    }

    return NextResponse.json({ message: enrichedMessage }, { status: 201 });
  } catch (error) {
    console.error("POST /api/messages error:", error);
    return NextResponse.json(
      { error: "تعذر إرسال الرسالة" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "معرف الرسالة مطلوب" },
        { status: 400 }
      );
    }

    await db
      .delete(messages)
      .where(and(eq(messages.id, id), eq(messages.senderId, auth.sub)));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/messages error:", error);
    return NextResponse.json(
      { error: "تعذر حذف الرسالة" },
      { status: 500 }
    );
  }
}
