import { NextResponse } from "next/server";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { authenticateRequest } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { and, count, desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureSeeded();
    const auth = await authenticateRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const [items, [unreadRow]] = await Promise.all([
      db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, auth.sub))
        .orderBy(desc(notifications.createdAt))
        .limit(40),
      db
        .select({ value: count() })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, auth.sub),
            eq(notifications.isRead, false)
          )
        ),
    ]);

    return NextResponse.json({
      notifications: items,
      unreadCount: unreadRow?.value ?? 0,
    });
  } catch (error) {
    console.error("GET /api/notifications error:", error);
    return NextResponse.json(
      { error: "تعذر جلب الإشعارات" },
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

    const body = await req.json().catch(() => ({}));
    const notificationId = body.notificationId
      ? String(body.notificationId)
      : null;

    if (notificationId) {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(
          and(
            eq(notifications.id, notificationId),
            eq(notifications.userId, auth.sub)
          )
        );
    } else {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.userId, auth.sub));
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/notifications error:", error);
    return NextResponse.json(
      { error: "تعذر تحديث حالة الإشعارات" },
      { status: 500 }
    );
  }
}
