import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  DEFAULT_PRIVACY_SETTINGS,
  users,
  type AvailabilityMode,
  type PrivacyScope,
  type PrivacySettings,
} from "@/db/schema";
import { authenticateRequest, hashPassword, verifyPassword } from "@/lib/auth";
import {
  broadcastGlobalRealtimeEvent,
  getResolvedPrivacy,
  recordAuditLog,
} from "@/lib/privacy-search";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

function sanitizeScope(val: unknown, fallback: PrivacyScope): PrivacyScope {
  if (val === "everyone" || val === "friends" || val === "nobody") return val;
  return fallback;
}

export async function PATCH(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const body = await req.json();
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.id, auth.sub))
      .limit(1);

    if (!existing) {
      return NextResponse.json(
        { error: "المستخدم غير موجود" },
        { status: 404 }
      );
    }

    let nextPasswordHash = existing.passwordHash;
    if (body.newPassword) {
      const currentPassword = String(body.currentPassword || "");
      const newPassword = String(body.newPassword || "");

      if (newPassword.length < 6) {
        return NextResponse.json(
          { error: "كلمة المرور الجديدة يجب ألا تقل عن 6 خانات" },
          { status: 400 }
        );
      }

      const validCurrent = await verifyPassword(
        currentPassword,
        existing.passwordHash
      );
      if (!validCurrent) {
        return NextResponse.json(
          { error: "كلمة المرور الحالية غير صحيحة" },
          { status: 400 }
        );
      }

      nextPasswordHash = await hashPassword(newPassword);
    }

    const displayName =
      typeof body.displayName === "string" && body.displayName.trim()
        ? body.displayName.trim()
        : existing.displayName;

    const firstName =
      typeof body.firstName === "string" && body.firstName.trim()
        ? body.firstName.trim()
        : displayName.split(/\s+/)[0] || existing.firstName;

    const bio =
      typeof body.bio === "string" ? body.bio.trim() : existing.bio;

    const phone =
      typeof body.phone === "string"
        ? body.phone.trim().replace(/[\s-]/g, "") || null
        : existing.phone;

    const city =
      typeof body.city === "string" && body.city.trim()
        ? body.city.trim()
        : existing.city;

    const groupTag =
      typeof body.groupTag === "string" && body.groupTag.trim()
        ? body.groupTag.trim()
        : existing.groupTag;

    const candidateAvatar =
      typeof body.avatarUrl === "string" ? body.avatarUrl.trim() : "";
    // Only http(s) and inline image data URLs are accepted (no javascript: etc).
    if (
      candidateAvatar &&
      (candidateAvatar.length > 3_000_000 ||
        !/^(https?:\/\/|data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,])/i.test(
          candidateAvatar
        ))
    ) {
      return NextResponse.json(
        { error: "رابط الصورة الشخصية غير صالح" },
        { status: 400 }
      );
    }
    const avatarUrl = candidateAvatar ? candidateAvatar : existing.avatarUrl;

    const validPresence = ["online", "unavailable", "in_call", "offline", "busy"];
    const normalizedPresence =
      body.presenceStatus === "busy" ? "unavailable" : body.presenceStatus;
    const presenceStatus =
      typeof normalizedPresence === "string" &&
      validPresence.includes(normalizedPresence)
        ? normalizedPresence
        : existing.presenceStatus;

    const validAvailability: AvailabilityMode[] = [
      "public",
      "friends",
      "private",
    ];
    const availabilityMode: AvailabilityMode = validAvailability.includes(
      body.availabilityMode
    )
      ? body.availabilityMode
      : existing.availabilityMode || "public";

    const currentPriv = getResolvedPrivacy(existing);
    let nextPrivacy: PrivacySettings = currentPriv;

    if (body.privacySettings && typeof body.privacySettings === "object") {
      const p = body.privacySettings;
      nextPrivacy = {
        searchVisibility: sanitizeScope(
          p.searchVisibility,
          currentPriv.searchVisibility
        ),
        nameVisibility: sanitizeScope(
          p.nameVisibility,
          currentPriv.nameVisibility
        ),
        avatarVisibility: sanitizeScope(
          p.avatarVisibility,
          currentPriv.avatarVisibility
        ),
        presenceVisibility: sanitizeScope(
          p.presenceVisibility,
          currentPriv.presenceVisibility || "everyone"
        ),
        messagePermission: sanitizeScope(
          p.messagePermission,
          currentPriv.messagePermission
        ),
        callPermission: sanitizeScope(
          p.callPermission,
          currentPriv.callPermission || "everyone"
        ),
        phoneVisibility: sanitizeScope(
          p.phoneVisibility,
          currentPriv.phoneVisibility
        ),
        emailVisibility: sanitizeScope(
          p.emailVisibility,
          currentPriv.emailVisibility
        ),
        allowedContactMethods: {
          internalMessage:
            typeof p.allowedContactMethods?.internalMessage === "boolean"
              ? p.allowedContactMethods.internalMessage
              : currentPriv.allowedContactMethods.internalMessage,
          email:
            typeof p.allowedContactMethods?.email === "boolean"
              ? p.allowedContactMethods.email
              : currentPriv.allowedContactMethods.email,
          phone:
            typeof p.allowedContactMethods?.phone === "boolean"
              ? p.allowedContactMethods.phone
              : currentPriv.allowedContactMethods.phone,
        },
      };
    }

    const now = new Date();
    const [updated] = await db
      .update(users)
      .set({
        firstName,
        displayName,
        bio,
        phone,
        city,
        groupTag,
        avatarUrl,
        presenceStatus,
        availabilityMode,
        privacySettings: nextPrivacy,
        passwordHash: nextPasswordHash,
        lastSeenAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, auth.sub))
      .returning();

    await broadcastGlobalRealtimeEvent({
      fromUserId: auth.sub,
      eventType: "presence-changed",
      payload: {
        userId: auth.sub,
        presenceStatus,
        lastSeenAt: now.toISOString(),
      },
    });

    await recordAuditLog({
      actorId: auth.sub,
      action: "privacy_or_profile_update",
      metadata: {
        availabilityMode,
        presenceStatus,
        searchVisibility: nextPrivacy.searchVisibility,
      },
      req,
    });

    return NextResponse.json({
      ok: true,
      user: {
        id: updated.id,
        username: updated.username,
        firstName: updated.firstName,
        displayName: updated.displayName,
        email: updated.email,
        phone: updated.phone,
        city: updated.city,
        groupTag: updated.groupTag,
        availabilityMode: updated.availabilityMode || "public",
        privacySettings: updated.privacySettings || DEFAULT_PRIVACY_SETTINGS,
        avatarUrl: updated.avatarUrl,
        bio: updated.bio,
        presenceStatus: updated.presenceStatus,
        lastSeenAt: updated.lastSeenAt,
      },
    });
  } catch (error) {
    console.error("PATCH /api/profile error:", error);
    return NextResponse.json(
      { error: "تعذر تحديث الملف الشخصي" },
      { status: 500 }
    );
  }
}
