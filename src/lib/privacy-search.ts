import { db } from "@/db";
import {
  auditLogs,
  DEFAULT_PRIVACY_SETTINGS,
  notifications,
  signalingEvents,
  users,
  type PrivacyScope,
  type PrivacySettings,
  type User,
} from "@/db/schema";
import { makeSvgAvatar } from "./avatars";
import type { SafeSearchResultUser } from "@/types/oboud";
import { and, gte, ne } from "drizzle-orm";

// Active session heartbeat window: 90 seconds (clients ping every 15s)
export const LIVE_PRESENCE_TIMEOUT_MS = 90_000;

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  maxRequests = 60,
  windowMs = 60_000
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }
  if (bucket.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }
  bucket.count += 1;
  return { allowed: true, remaining: maxRequests - bucket.count };
}

export function getClientIpHint(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    return xff.split(",")[0]?.trim() || "local";
  }
  return req.headers.get("x-real-ip") || "127.0.0.1";
}

export async function recordAuditLog(params: {
  actorId: string | null;
  targetUserId?: string | null;
  action: string;
  metadata?: Record<string, unknown>;
  req?: Request;
}) {
  try {
    await db.insert(auditLogs).values({
      actorId: params.actorId || null,
      targetUserId: params.targetUserId || null,
      action: params.action,
      metadata: params.metadata ?? {},
      ipHint: params.req ? getClientIpHint(params.req) : null,
    });
  } catch {
    // Non-blocking audit log safeguard
  }
}

export async function pushUserNotification(params: {
  userId: string;
  actorId?: string | null;
  type: string;
  title: string;
  body: string;
  meta?: Record<string, unknown>;
}) {
  try {
    const [created] = await db
      .insert(notifications)
      .values({
        userId: params.userId,
        actorId: params.actorId || null,
        type: params.type,
        title: params.title,
        body: params.body,
        meta: params.meta ?? {},
      })
      .returning();

    if (created && params.actorId && params.actorId !== params.userId) {
      await db.insert(signalingEvents).values({
        fromUserId: params.actorId,
        toUserId: params.userId,
        eventType: "new-notification",
        payload: { notification: created },
      });
    }

    return created;
  } catch {
    return null;
  }
}

/**
 * Broadcasts a realtime signaling event (e.g. user-registered, presence-changed)
 * to all recently active users so open devices update automatically without reload.
 */
export async function broadcastGlobalRealtimeEvent(params: {
  fromUserId: string;
  eventType: string;
  payload: Record<string, unknown>;
}) {
  try {
    const activeSince = new Date(Date.now() - 5 * 60_000);
    const activePeers = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          ne(users.id, params.fromUserId),
          gte(users.lastSeenAt, activeSince)
        )
      );

    if (activePeers.length > 0) {
      await db.insert(signalingEvents).values(
        activePeers.map((p) => ({
          fromUserId: params.fromUserId,
          toUserId: p.id,
          eventType: params.eventType,
          payload: params.payload,
        }))
      );
    }
  } catch {
    // Non-fatal broadcast safeguard
  }
}

export function getResolvedPrivacy(u: User): PrivacySettings {
  const raw = u.privacySettings;
  if (!raw) return DEFAULT_PRIVACY_SETTINGS;
  return {
    searchVisibility: raw.searchVisibility || "everyone",
    nameVisibility: raw.nameVisibility || "everyone",
    avatarVisibility: raw.avatarVisibility || "everyone",
    presenceVisibility: raw.presenceVisibility || "everyone",
    messagePermission: raw.messagePermission || "everyone",
    callPermission: raw.callPermission || "everyone",
    phoneVisibility: raw.phoneVisibility || "friends",
    emailVisibility: raw.emailVisibility || "friends",
    allowedContactMethods: {
      internalMessage: raw.allowedContactMethods?.internalMessage ?? true,
      email: raw.allowedContactMethods?.email ?? false,
      phone: raw.allowedContactMethods?.phone ?? false,
    },
  };
}

export function isScopeAllowed(
  scope: PrivacyScope | undefined,
  isSelf: boolean,
  isFriend: boolean
): boolean {
  const effective = scope || "everyone";
  if (isSelf) return true;
  if (effective === "everyone") return true;
  if (effective === "friends") return isFriend;
  return false;
}

/**
 * Computes true real-time presence status across all 5 states:
 * - "online" (متصل الآن)
 * - "in_call" (مشغول بمكالمة)
 * - "unavailable" (غير متاح)
 * - "offline" (غير متصل + آخر ظهور lastSeenAt)
 */
export function computeLivePresenceForViewer(params: {
  target: User;
  isSelf: boolean;
  isFriend: boolean;
  nowMs?: number;
}): {
  presenceStatus: "online" | "offline" | "in_call" | "unavailable";
  lastSeenAt: string | null;
  presenceHiddenByPrivacy: boolean;
} {
  const { target, isSelf, isFriend, nowMs = Date.now() } = params;
  const privacy = getResolvedPrivacy(target);
  const canSeePresence =
    isSelf ||
    (target.availabilityMode !== "private" &&
      isScopeAllowed(privacy.presenceVisibility, isSelf, isFriend));

  if (!canSeePresence) {
    return {
      presenceStatus: "unavailable",
      lastSeenAt: null,
      presenceHiddenByPrivacy: true,
    };
  }

  const lastSeenDate = target.lastSeenAt
    ? new Date(target.lastSeenAt)
    : new Date(0);
  const lastSeenIso = lastSeenDate.toISOString();
  const ageMs = nowMs - lastSeenDate.getTime();
  const isFreshHeartbeat = ageMs <= LIVE_PRESENCE_TIMEOUT_MS;

  if (target.presenceStatus === "offline" || !isFreshHeartbeat) {
    return {
      presenceStatus: "offline",
      lastSeenAt: lastSeenIso,
      presenceHiddenByPrivacy: false,
    };
  }

  if (target.presenceStatus === "in_call") {
    return {
      presenceStatus: "in_call",
      lastSeenAt: lastSeenIso,
      presenceHiddenByPrivacy: false,
    };
  }

  if (
    target.presenceStatus === "unavailable" ||
    target.presenceStatus === "busy"
  ) {
    return {
      presenceStatus: "unavailable",
      lastSeenAt: lastSeenIso,
      presenceHiddenByPrivacy: false,
    };
  }

  return {
    presenceStatus: "online",
    lastSeenAt: lastSeenIso,
    presenceHiddenByPrivacy: false,
  };
}

export function normalizeSearchText(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/(.)\1{2,}/g, "$1$1");
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) matrix[i]![0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0]![j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost
      );
    }
  }
  return matrix[a.length]![b.length]!;
}

export function computeFieldMatchScore(
  queryRaw: string,
  targetRaw: string
): number {
  const q = normalizeSearchText(queryRaw.replace(/^@/, ""));
  const t = normalizeSearchText(targetRaw);
  if (!q || !t) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 92;
  if (t.includes(q)) return 82;

  const qTokens = q.split(/\s+/).filter(Boolean);
  const tTokens = t.split(/[\s_.-]+/).filter(Boolean);

  let bestTokenScore = 0;
  for (const qt of qTokens) {
    for (const tt of tTokens) {
      if (tt === qt) {
        bestTokenScore = Math.max(bestTokenScore, 90);
      } else if (tt.startsWith(qt)) {
        bestTokenScore = Math.max(bestTokenScore, 84);
      } else if (qt.length >= 2 && tt.includes(qt)) {
        bestTokenScore = Math.max(bestTokenScore, 76);
      } else if (qt.length >= 3) {
        const dist = levenshteinDistance(qt, tt);
        const maxLen = Math.max(qt.length, tt.length);
        if (maxLen >= 3 && dist <= 1) {
          bestTokenScore = Math.max(bestTokenScore, 70);
        } else if (maxLen >= 5 && dist <= 2) {
          bestTokenScore = Math.max(bestTokenScore, 60);
        }
      }
    }
  }

  return bestTokenScore;
}

export function buildSafeProfileForViewer(params: {
  target: User;
  viewerId: string | null;
  relationship: SafeSearchResultUser["relationship"];
  matchScore?: number;
  matchReasons?: string[];
  nowMs?: number;
}): SafeSearchResultUser {
  const {
    target,
    viewerId,
    relationship,
    matchScore = 60,
    matchReasons = [],
    nowMs = Date.now(),
  } = params;

  const isSelf = viewerId === target.id;
  const isFriend = relationship === "friend";
  const privacy = getResolvedPrivacy(target);
  const availability = target.availabilityMode || "public";

  const canBeDiscovered =
    isSelf ||
    (availability !== "private" &&
      isScopeAllowed(privacy.searchVisibility, isSelf, isFriend)) ||
    (availability === "friends" && isFriend);

  if (!canBeDiscovered || relationship === "blocked") {
    return {
      id: target.id,
      username: target.username,
      firstName: null,
      displayName: "مستخدم خاص",
      avatarUrl: makeSvgAvatar("🔒", "#64748B", "#475569"),
      bio: null,
      city: null,
      groupTag: null,
      presenceStatus: "unavailable",
      lastSeenAt: null,
      presenceHiddenByPrivacy: true,
      availabilityMode: "private",
      isHiddenPrivate: true,
      hiddenMessage: "هذا المستخدم غير متاح للبحث حاليًا",
      relationship,
      canMessageInternally: false,
      canCall: false,
      visibleEmail: null,
      visiblePhone: null,
      matchScore,
      matchReasons: [],
      createdAt: target.createdAt,
    };
  }

  const canSeeName = isScopeAllowed(privacy.nameVisibility, isSelf, isFriend);
  const canSeeAvatar = isScopeAllowed(
    privacy.avatarVisibility,
    isSelf,
    isFriend
  );
  const canMessage =
    privacy.allowedContactMethods.internalMessage &&
    isScopeAllowed(privacy.messagePermission, isSelf, isFriend) &&
    (availability === "public" || isFriend || isSelf);

  const canCall =
    isScopeAllowed(privacy.callPermission, isSelf, isFriend) &&
    (availability === "public" || isFriend || isSelf);

  const canSeeEmail =
    isSelf ||
    (privacy.allowedContactMethods.email &&
      isScopeAllowed(privacy.emailVisibility, isSelf, isFriend));

  const canSeePhone =
    isSelf ||
    (Boolean(target.phone) &&
      privacy.allowedContactMethods.phone &&
      isScopeAllowed(privacy.phoneVisibility, isSelf, isFriend));

  const livePresence = computeLivePresenceForViewer({
    target,
    isSelf,
    isFriend,
    nowMs,
  });

  const derivedFirstName =
    target.firstName || target.displayName.trim().split(/\s+/)[0] || null;

  return {
    id: target.id,
    username: target.username,
    firstName: canSeeName ? derivedFirstName : null,
    displayName: canSeeName ? target.displayName : `@${target.username}`,
    avatarUrl: canSeeAvatar
      ? target.avatarUrl
      : makeSvgAvatar(
          target.username.slice(0, 2).toUpperCase(),
          "#64748B",
          "#94A3B8"
        ),
    bio: target.bio,
    city: target.city,
    groupTag: target.groupTag,
    presenceStatus: livePresence.presenceStatus,
    lastSeenAt: livePresence.lastSeenAt,
    presenceHiddenByPrivacy: livePresence.presenceHiddenByPrivacy,
    availabilityMode: availability,
    isHiddenPrivate: false,
    relationship,
    canMessageInternally: canMessage,
    canCall,
    visibleEmail: canSeeEmail ? target.email : null,
    visiblePhone: canSeePhone ? target.phone || null : null,
    matchScore,
    matchReasons,
    createdAt: target.createdAt,
  };
}
