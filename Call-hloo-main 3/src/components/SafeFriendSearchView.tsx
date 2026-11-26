"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Compass,
  Eye,
  Flag,
  Loader2,
  Lock,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  Share2,
  ShieldBan,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  Video,
  X,
  Zap,
} from "lucide-react";
import { getPresenceBadgePresentation } from "@/lib/presence-format";
import type {
  DiscoverySummaryStats,
  FriendContact,
  PublicUser,
  SafeSearchResultUser,
} from "@/types/oboud";
import {
  ReportUserModal,
  UserProfileModal,
} from "./UserProfileAndReportModals";

interface SafeFriendSearchViewProps {
  jwtToken: string;
  currentUser: PublicUser;
  realtimeRefreshSignal: number;
  onPresenceChangedSelf: (newStatus: string) => void;
  onSendFriendRequest: (payload: {
    username?: string;
    targetUserId?: string;
  }) => Promise<string | null>;
  onUpdateFriend: (
    peerUserId: string,
    action: "accept" | "reject" | "cancel" | "block" | "unblock" | "remove"
  ) => Promise<void>;
  onOpenChatWithUser: (friend: FriendContact) => void;
  onStartCall: (peer: PublicUser, type: "video" | "audio") => void;
  onRefreshNotifications: () => void;
}

interface SearchSuggestion {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  presenceStatus: string;
}

export function SafeFriendSearchView({
  jwtToken,
  currentUser,
  realtimeRefreshSignal,
  onPresenceChangedSelf,
  onSendFriendRequest,
  onUpdateFriend,
  onOpenChatWithUser,
  onStartCall,
  onRefreshNotifications,
}: SafeFriendSearchViewProps) {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<
    "all" | "online" | "friends" | "incoming" | "outgoing"
  >("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">(
    "all"
  );

  const [results, setResults] = useState<SafeSearchResultUser[]>([]);
  const [summary, setSummary] = useState<DiscoverySummaryStats>({
    totalUsers: 0,
    onlineNow: 0,
    friendsCount: 0,
    incomingRequestsCount: 0,
    outgoingRequestsCount: 0,
  });
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [tookMs, setTookMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [switchingOwnStatus, setSwitchingOwnStatus] = useState(false);

  const [toast, setToast] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);
  const [inspectedProfile, setInspectedProfile] =
    useState<SafeSearchResultUser | null>(null);
  const [reportTarget, setReportTarget] =
    useState<SafeSearchResultUser | null>(null);

  const searchBoxRef = useRef<HTMLDivElement | null>(null);

  const showToast = (ok: boolean, text: string) => {
    setToast({ ok, text });
    setTimeout(() => setToast(null), 3200);
  };

  const executeDiscoveryFetch = useCallback(
    async (overrideQ?: string, silent = false) => {
      const qToUse = overrideQ !== undefined ? overrideQ : query;
      if (!silent) setLoading(true);
      try {
        const params = new URLSearchParams();
        if (qToUse.trim()) params.set("q", qToUse.trim());
        params.set("tab", activeTab);
        if (activeTab === "all" && statusFilter !== "all") {
          params.set("status", statusFilter);
        }

        const res = await fetch(`/api/users/search?${params.toString()}`, {
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const data = await res.json();
        const nextResults = (data.results || []) as SafeSearchResultUser[];
        setResults(nextResults);
        if (data.summary) setSummary(data.summary);
        setSuggestions(data.suggestions || []);
        setTookMs(typeof data.tookMs === "number" ? data.tookMs : null);

        // Keep open profile modal synchronized with latest relationship/presence
        setInspectedProfile((prev) => {
          if (!prev) return null;
          const updated = nextResults.find((r) => r.id === prev.id);
          return updated || prev;
        });
      } catch {
        // ignore transient fetch error
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [activeTab, jwtToken, query, statusFilter]
  );

  // Debounced search on query / filter change
  useEffect(() => {
    const timer = window.setTimeout(() => {
      executeDiscoveryFetch();
    }, 140);
    return () => window.clearTimeout(timer);
  }, [executeDiscoveryFetch]);

  // Auto-refresh immediately on realtime SSE signals (new user registered, presence changed, friend request!)
  useEffect(() => {
    if (realtimeRefreshSignal > 0) {
      executeDiscoveryFetch(undefined, true);
    }
  }, [realtimeRefreshSignal, executeDiscoveryFetch]);

  // Periodic live refresh every 15s to keep relative "آخر ظهور" & online timeouts accurate
  useEffect(() => {
    const interval = window.setInterval(() => {
      executeDiscoveryFetch(undefined, true);
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [executeDiscoveryFetch]);

  // Close autocomplete dropdown on outside click
  useEffect(() => {
    const onDocClick = (ev: MouseEvent) => {
      if (
        searchBoxRef.current &&
        !searchBoxRef.current.contains(ev.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const handleSetMyRealtimePresence = async (
    nextStatus: "online" | "unavailable" | "offline"
  ) => {
    setSwitchingOwnStatus(true);
    try {
      const res = await fetch("/api/signaling", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          
        },
        body: JSON.stringify({
          eventType: "presence-set",
          status: nextStatus,
        }),
      });
      if (res.ok) {
        onPresenceChangedSelf(nextStatus);
        showToast(
          true,
          nextStatus === "online"
            ? "أنت الآن متصل ومتاح للجميع"
            : nextStatus === "unavailable"
            ? "تم تحديث حالتك إلى: غير متاح"
            : "تم تحديث حالتك إلى: غير متصل (مخفي)"
        );
      }
    } finally {
      setSwitchingOwnStatus(false);
    }
  };

  const handleOpenDirectChat = (u: SafeSearchResultUser) => {
    onOpenChatWithUser({
      id: u.id,
      username: u.username,
      firstName: u.firstName,
      displayName: u.displayName,
      email: u.visibleEmail || "",
      phone: u.visiblePhone,
      city: u.city,
      groupTag: u.groupTag,
      avatarUrl: u.avatarUrl,
      bio: u.bio,
      presenceStatus: u.presenceStatus,
      effectivePresence: u.presenceStatus,
      lastSeenAt: u.lastSeenAt,
      canMessageInternally: u.canMessageInternally,
      canCall: u.canCall,
    });
  };

  const handleShareProfileLink = async (u: SafeSearchResultUser) => {
    try {
      const link = `${window.location.origin}/u/${encodeURIComponent(
        u.username
      )}`;
      await navigator.clipboard.writeText(link);
      setCopiedUserId(u.id);
      showToast(true, `تم نسخ رابط الملف الشخصي لـ ${u.displayName}`);
      setTimeout(() => setCopiedUserId(null), 2000);
    } catch {
      // ignore
    }
  };

  const handleSendWelcomeWave = async (username: string) => {
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(username)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(false, data.error || "تعذر إرسال الترحيب");
        return data.error || null;
      }
      showToast(true, data.message || "تم إرسال تحية الترحيب!");
      onRefreshNotifications();
      return data.message || null;
    } catch {
      return "تعذر الاتصال بالخادم";
    }
  };

  const myEffectiveStatus =
    currentUser.presenceStatus === "unavailable" ||
    currentUser.presenceStatus === "busy"
      ? "unavailable"
      : currentUser.presenceStatus === "offline"
      ? "offline"
      : currentUser.presenceStatus === "in_call"
      ? "in_call"
      : "online";

  return (
    <div className="h-full overflow-y-auto bg-[#F8FAFC] p-3.5 sm:p-6 lg:p-8 pb-24 md:pb-8">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Page Header: «اكتشف الأشخاص» + My Live Presence Switcher */}
        <div className="rounded-3xl bg-white border border-slate-200 p-4 sm:p-6 shadow-2xs space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-0.5 text-[11px] font-bold text-emerald-800">
                <Compass className="w-3.5 h-3.5 text-emerald-600" />
                <span>نظام الوصول العالمي • تحديث لحظي Realtime</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 pt-0.5">
                اكتشف الأشخاص
              </h2>
              <p className="text-xs sm:text-sm text-slate-600">
                تصفّح وابحث في جميع الحسابات المسجلة على المنصة بالاسم أو{" "}
                <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                  @Username
                </span>{" "}
                وتواصل معهم مباشرة كما في WhatsApp و IMO.
              </p>
            </div>

            {/* Quick Live Presence Control for Current User */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-slate-50 border border-slate-200/80 rounded-2xl p-2.5">
              <span className="text-[11px] font-extrabold text-slate-600 px-1">
                حالتي الآن:
              </span>
              <div className="grid grid-cols-3 gap-1 bg-slate-200/70 p-1 rounded-xl">
                {[
                  {
                    id: "online" as const,
                    label: "متصل الآن",
                    dot: "bg-emerald-500",
                  },
                  {
                    id: "unavailable" as const,
                    label: "غير متاح",
                    dot: "bg-amber-500",
                  },
                  {
                    id: "offline" as const,
                    label: "غير متصل",
                    dot: "bg-slate-400",
                  },
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    disabled={switchingOwnStatus}
                    onClick={() => handleSetMyRealtimePresence(st.id)}
                    className={`px-2.5 py-1.5 rounded-lg flex items-center justify-center gap-1.5 text-[11px] font-extrabold transition cursor-pointer ${
                      myEffectiveStatus === st.id
                        ? "bg-white text-slate-900 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${st.dot}`} />
                    <span>{st.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Global Search Input + Instant Autocomplete */}
          <div ref={searchBoxRef} className="relative">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setShowSuggestions(false);
                executeDiscoveryFetch();
              }}
              className="flex flex-col sm:flex-row gap-2.5"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onFocus={() => setShowSuggestions(true)}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setShowSuggestions(true);
                  }}
                  placeholder="ابحث بالاسم الشخصي، الاسم الكامل، Username، أو @Username..."
                  className="w-full h-12 rounded-2xl border border-slate-200 bg-slate-50/70 focus:bg-white pr-10 pl-10 text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setShowSuggestions(false);
                    }}
                    className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-700 flex items-center justify-center absolute left-2 top-1/2 -translate-y-1/2 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="flex-1 sm:flex-none h-12 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm inline-flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
                >
                  <Search className="w-4 h-4" />
                  <span>بحث عالمي</span>
                </button>

                <button
                  type="button"
                  onClick={() => executeDiscoveryFetch()}
                  title="تحديث القائمة الآن"
                  className="h-12 w-12 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center justify-center transition cursor-pointer shrink-0"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${
                      loading ? "animate-spin text-emerald-600" : ""
                    }`}
                  />
                </button>
              </div>
            </form>

            {/* Instant Autocomplete Suggestions */}
            {showSuggestions &&
              query.trim().length >= 1 &&
              suggestions.length > 0 && (
                <div className="absolute z-30 top-full mt-1.5 inset-x-0 rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden divide-y divide-slate-100">
                  <div className="px-3.5 py-1.5 bg-slate-50 text-[10px] font-extrabold text-slate-500 flex items-center justify-between">
                    <span>نتائج مطابقة فورية من قاعدة البيانات</span>
                    {tookMs !== null && (
                      <span className="font-mono" dir="ltr">
                        {tookMs} ms
                      </span>
                    )}
                  </div>
                  {suggestions.map((s) => {
                    const pBadge = getPresenceBadgePresentation({
                      presenceStatus: s.presenceStatus,
                    });
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setQuery(`@${s.username}`);
                          setShowSuggestions(false);
                          executeDiscoveryFetch(`@${s.username}`);
                        }}
                        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-emerald-50/60 text-right transition cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="relative shrink-0">
                            <img
                              src={s.avatarUrl || "/images/oboud-avatar.jpg"}
                              alt={s.displayName}
                              className="w-9 h-9 rounded-full object-cover border border-slate-200"
                            />
                            <span
                              className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border border-white ${pBadge.dotClass}`}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-extrabold text-slate-900 truncate">
                              {s.displayName}
                            </div>
                            <div
                              className="text-[11px] font-mono text-slate-500 truncate"
                              dir="ltr"
                            >
                              @{s.username}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] shrink-0 ${pBadge.pillClass}`}
                        >
                          {pBadge.shortLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
          </div>

          {/* 5 Organized Discovery & Friend Management Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                {
                  id: "all" as const,
                  label: "جميع المستخدمين",
                  count: summary.totalUsers,
                },
                {
                  id: "online" as const,
                  label: "متصل الآن",
                  count: summary.onlineNow,
                },
                {
                  id: "friends" as const,
                  label: "الأصدقاء",
                  count: summary.friendsCount,
                },
                {
                  id: "incoming" as const,
                  label: "الطلبات الواردة",
                  count: summary.incomingRequestsCount,
                  highlight: summary.incomingRequestsCount > 0,
                },
                {
                  id: "outgoing" as const,
                  label: "الطلبات المرسلة",
                  count: summary.outgoingRequestsCount,
                },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`h-9 px-3 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 transition cursor-pointer ${
                    activeTab === t.id
                      ? "bg-slate-900 text-white shadow-2xs"
                      : t.highlight
                      ? "bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  }`}
                >
                  <span>{t.label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono ${
                      activeTab === t.id
                        ? "bg-white/20 text-white"
                        : t.highlight
                        ? "bg-amber-500 text-white"
                        : "bg-white text-slate-700"
                    }`}
                  >
                    {t.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {activeTab === "all" && (
                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(
                      e.target.value as "all" | "online" | "offline"
                    )
                  }
                  className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="all">كل الحالات (متصل وغير متصل)</option>
                  <option value="online">المتصلون الآن فقط</option>
                  <option value="offline">غير المتصلين فقط</option>
                </select>
              )}

              {tookMs !== null && (
                <span
                  className="hidden sm:inline-flex items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-1 text-[11px] font-mono font-bold text-slate-600"
                  dir="ltr"
                >
                  <Zap className="w-3 h-3 text-amber-500" />
                  <span>{tookMs} ms</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Toast Feedback */}
        {toast && (
          <div
            className={`rounded-2xl px-4 py-3 text-xs sm:text-sm font-bold border ${
              toast.ok
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-rose-50 border-rose-200 text-rose-700"
            }`}
          >
            {toast.text}
          </div>
        )}

        {/* Global Users Grid */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-600" />
              <span>
                {activeTab === "all"
                  ? `قائمة مستخدمي المنصة (${results.length})`
                  : activeTab === "online"
                  ? `المستخدمون المتصلون الآن (${results.length})`
                  : activeTab === "friends"
                  ? `قائمة أصدقائي (${results.length})`
                  : activeTab === "incoming"
                  ? `طلبات الصداقة الواردة (${results.length})`
                  : `طلبات الصداقة المرسلة (${results.length})`}
              </span>
            </h3>
            {loading && (
              <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
            )}
          </div>

          {results.length === 0 && !loading ? (
            <div className="rounded-3xl bg-white border border-slate-200 p-10 text-center space-y-2">
              <Search className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-extrabold text-slate-800">
                {activeTab === "incoming"
                  ? "لا توجد طلبات صداقة واردة حالياً"
                  : activeTab === "outgoing"
                  ? "لا توجد طلبات صداقة مرسلة قيد الانتظار"
                  : "لم يتم العثور على مستخدمين مطابقين للبحث"}
              </p>
              <p className="text-xs text-slate-500">
                {query
                  ? "تأكد من كتابة الاسم أو @Username بشكل صحيح أو امسح مربع البحث لعرض الجميع."
                  : "جميع المستخدمين الجدد يظهرون هنا تلقائياً فور التسجيل."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map((u) => {
                if (u.isHiddenPrivate) {
                  return (
                    <div
                      key={u.id}
                      className="rounded-3xl bg-slate-100/80 border border-slate-200 p-5 flex items-center gap-4"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-slate-200 text-slate-500 flex items-center justify-center shrink-0">
                        <Lock className="w-6 h-6" />
                      </div>
                      <div className="space-y-1 min-w-0">
                        <div
                          className="text-xs font-mono text-slate-500 truncate"
                          dir="ltr"
                        >
                          @{u.username}
                        </div>
                        <div className="text-sm font-extrabold text-slate-800">
                          {u.hiddenMessage ||
                            "هذا المستخدم غير متاح للبحث حاليًا"}
                        </div>
                        <p className="text-[11px] text-slate-500">
                          حساب خاص محمي بإعدادات الخصوصية.
                        </p>
                      </div>
                    </div>
                  );
                }

                const isFriend = u.relationship === "friend";
                const isPendingOut = u.relationship === "outgoing_pending";
                const isPendingIn = u.relationship === "incoming_pending";
                const presenceBadge = getPresenceBadgePresentation({
                  presenceStatus: u.presenceStatus,
                  lastSeenAt: u.lastSeenAt,
                  presenceHiddenByPrivacy: u.presenceHiddenByPrivacy,
                });

                const asPeerObj: PublicUser = {
                  id: u.id,
                  username: u.username,
                  firstName: u.firstName,
                  displayName: u.displayName,
                  email: u.visibleEmail || "",
                  avatarUrl: u.avatarUrl,
                  bio: u.bio,
                  presenceStatus: u.presenceStatus,
                  lastSeenAt: u.lastSeenAt,
                };

                return (
                  <div
                    key={u.id}
                    className="rounded-3xl bg-white border border-slate-200 p-4 sm:p-5 flex flex-col justify-between gap-4 shadow-2xs hover:border-emerald-300 transition"
                  >
                    {/* User Identity & Live Presence */}
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative shrink-0">
                            <img
                              src={u.avatarUrl || "/images/oboud-avatar.jpg"}
                              alt={u.displayName}
                              onClick={() => setInspectedProfile(u)}
                              className="w-14 h-14 rounded-2xl object-cover border border-slate-200 cursor-pointer bg-slate-50"
                            />
                            <span
                              className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white ${presenceBadge.dotClass}`}
                            />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setInspectedProfile(u)}
                                className="font-extrabold text-sm sm:text-base text-slate-900 hover:text-emerald-700 truncate cursor-pointer"
                              >
                                {u.displayName}
                              </button>
                              {isFriend && (
                                <span className="rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 text-[10px] font-extrabold shrink-0">
                                  صديق
                                </span>
                              )}
                            </div>
                            <div
                              className="text-xs font-mono text-slate-500 truncate"
                              dir="ltr"
                            >
                              @{u.username}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Real-time Presence Pill (Online / In Call / Unavailable / Last Seen) */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] ${presenceBadge.pillClass}`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${presenceBadge.dotClass}`}
                          />
                          <span>{presenceBadge.label}</span>
                        </span>
                      </div>

                      {u.bio && (
                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                          {u.bio}
                        </p>
                      )}
                    </div>

                    {/* Card Actions: Add/Accept/Cancel Friend + Start Chat + Call + View Profile */}
                    <div className="space-y-2 pt-3 border-t border-slate-100">
                      {/* Row 1: Friend Action + Start Chat */}
                      <div className="grid grid-cols-2 gap-2">
                        {isPendingIn ? (
                          <div className="col-span-2 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              disabled={busyUserId === u.id}
                              onClick={async () => {
                                setBusyUserId(u.id);
                                await onUpdateFriend(u.id, "accept");
                                setBusyUserId(null);
                                showToast(
                                  true,
                                  `أصبحتما أصدقاء الآن مع ${u.displayName}!`
                                );
                                executeDiscoveryFetch(undefined, true);
                              }}
                              className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
                            >
                              <Check className="w-4 h-4" />
                              <span>قبول الطلب</span>
                            </button>
                            <button
                              type="button"
                              disabled={busyUserId === u.id}
                              onClick={async () => {
                                setBusyUserId(u.id);
                                await onUpdateFriend(u.id, "reject");
                                setBusyUserId(null);
                                showToast(true, "تم رفض طلب الصداقة");
                                executeDiscoveryFetch(undefined, true);
                              }}
                              className="h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
                            >
                              <X className="w-4 h-4" />
                              <span>رفض</span>
                            </button>
                          </div>
                        ) : isPendingOut ? (
                          <button
                            type="button"
                            disabled={busyUserId === u.id}
                            onClick={async () => {
                              setBusyUserId(u.id);
                              await onUpdateFriend(u.id, "cancel");
                              setBusyUserId(null);
                              showToast(true, "تم إلغاء طلب الصداقة المرسل");
                              executeDiscoveryFetch(undefined, true);
                            }}
                            className="h-10 rounded-xl bg-amber-50 hover:bg-rose-50 border border-amber-200 hover:border-rose-200 text-amber-800 hover:text-rose-700 text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            <span>إلغاء الطلب</span>
                          </button>
                        ) : isFriend ? (
                          <div className="h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-extrabold inline-flex items-center justify-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>صديق مضاف</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={busyUserId === u.id}
                            onClick={async () => {
                              setBusyUserId(u.id);
                              const err = await onSendFriendRequest({
                                targetUserId: u.id,
                              });
                              setBusyUserId(null);
                              if (err) {
                                showToast(false, err);
                              } else {
                                showToast(
                                  true,
                                  `تم إرسال طلب الصداقة إلى ${u.displayName}`
                                );
                                executeDiscoveryFetch(undefined, true);
                              }
                            }}
                            className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span>إضافة صديق</span>
                          </button>
                        )}

                        {/* Start Direct Chat Button */}
                        {!isPendingIn &&
                          (u.canMessageInternally ? (
                            <button
                              type="button"
                              onClick={() => handleOpenDirectChat(u)}
                              className="h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>بدء المحادثة</span>
                            </button>
                          ) : (
                            <div className="h-10 rounded-xl bg-slate-100 text-slate-400 text-[11px] font-bold inline-flex items-center justify-center gap-1">
                              <Lock className="w-3 h-3" />
                              <span>المحادثة للأصدقاء</span>
                            </div>
                          ))}
                      </div>

                      {/* Row 2: View Profile + Direct Audio/Video Call + Share/Block/Report */}
                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => setInspectedProfile(u)}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 text-[11px] font-extrabold text-slate-800 transition cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-600" />
                          <span>عرض الملف الشخصي</span>
                        </button>

                        <div className="flex items-center gap-1">
                          {u.canCall && (
                            <>
                              <button
                                type="button"
                                onClick={() => onStartCall(asPeerObj, "audio")}
                                title="اتصال صوتي مباشر"
                                className="w-8 h-8 rounded-lg bg-sky-50 hover:bg-sky-600 text-sky-700 hover:text-white flex items-center justify-center transition cursor-pointer"
                              >
                                <Phone className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onStartCall(asPeerObj, "video")}
                                title="اتصال مرئي مباشر"
                                className="w-8 h-8 rounded-lg bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white flex items-center justify-center transition cursor-pointer"
                              >
                                <Video className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => handleShareProfileLink(u)}
                            title="مشاركة رابط الملف"
                            className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 flex items-center justify-center transition cursor-pointer"
                          >
                            {copiedUserId === u.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Share2 className="w-3.5 h-3.5" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={async () => {
                              await onUpdateFriend(u.id, "block");
                              showToast(true, `تم حظر @${u.username}`);
                              executeDiscoveryFetch(undefined, true);
                            }}
                            title="حظر المستخدم"
                            className="w-8 h-8 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition cursor-pointer"
                          >
                            <ShieldBan className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setReportTarget(u)}
                            title="إبلاغ"
                            className="w-8 h-8 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 flex items-center justify-center transition cursor-pointer"
                          >
                            <Flag className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Profile Viewer Modal */}
      <UserProfileModal
        profile={inspectedProfile}
        onClose={() => setInspectedProfile(null)}
        onOpenChat={handleOpenDirectChat}
        onStartCall={onStartCall}
        onSendFriendRequest={async (targetUserId) => {
          const err = await onSendFriendRequest({ targetUserId });
          if (err) showToast(false, err);
          else {
            showToast(true, "تم إرسال طلب الصداقة بنجاح");
            executeDiscoveryFetch(undefined, true);
          }
        }}
        onUpdateFriendRelation={async (peerUserId, action) => {
          await onUpdateFriend(peerUserId, action);
          executeDiscoveryFetch(undefined, true);
        }}
        onSendWelcomeWave={handleSendWelcomeWave}
        onBlockUser={async (targetUserId) => {
          await onUpdateFriend(targetUserId, "block");
          showToast(true, "تم حظر المستخدم بنجاح");
          executeDiscoveryFetch(undefined, true);
        }}
        onOpenReport={(prof) => setReportTarget(prof)}
      />

      {/* Report Modal */}
      <ReportUserModal
        target={reportTarget}
        onClose={() => setReportTarget(null)}
        jwtToken={jwtToken}
        onReportSubmitted={() => {
          executeDiscoveryFetch(undefined, true);
          onRefreshNotifications();
        }}
      />
    </div>
  );
}
