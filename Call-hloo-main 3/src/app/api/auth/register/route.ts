import { NextResponse } from "next/server";
import { db } from "@/db";
import { DEFAULT_PRIVACY_SETTINGS, users } from "@/db/schema";
import { hashPassword, signJwtToken } from "@/lib/auth";
import { makeSvgAvatar } from "@/lib/avatars";
import {
  broadcastGlobalRealtimeEvent,
  pushUserNotification,
  recordAuditLog,
} from "@/lib/privacy-search";
import { ensureSeeded } from "@/lib/seed";
import { eq, or, sql } from "drizzle-orm";
import { SESSION_COOKIE } from "@/lib/roles";

export const dynamic = "force-dynamic";

const AVATAR_PALETTES: Array<[string, string]> = [
  ["#059669", "#0D9488"],
  ["#4F46E5", "#7C3AED"],
  ["#0284C7", "#2563EB"],
  ["#D97706", "#EA580C"],
];

export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const body = await req.json();

    const username = String(body.username || "")
      .trim()
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9_.-]/g, "");
    const displayName = String(body.displayName || body.username || "").trim();
    const firstName =
      String(body.firstName || "").trim() ||
      displayName.split(/\s+/)[0] ||
      username;
    const email = String(body.email || "").trim().toLowerCase();
    const phone = body.phone
      ? String(body.phone).trim().replace(/[\s-]/g, "")
      : null;
    const city = body.city ? String(body.city).trim() : "الرياض";
    const groupTag = body.groupTag
      ? String(body.groupTag).trim()
      : "مجتمع عبود التقني";
    const password = String(body.password || "");

    if (!username || username.length < 3) {
      return NextResponse.json(
        {
          error:
            "اسم المستخدم يجب أن يتكون من 3 أحرف إنجليزية أو أرقام على الأقل",
        },
        { status: 400 }
      );
    }
    if (!displayName) {
      return NextResponse.json(
        { error: "يرجى إدخال الاسم الكامل للعرض" },
        { status: 400 }
      );
    }
    if (!email.includes("@")) {
      return NextResponse.json(
        { error: "يرجى إدخال بريد إلكتروني صالح" },
        { status: 400 }
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: "كلمة المرور يجب ألا تقل عن 6 خانات" },
        { status: 400 }
      );
    }

    const existing = await db
      .select()
      .from(users)
      .where(
        or(
          sql`LOWER(${users.username}) = ${username}`,
          sql`LOWER(${users.email}) = ${email}`
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "اسم المستخدم أو البريد الإلكتروني مسجل مسبقاً" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const palette =
      AVATAR_PALETTES[username.length % AVATAR_PALETTES.length] ?? [
        "#059669",
        "#0D9488",
      ];
    const initials =
      displayName
        .split(/\s+/)
        .map((part) => part[0] || "")
        .join("")
        .slice(0, 2) || username.slice(0, 2).toUpperCase();

    const [created] = await db
      .insert(users)
      .values({
        username,
        firstName,
        displayName,
        email,
        phone: phone || null,
        city,
        groupTag,
        passwordHash,
        avatarUrl: makeSvgAvatar(initials, palette[0], palette[1]),
        bio: "عضو في منصة اتصل مع عبود • متاح للتواصل",
        availabilityMode: "public",
        privacySettings: DEFAULT_PRIVACY_SETTINGS,
        presenceStatus: "online",
        lastSeenAt: new Date(),
      })
      .returning();

    await pushUserNotification({
      userId: created.id,
      type: "welcome_wave",
      title: "أهلاً بك في اتصل مع عبود!",
      body: "حسابك الآن متصل وقابل للاكتشاف في قسم «اكتشف الأشخاص» وفق إعدادات خصوصيتك.",
    });

    // Broadcast user-registered event so all active devices auto-refresh their global discovery list!
    await broadcastGlobalRealtimeEvent({
      fromUserId: created.id,
      eventType: "user-registered",
      payload: {
        userId: created.id,
        username: created.username,
        displayName: created.displayName,
        avatarUrl: created.avatarUrl,
      },
    });

    await recordAuditLog({
      actorId: created.id,
      action: "user_register",
      metadata: { username: created.username },
      req,
    });

    const token = await signJwtToken({
      sub: created.id,
      username: created.username,
      email: created.email,
      displayName: created.displayName,
    });

    const response = NextResponse.json(
      {
        token,
        user: {
          id: created.id,
          username: created.username,
          firstName: created.firstName,
          displayName: created.displayName,
          email: created.email,
          phone: created.phone,
          city: created.city,
          groupTag: created.groupTag,
          availabilityMode: created.availabilityMode,
          privacySettings: created.privacySettings,
          avatarUrl: created.avatarUrl,
          bio: created.bio,
          presenceStatus: created.presenceStatus,
          lastSeenAt: created.lastSeenAt,
        },
      },
      { status: 201 }
    );
    response.cookies.set("oboud_jwt", token, SESSION_COOKIE);
    return response;
  } catch (error) {
    console.error("POST /api/auth/register error:", error);
    return NextResponse.json(
      { error: "حدث خطأ أثناء إنشاء الحساب" },
      { status: 500 }
    );
  }
}
