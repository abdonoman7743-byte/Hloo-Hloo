import { NextResponse } from "next/server";
import { db } from "@/db";
import { friends, messages, signalingEvents, users } from "@/db/schema";
import { authenticateRequest } from "@/lib/auth";
import {
  buildSafeProfileForViewer,
  checkRateLimit,
  getClientIpHint,
  pushUserNotification,
  recordAuditLog,
} from "@/lib/privacy-search";
import { ensureSeeded } from "@/lib/seed";
import type { SafeSearchResultUser } from "@/types/oboud";
import { and, eq, or } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  context: { params: Promise<{ username: string }> }
) {
  try {
    await ensureSeeded();
    const { username } = await context.params;
    const cleanUsername = decodeURIComponent(username)
      .replace(/^@/, "")
      .trim()
      .toLowerCase();

    const auth = await authenticateRequest(req);
    const viewerId = auth?.sub ?? null;

    const [target] = await db
      .select()
      .from(users)
      .where(eq(users.username, cleanUsername))
      .limit(1);

    if (!target) {
      return NextResponse.json(
        { error: "لم يتم العثور على هذا الملف الشخصي" },
        { status: 404 }
      );
    }

    let relationship: SafeSearchResultUser["relationship"] = "none";
    if (viewerId) {
      if (viewerId === target.id) {
        relationship = "self";
      } else {
        const rels = await db
          .select()
          .from(friends)
          .where(
            or(
              and(
                eq(friends.userId, viewerId),
                eq(friends.friendId, target.id)
              ),
              and(
                eq(friends.userId, target.id),
                eq(friends.friendId, viewerId)
              )
            )
          );

        for (const r of rels) {
          if (r.status === "blocked") {
            relationship = "blocked";
            break;
          }
          if (r.status === "accepted") {
            relationship = "friend";
          } else if (r.status === "pending") {
            relationship =
              r.friendId === viewerId ? "incoming_pending" : "outgoing_pending";
          }
        }
      }

      if (viewerId !== target.id) {
        await recordAuditLog({
          actorId: viewerId,
          targetUserId: target.id,
          action: "view_profile",
          metadata: { username: target.username },
          req,
        });
      }
    }

    const safeProfile = buildSafeProfileForViewer({
      target,
      viewerId,
      relationship,
      matchScore: 100,
    });

    return NextResponse.json({
      profile: safeProfile,
      viewerAuthenticated: Boolean(viewerId),
    });
  } catch (error) {
    console.error("GET /api/users/[username] error:", error);
    return NextResponse.json(
      { error: "تعذر تحميل الملف الشخصي" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/users/[username] -> Send a polite Welcome Greeting / Wave ("إرسال تنبيه أو رسالة ترحيب")
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ username: string }> }
) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const ipHint = getClientIpHint(req);
    const rate = checkRateLimit(`wave:${auth.sub}:${ipHint}`, 15, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "لقد أرسلت عدة تحيات متتالية، يرجى الانتظار دقيقة" },
        { status: 429 }
      );
    }

    const { username } = await context.params;
    const cleanUsername = decodeURIComponent(username)
      .replace(/^@/, "")
      .trim()
      .toLowerCase();

    const [target] = await db
      .select()
      .from(users)
      .where(eq(users.username, cleanUsername))
      .limit(1);

    if (!target || target.id === auth.sub) {
      return NextResponse.json(
        { error: "المستخدم غير متاح" },
        { status: 404 }
      );
    }

    const rels = await db
      .select()
      .from(friends)
      .where(
        or(
          and(eq(friends.userId, auth.sub), eq(friends.friendId, target.id)),
          and(eq(friends.userId, target.id), eq(friends.friendId, auth.sub))
        )
      );

    if (rels.some((r) => r.status === "blocked")) {
      return NextResponse.json(
        { error: "لا يمكن إرسال تحية لهذا المستخدم" },
        { status: 403 }
      );
    }

    const isFriend = rels.some((r) => r.status === "accepted");
    const safeCheck = buildSafeProfileForViewer({
      target,
      viewerId: auth.sub,
      relationship: isFriend ? "friend" : "none",
    });

    if (safeCheck.isHiddenPrivate || !safeCheck.canMessageInternally) {
      return NextResponse.json(
        { error: "إعدادات خصوصية هذا المستخدم لا تسمح باستقبال تحيات عامة" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const customNote = String(
      body.greeting ||
        `👋 مرحباً ${target.displayName}! يسعدني التواصل معك عبر منصة اتصل مع عبود.`
    ).slice(0, 220);

    const [createdMsg] = await db
      .insert(messages)
      .values({
        senderId: auth.sub,
        receiverId: target.id,
        type: "text",
        content: customNote,
      })
      .returning();

    await pushUserNotification({
      userId: target.id,
      actorId: auth.sub,
      type: "welcome_wave",
      title: "تحية ترحيب جديدة 👋",
      body: `أرسل إليك ${auth.displayName} (@${auth.username}) رسالة ترحيب ودية.`,
      meta: { senderId: auth.sub, username: auth.username },
    });

    if (createdMsg) {
      await db.insert(signalingEvents).values({
        fromUserId: auth.sub,
        toUserId: target.id,
        eventType: "new-message",
        payload: {
          message: createdMsg,
          senderName: auth.displayName,
        },
      });
    }

    await recordAuditLog({
      actorId: auth.sub,
      targetUserId: target.id,
      action: "welcome_ping",
      metadata: { targetUsername: target.username },
      req,
    });

    return NextResponse.json({
      ok: true,
      message: `تم إرسال تحية الترحيب إلى ${target.displayName} بنجاح!`,
    });
  } catch (error) {
    console.error("POST /api/users/[username] error:", error);
    return NextResponse.json(
      { error: "تعذر إرسال تحية الترحيب" },
      { status: 500 }
    );
  }
}
