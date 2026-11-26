import { NextResponse } from "next/server";
import { db } from "@/db";
import { friends, users } from "@/db/schema";
import { authenticateRequest } from "@/lib/auth";
import {
  buildSafeProfileForViewer,
  checkRateLimit,
  computeFieldMatchScore,
  getClientIpHint,
  getResolvedPrivacy,
  isScopeAllowed,
  recordAuditLog,
} from "@/lib/privacy-search";
import { ensureSeeded } from "@/lib/seed";
import type {
  DiscoverySummaryStats,
  SafeSearchResultUser,
} from "@/types/oboud";
import { desc, eq, ne, or } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const startedAt = performance.now();
  try {
    await ensureSeeded();
    const auth = await authenticateRequest(req);
    if (!auth) {
      return NextResponse.json(
        { error: "يجب تسجيل الدخول أولاً للوصول إلى مستخدمي المنصة" },
        { status: 401 }
      );
    }

    const ipHint = getClientIpHint(req);
    const rate = checkRateLimit(`search:${auth.sub}:${ipHint}`, 120, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "تم تجاوز الحد المسموح لعمليات البحث، يرجى الانتظار قليلاً" },
        { status: 429 }
      );
    }

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    const tab = url.searchParams.get("tab") || "all"; // all | online | friends | incoming | outgoing
    const friendsOnly =
      url.searchParams.get("friendsOnly") === "1" || tab === "friends";
    const availableOnly = url.searchParams.get("availableOnly") === "1";
    const sameGroup = url.searchParams.get("sameGroup") === "1";
    const statusFilter =
      tab === "online" ? "online" : url.searchParams.get("status") || "all";

    const [meUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, auth.sub))
      .limit(1);

    // Fetch all registered accounts from the unified PostgreSQL users table + viewer's friend relationships
    const [candidateUsers, myRelations] = await Promise.all([
      db
        .select()
        .from(users)
        .where(ne(users.id, auth.sub))
        .orderBy(desc(users.createdAt)),
      db
        .select()
        .from(friends)
        .where(
          or(eq(friends.userId, auth.sub), eq(friends.friendId, auth.sub))
        ),
    ]);

    const relationByPeer = new Map<
      string,
      SafeSearchResultUser["relationship"]
    >();
    const blockedByPeerSet = new Set<string>();

    for (const rel of myRelations) {
      const otherId = rel.userId === auth.sub ? rel.friendId : rel.userId;
      if (rel.status === "blocked") {
        if (rel.userId === auth.sub) {
          relationByPeer.set(otherId, "blocked");
        } else {
          blockedByPeerSet.add(otherId);
        }
      } else if (rel.status === "accepted") {
        relationByPeer.set(otherId, "friend");
      } else if (rel.status === "pending") {
        if (rel.friendId === auth.sub) {
          relationByPeer.set(otherId, "incoming_pending");
        } else if (!relationByPeer.has(otherId)) {
          relationByPeer.set(otherId, "outgoing_pending");
        }
      }
    }

    const nowMs = Date.now();
    const results: SafeSearchResultUser[] = [];
    const incomingList: SafeSearchResultUser[] = [];
    const outgoingList: SafeSearchResultUser[] = [];

    let totalDiscoverableUsers = 0;
    let totalOnlineNow = 0;
    let totalFriends = 0;

    for (const target of candidateUsers) {
      if (blockedByPeerSet.has(target.id)) continue;

      const rel = relationByPeer.get(target.id) || "none";
      if (rel === "blocked") continue;

      const isFriend = rel === "friend";
      const privacy = getResolvedPrivacy(target);
      const isHiddenAccount =
        target.availabilityMode === "private" ||
        !isScopeAllowed(privacy.searchVisibility, false, isFriend);

      // Build safe viewer-projected profile
      const baseSafeProfile = buildSafeProfileForViewer({
        target,
        viewerId: auth.sub,
        relationship: rel,
        nowMs,
      });

      if (!isHiddenAccount) {
        totalDiscoverableUsers += 1;
        if (
          baseSafeProfile.presenceStatus === "online" ||
          baseSafeProfile.presenceStatus === "in_call"
        ) {
          totalOnlineNow += 1;
        }
        if (rel === "friend") totalFriends += 1;
        if (rel === "incoming_pending") incomingList.push(baseSafeProfile);
        if (rel === "outgoing_pending") outgoingList.push(baseSafeProfile);
      }

      // If hidden/private account, only surface masked notice card when explicitly searched by handle
      if (isHiddenAccount) {
        if (q.length >= 2 && tab === "all") {
          const cleanQ = q.replace(/^@/, "").toLowerCase();
          if (target.username.toLowerCase().startsWith(cleanQ)) {
            results.push({
              ...baseSafeProfile,
              matchScore: 65,
              matchReasons: ["حساب خاص"],
            });
          }
        }
        continue;
      }

      // Apply Tab Filters
      if (tab === "incoming" && rel !== "incoming_pending") continue;
      if (tab === "outgoing" && rel !== "outgoing_pending") continue;
      if (friendsOnly && rel !== "friend") continue;

      if (availableOnly) {
        if (
          !baseSafeProfile.canMessageInternally ||
          baseSafeProfile.presenceStatus === "offline"
        ) {
          continue;
        }
      }

      if (sameGroup && meUser?.groupTag && target.groupTag !== meUser.groupTag) {
        continue;
      }

      if (
        statusFilter === "online" &&
        baseSafeProfile.presenceStatus !== "online" &&
        baseSafeProfile.presenceStatus !== "in_call"
      ) {
        continue;
      }
      if (
        statusFilter === "offline" &&
        baseSafeProfile.presenceStatus !== "offline"
      ) {
        continue;
      }

      // Global Search Matching: Username, @Username, Personal First Name, Full Name (+ allowed email/phone)
      let bestScore = q ? 0 : 75;
      const reasons: string[] = [];

      if (q) {
        const isExplicitHandleQuery = q.startsWith("@");
        const cleanHandleQ = q.replace(/^@/, "");

        const usernameScore = computeFieldMatchScore(
          cleanHandleQ,
          target.username
        );
        if (usernameScore > 0) {
          bestScore = Math.max(
            bestScore,
            isExplicitHandleQuery ? Math.min(100, usernameScore + 5) : usernameScore
          );
          reasons.push("اسم المستخدم");
        }

        if (isScopeAllowed(privacy.nameVisibility, false, isFriend)) {
          const derivedFirst =
            target.firstName || target.displayName.trim().split(/\s+/)[0] || "";
          const firstNameScore = computeFieldMatchScore(q, derivedFirst);
          if (firstNameScore > 0) {
            bestScore = Math.max(bestScore, firstNameScore);
            reasons.push("الاسم الشخصي");
          }

          const fullNameScore = computeFieldMatchScore(q, target.displayName);
          if (fullNameScore > 0) {
            bestScore = Math.max(bestScore, fullNameScore);
            if (!reasons.includes("الاسم الشخصي")) {
              reasons.push("الاسم الكامل");
            }
          }
        }

        // Permitted Email / Phone lookup
        if (
          privacy.allowedContactMethods.email &&
          isScopeAllowed(privacy.emailVisibility, false, isFriend)
        ) {
          const emailScore = computeFieldMatchScore(q, target.email);
          if (emailScore >= 80) {
            bestScore = Math.max(bestScore, emailScore);
            reasons.push("البريد المسموح");
          }
        }

        if (
          target.phone &&
          privacy.allowedContactMethods.phone &&
          isScopeAllowed(privacy.phoneVisibility, false, isFriend)
        ) {
          const cleanPhoneQ = q.replace(/[\s-]/g, "");
          const cleanTargetPhone = target.phone.replace(/[\s-]/g, "");
          if (cleanPhoneQ.length >= 4 && cleanTargetPhone.includes(cleanPhoneQ)) {
            bestScore = Math.max(bestScore, 95);
            reasons.push("رقم الهاتف");
          }
        }

        if (bestScore < 58) continue;
      }

      results.push({
        ...baseSafeProfile,
        matchScore: bestScore,
        matchReasons: reasons,
      });
    }

    // Sort: Hidden last -> Match score -> Live Online/In-Call first -> Newest accounts
    const presenceRank: Record<SafeSearchResultUser["presenceStatus"], number> = {
      online: 4,
      in_call: 3,
      unavailable: 2,
      offline: 1,
    };

    results.sort((a, b) => {
      if (a.isHiddenPrivate !== b.isHiddenPrivate) {
        return a.isHiddenPrivate ? 1 : -1;
      }
      if (q && b.matchScore !== a.matchScore) {
        return b.matchScore - a.matchScore;
      }
      const pDiff =
        presenceRank[b.presenceStatus] - presenceRank[a.presenceStatus];
      if (pDiff !== 0) return pDiff;

      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tB - tA;
    });

    if (q.length >= 2) {
      await recordAuditLog({
        actorId: auth.sub,
        action: "global_user_search",
        metadata: {
          query: q,
          tab,
          resultCount: results.length,
        },
        req,
      });
    }

    const summary: DiscoverySummaryStats = {
      totalUsers: totalDiscoverableUsers,
      onlineNow: totalOnlineNow,
      friendsCount: totalFriends,
      incomingRequestsCount: incomingList.length,
      outgoingRequestsCount: outgoingList.length,
    };

    const suggestions = q
      ? results
          .filter((r) => !r.isHiddenPrivate)
          .slice(0, 6)
          .map((r) => ({
            id: r.id,
            username: r.username,
            displayName: r.displayName,
            avatarUrl: r.avatarUrl,
            presenceStatus: r.presenceStatus,
          }))
      : [];

    const tookMs = Math.max(
      1,
      Math.round((performance.now() - startedAt) * 10) / 10
    );

    return NextResponse.json({
      results,
      summary,
      incomingRequests: incomingList,
      outgoingRequests: outgoingList,
      suggestions,
      tookMs,
    });
  } catch (error) {
    console.error("GET /api/users/search error:", error);
    return NextResponse.json(
      { error: "حدث خطأ أثناء جلب مستخدمي المنصة" },
      { status: 500 }
    );
  }
}
