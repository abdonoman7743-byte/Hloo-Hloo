import { NextResponse } from "next/server";
import { db } from "@/db";
import { DEFAULT_PRIVACY_SETTINGS, users } from "@/db/schema";
import { authenticateRequest } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { roleForUser } from "@/lib/roles";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

function sanitizeOwnUser(u: typeof users.$inferSelect) {
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
    presenceStatus: u.presenceStatus,
    lastSeenAt: u.lastSeenAt,
    createdAt: u.createdAt,
  };
}

export async function GET(req: Request) {
  try {
    await ensureSeeded();

    const jwtUser = await authenticateRequest(req);
    if (jwtUser) {
      const [found] = await db
        .select()
        .from(users)
        .where(eq(users.id, jwtUser.sub))
        .limit(1);

      if (found) {
        // Refresh lastSeenAt; if previously marked offline on logout, restore to online on active session load
        const nextPresence =
          found.presenceStatus === "offline" ? "online" : found.presenceStatus;

        await db
          .update(users)
          .set({ presenceStatus: nextPresence, lastSeenAt: new Date() })
          .where(eq(users.id, found.id));

        return NextResponse.json({
          user: sanitizeOwnUser({
            ...found,
            presenceStatus: nextPresence,
            lastSeenAt: new Date(),
          }),
        });
      }
    }

    return NextResponse.json({ user: null }, { status: 401 });
  } catch (error) {
    console.error("GET /api/auth/me error:", error);
    return NextResponse.json(
      { error: "فشل التحقق من الجلسة" },
      { status: 500 }
    );
  }
}
