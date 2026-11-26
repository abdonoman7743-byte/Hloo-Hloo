import { NextResponse } from "next/server";
import { db } from "@/db";
import { DEFAULT_PRIVACY_SETTINGS, users } from "@/db/schema";
import { signJwtToken, verifyPassword } from "@/lib/auth";
import {
  broadcastGlobalRealtimeEvent,
  checkRateLimit,
  getClientIpHint,
  recordAuditLog,
} from "@/lib/privacy-search";
import { ensureSeeded } from "@/lib/seed";
import { roleForUser, SESSION_COOKIE } from "@/lib/roles";
import { eq, or, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

function formatOwnUser(u: typeof users.$inferSelect) {
  return {
    role: roleForUser(u),
    id: u.id,
    username: u.username,
    firstName: u.firstName || u.displayName.trim().split(/\s+/)[0] || null,
    displayName: u.displayName,
    email: u.email,
    phone: u.phone,
    city: u.city,
    groupTag: u.groupTag,
    availabilityMode: u.availabilityMode || "public",
    privacySettings: u.privacySettings || DEFAULT_PRIVACY_SETTINGS,
    avatarUrl: u.avatarUrl,
    bio: u.bio,
    presenceStatus: "online",
    lastSeenAt: new Date(),
  };
}

export async function POST(req: Request) {
  try {
    await ensureSeeded();

    const ipHint = getClientIpHint(req);
    const rate = checkRateLimit(`login:${ipHint}`, 30, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "محاولات دخول متكررة، يرجى المحاولة بعد دقيقة للحماية" },
        { status: 429 }
      );
    }

    const body = await req.json();
    const rawIdentifier = String(body.identifier || body.email || "").trim();
    const identifier = rawIdentifier.toLowerCase().replace(/^@/, "");
    const normalizedPhone = rawIdentifier.replace(/[\s-]/g, "");
    const password = String(body.password || "");

    if (!identifier || !password) {
      return NextResponse.json(
        {
          error:
            "يرجى إدخال البريد الإلكتروني أو رقم الهاتف أو اسم المستخدم وكلمة المرور",
        },
        { status: 400 }
      );
    }

    const [found] = await db
      .select()
      .from(users)
      .where(
        or(
          sql`LOWER(${users.email}) = ${identifier}`,
          sql`LOWER(${users.username}) = ${identifier}`,
          eq(users.phone, normalizedPhone)
        )
      )
      .limit(1);

    if (!found) {
      return NextResponse.json(
        { error: "بيانات الدخول غير صحيحة" },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(password, found.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "كلمة المرور غير صحيحة" },
        { status: 401 }
      );
    }

    await db
      .update(users)
      .set({ presenceStatus: "online", lastSeenAt: new Date() })
      .where(eq(users.id, found.id));

    await broadcastGlobalRealtimeEvent({
      fromUserId: found.id,
      eventType: "presence-changed",
      payload: {
        userId: found.id,
        presenceStatus: "online",
        lastSeenAt: new Date().toISOString(),
      },
    });

    const token = await signJwtToken({
      sub: found.id,
      username: found.username,
      email: found.email,
      displayName: found.displayName,
    });

    await recordAuditLog({
      actorId: found.id,
      action: "user_login",
      metadata: {
        method: identifier.includes("@") ? "email" : "handle_or_phone",
      },
      req,
    });

    const res = NextResponse.json({
      token,
      user: formatOwnUser(found),
    });
    res.cookies.set("oboud_jwt", token, SESSION_COOKIE);
    return res;
  } catch (error) {
    console.error("POST /api/auth/login error:", error);
    return NextResponse.json(
      { error: "حدث خطأ أثناء تسجيل الدخول" },
      { status: 500 }
    );
  }
}
