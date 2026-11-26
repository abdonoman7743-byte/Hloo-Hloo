import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditLogs, friends, userReports, users } from "@/db/schema";
import { authenticateRequest } from "@/lib/auth";
import {
  checkRateLimit,
  getClientIpHint,
  pushUserNotification,
  recordAuditLog,
} from "@/lib/privacy-search";
import { and, count, desc, eq, or } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const allUsers = await db.select().from(users);
    const userMap = new Map(allUsers.map((u) => [u.id, u]));

    const [myReports, blockedRows, myAuditLogs] = await Promise.all([
      db
        .select()
        .from(userReports)
        .where(eq(userReports.reporterId, auth.sub))
        .orderBy(desc(userReports.createdAt))
        .limit(25),
      db
        .select()
        .from(friends)
        .where(
          and(eq(friends.userId, auth.sub), eq(friends.status, "blocked"))
        ),
      db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.actorId, auth.sub))
        .orderBy(desc(auditLogs.createdAt))
        .limit(30),
    ]);

    const enrichedReports = myReports.map((r) => {
      const target = userMap.get(r.reportedUserId);
      return {
        id: r.id,
        reportedUserId: r.reportedUserId,
        reportedDisplayName: target?.displayName || "مستخدم",
        reportedUsername: target?.username || "unknown",
        reason: r.reason,
        details: r.details,
        status: r.status,
        adminAlertTriggered: r.adminAlertTriggered,
        createdAt: r.createdAt,
      };
    });

    const blockedUsers = blockedRows
      .map((b) => {
        const u = userMap.get(b.friendId);
        if (!u) return null;
        return {
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          avatarUrl: u.avatarUrl,
          blockedAt: b.createdAt,
        };
      })
      .filter(Boolean);

    return NextResponse.json({
      reports: enrichedReports,
      blockedUsers,
      auditLogs: myAuditLogs,
    });
  } catch (error) {
    console.error("GET /api/reports error:", error);
    return NextResponse.json(
      { error: "تعذر جلب سجل البلاغات والأمان" },
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

    const ipHint = getClientIpHint(req);
    const rate = checkRateLimit(`report:${auth.sub}:${ipHint}`, 12, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "تم تجاوز الحد المسموح لتقديم البلاغات مؤقتاً" },
        { status: 429 }
      );
    }

    const body = await req.json();
    const reportedUserId = String(body.reportedUserId || "").trim();
    const reason = String(body.reason || "spam").trim();
    const details = String(body.details || "")
      .trim()
      .slice(0, 500);
    const alsoBlock = Boolean(body.alsoBlock);

    if (!reportedUserId || reportedUserId === auth.sub) {
      return NextResponse.json(
        { error: "بيانات البلاغ غير صالحة" },
        { status: 400 }
      );
    }

    const [target] = await db
      .select()
      .from(users)
      .where(eq(users.id, reportedUserId))
      .limit(1);

    if (!target) {
      return NextResponse.json(
        { error: "المستخدم المبلّغ عنه غير موجود" },
        { status: 404 }
      );
    }

    const [[priorCountRow]] = await Promise.all([
      db
        .select({ value: count() })
        .from(userReports)
        .where(eq(userReports.reportedUserId, reportedUserId)),
    ]);

    const totalReportsAfter = (priorCountRow?.value ?? 0) + 1;
    const escalateToAdmin = totalReportsAfter >= 2;

    const [createdReport] = await db
      .insert(userReports)
      .values({
        reporterId: auth.sub,
        reportedUserId,
        reason,
        details: details || null,
        status: escalateToAdmin ? "escalated_admin" : "open",
        adminAlertTriggered: escalateToAdmin,
      })
      .returning();

    if (alsoBlock) {
      await db
        .delete(friends)
        .where(
          or(
            and(
              eq(friends.userId, auth.sub),
              eq(friends.friendId, reportedUserId)
            ),
            and(
              eq(friends.userId, reportedUserId),
              eq(friends.friendId, auth.sub)
            )
          )
        );

      await db
        .insert(friends)
        .values({
          userId: auth.sub,
          friendId: reportedUserId,
          status: "blocked",
        })
        .onConflictDoNothing();
    }

    await pushUserNotification({
      userId: auth.sub,
      type: "report_alert",
      title: escalateToAdmin
        ? "تم استلام البلاغ وتنبيه الإدارة الفوري 🛡️"
        : "تم تسجيل البلاغ بنجاح",
      body: escalateToAdmin
        ? `تم تسجيل بلاغك ضد @${target.username} ورفع تنبيه عاجل للإدارة لتكرار البلاغات.`
        : `شكراً لحرصك، تم تسجيل بلاغك سرّياً للمراجعة من فريق الأمان${
            alsoBlock ? " وتم حظر الحساب." : "."
          }`,
      meta: { reportId: createdReport?.id, escalated: escalateToAdmin },
    });

    await recordAuditLog({
      actorId: auth.sub,
      targetUserId: reportedUserId,
      action: "report_user",
      metadata: {
        reason,
        alsoBlock,
        escalatedToAdmin: escalateToAdmin,
      },
      req,
    });

    return NextResponse.json(
      {
        ok: true,
        report: createdReport,
        escalatedToAdmin: escalateToAdmin,
        message: escalateToAdmin
          ? "تم تسجيل البلاغ وإرسال تنبيه فوري للإدارة لتكرار السلوك المبلّغ عنه"
          : "تم إرسال البلاغ بنجاح إلى فريق الأمان",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/reports error:", error);
    return NextResponse.json(
      { error: "حدث خطأ أثناء تسجيل البلاغ" },
      { status: 500 }
    );
  }
}
