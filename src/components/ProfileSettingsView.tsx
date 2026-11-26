"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  Copy,
  FileWarning,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Save,
  Share2,
  Shield,
  ShieldCheck,
  Unlock,
  User,
  Users,
  Video,
  VideoOff,
} from "lucide-react";
import { DEFAULT_PRIVACY_SETTINGS } from "@/db/schema";
import type {
  AuditLogSummary,
  AvailabilityMode,
  PrivacyScope,
  PrivacySettings,
  PublicUser,
  UserReportSummary,
} from "@/types/oboud";
import {
  acquireUserOrSyntheticStream,
  type ManagedMediaResult,
} from "@/lib/webrtc-media";

interface ProfileSettingsViewProps {
  currentUser: PublicUser;
  jwtToken: string;
  demoUsers: PublicUser[];
  onProfileUpdated: (updated: PublicUser) => void;
  onQuickSwitchAccount: (user: PublicUser, token: string) => void;
  onLogout: () => void;
}

interface BlockedUserItem {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  blockedAt: string | Date;
}

const PRIVACY_FIELDS: Array<{
  key: keyof Omit<PrivacySettings, "allowedContactMethods">;
  label: string;
  hint: string;
}> = [
  {
    key: "searchVisibility",
    label: "من يمكنه البحث عني في صفحة «اكتشف الأشخاص»",
    hint: "عند اختيار ممنوع ستظهر عبارة: هذا المستخدم غير متاح للبحث حاليًا",
  },
  {
    key: "presenceVisibility",
    label: "من يمكنه رؤية حالة اتصالي وآخر ظهور",
    hint: "يتحكم بظهور متصل الآن / مشغول بمكالمة / توقيت آخر ظهور",
  },
  {
    key: "nameVisibility",
    label: "من يمكنه رؤية اسمي الكامل",
    hint: "إذا قيدته سيظهر اسم المستخدم المختصر فقط لغير المسموح لهم",
  },
  {
    key: "avatarVisibility",
    label: "من يمكنه رؤية صورتي الشخصية",
    hint: "تُستبدل بصورة رمزية محايدة لغير المصرح لهم",
  },
  {
    key: "messagePermission",
    label: "من يمكنه بدء محادثة داخلية معي",
    hint: "المراسلة الداخلية هي وسيلة الاتصال الآمنة الافتراضية",
  },
  {
    key: "callPermission",
    label: "من يمكنه الاتصال بي صوتياً ومرئياً",
    hint: "يتحكم بمن يمكنه بدء مكالمة WebRTC صوتية أو مرئية مع حسابك",
  },
  {
    key: "phoneVisibility",
    label: "من يمكنه رؤية رقم هاتفي والبحث به",
    hint: "لا يظهر رقمك مطلقاً إلا إذا سمحت بذلك وفعلت خيار الهاتف",
  },
  {
    key: "emailVisibility",
    label: "من يمكنه رؤية بريدي الإلكتروني والبحث به",
    hint: "محمي افتراضياً ولا يُكشف في واجهات البحث العامة",
  },
];

export function ProfileSettingsView({
  currentUser,
  jwtToken,
  demoUsers,
  onProfileUpdated,
  onQuickSwitchAccount,
  onLogout,
}: ProfileSettingsViewProps) {
  const [subTab, setSubTab] = useState<"profile" | "privacy" | "security">(
    "profile"
  );

  // Profile fields
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [bio, setBio] = useState(currentUser.bio || "");
  const [phone, setPhone] = useState(currentUser.phone || "");
  const [city, setCity] = useState(currentUser.city || "الرياض");
  const [groupTag, setGroupTag] = useState(
    currentUser.groupTag || "مجتمع عبود التقني"
  );
  const [presenceStatus, setPresenceStatus] = useState<string>(
    currentUser.presenceStatus || "online"
  );
  const [availabilityMode, setAvailabilityMode] = useState<AvailabilityMode>(
    currentUser.availabilityMode || "public"
  );
  const [privacy, setPrivacy] = useState<PrivacySettings>(
    currentUser.privacySettings || DEFAULT_PRIVACY_SETTINGS
  );
  const [avatarUrl, setAvatarUrl] = useState<string>(
    currentUser.avatarUrl || "/images/oboud-avatar.jpg"
  );

  // Password change fields
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // Security & Audit Data
  const [reports, setReports] = useState<UserReportSummary[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogSummary[]>([]);
  const [loadingSecurity, setLoadingSecurity] = useState(false);

  // Feedback
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [switchingUser, setSwitchingUser] = useState<string | null>(null);

  // Camera & Mic Test
  const [testingMedia, setTestingMedia] = useState(false);
  const [isSyntheticPreview, setIsSyntheticPreview] = useState(false);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaCleanupRef = useRef<ManagedMediaResult | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDisplayName(currentUser.displayName);
    setBio(currentUser.bio || "");
    setPhone(currentUser.phone || "");
    setCity(currentUser.city || "الرياض");
    setGroupTag(currentUser.groupTag || "مجتمع عبود التقني");
    setPresenceStatus(currentUser.presenceStatus || "online");
    setAvailabilityMode(currentUser.availabilityMode || "public");
    setPrivacy(currentUser.privacySettings || DEFAULT_PRIVACY_SETTINGS);
    setAvatarUrl(currentUser.avatarUrl || "/images/oboud-avatar.jpg");
  }, [currentUser]);

  const loadSecurityData = useCallback(async () => {
    setLoadingSecurity(true);
    try {
      const res = await fetch("/api/reports", {
        credentials: "same-origin",
      });
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
        setBlockedUsers(data.blockedUsers || []);
        setAuditLogs(data.auditLogs || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingSecurity(false);
    }
  }, [jwtToken]);

  useEffect(() => {
    if (subTab === "security") {
      loadSecurityData();
    }
  }, [subTab, loadSecurityData]);

  useEffect(() => {
    return () => {
      mediaCleanupRef.current?.cleanup();
      mediaCleanupRef.current = null;
    };
  }, []);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 240;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx?.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        setAvatarUrl(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          
        },
        body: JSON.stringify({
          displayName,
          bio,
          phone,
          city,
          groupTag,
          presenceStatus,
          availabilityMode,
          privacySettings: privacy,
          avatarUrl,
          ...(newPassword ? { currentPassword, newPassword } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFeedback({
          type: "err",
          text: data.error || "تعذر حفظ التغييرات",
        });
      } else {
        onProfileUpdated(data.user);
        setCurrentPassword("");
        setNewPassword("");
        setFeedback({
          type: "ok",
          text: "تم حفظ الملف الشخصي وإعدادات الخصوصية في قاعدة البيانات بنجاح!",
        });
      }
    } catch {
      setFeedback({ type: "err", text: "تعذر الاتصال بالخادم" });
    } finally {
      setSaving(false);
    }
  };

  const handleUnblockUser = async (peerUserId: string) => {
    await fetch("/api/friends", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        
      },
      body: JSON.stringify({ peerUserId, action: "unblock" }),
    });
    loadSecurityData();
  };

  const toggleMediaPreview = async () => {
    if (testingMedia) {
      mediaCleanupRef.current?.cleanup();
      mediaCleanupRef.current = null;
      setTestingMedia(false);
      return;
    }

    const media = await acquireUserOrSyntheticStream(
      "video",
      currentUser.displayName
    );
    mediaCleanupRef.current = media;
    setIsSyntheticPreview(media.isSynthetic);
    setTestingMedia(true);

    setTimeout(() => {
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = media.stream;
      }
    }, 60);
  };

  const handleQuickSwitch = async (username: string) => {
    setSwitchingUser(username);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quickSwitchUsername: username }),
      });
      const data = await res.json();
      if (res.ok && data.user && data.token) {
        onQuickSwitchAccount(data.user, data.token);
      }
    } finally {
      setSwitchingUser(null);
    }
  };

  const copyShareProfileLink = async () => {
    try {
      const url = `${window.location.origin}/u/${encodeURIComponent(
        currentUser.username
      )}`;
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[#F8FAFC] p-4 sm:p-6 lg:p-8 pb-24 md:pb-8">
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Top Profile Summary + Share Link + Logout */}
        <div className="rounded-3xl bg-white border border-slate-200 p-5 sm:p-6 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <img
                src={avatarUrl}
                alt={currentUser.displayName}
                className="w-18 h-18 sm:w-20 sm:h-20 rounded-3xl object-cover border-2 border-emerald-500 shadow-xs"
              />
              <button
                type="button"
                onClick={() => avatarFileInputRef.current?.click()}
                title="تغيير الصورة الشخصية"
                className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center absolute -bottom-1 -left-1 border-2 border-white shadow-xs cursor-pointer"
              >
                <Camera className="w-4 h-4" />
              </button>
              <input
                ref={avatarFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </div>

            <div className="min-w-0 space-y-1">
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 truncate">
                {currentUser.displayName}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  dir="ltr"
                  className="rounded-lg bg-slate-100 px-2.5 py-0.5 text-xs font-mono font-bold text-slate-700"
                >
                  @{currentUser.username}
                </span>
                <button
                  type="button"
                  onClick={copyShareProfileLink}
                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2.5 py-0.5 text-xs font-bold transition cursor-pointer"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>تم نسخ رابط ملفي</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-3.5 h-3.5" />
                      <span>مشاركة رابط ملفي</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="h-11 rounded-2xl bg-rose-50 hover:bg-rose-100 border border-rose-200 px-4 text-xs sm:text-sm font-extrabold text-rose-700 inline-flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>تسجيل الخروج</span>
          </button>
        </div>

        {/* 3 Organized Sub-Tabs (Mobile-Friendly) */}
        <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl bg-slate-200/70">
          <button
            type="button"
            onClick={() => setSubTab("profile")}
            className={`h-11 rounded-xl flex items-center justify-center gap-1.5 text-xs sm:text-sm font-extrabold transition cursor-pointer ${
              subTab === "profile"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <User className="w-4 h-4 text-emerald-600" />
            <span>الملف والاتصال</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab("privacy")}
            className={`h-11 rounded-xl flex items-center justify-center gap-1.5 text-xs sm:text-sm font-extrabold transition cursor-pointer ${
              subTab === "privacy"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Lock className="w-4 h-4 text-indigo-600" />
            <span>الخصوصية</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab("security")}
            className={`h-11 rounded-xl flex items-center justify-center gap-1.5 text-xs sm:text-sm font-extrabold transition cursor-pointer ${
              subTab === "security"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Shield className="w-4 h-4 text-rose-600" />
            <span>الأمان والبلاغات</span>
          </button>
        </div>

        {feedback && (
          <div
            className={`rounded-2xl px-4 py-3 text-xs sm:text-sm font-bold border ${
              feedback.type === "ok"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-rose-50 border-rose-200 text-rose-700"
            }`}
          >
            {feedback.text}
          </div>
        )}

        {/* TAB 1: Profile & Contact Methods */}
        {subTab === "profile" && (
          <form onSubmit={handleSaveAll} className="space-y-5">
            <div className="rounded-3xl bg-white border border-slate-200 p-5 sm:p-6 shadow-2xs space-y-4">
              <h3 className="text-base font-extrabold text-slate-900">
                بيانات الملف الشخصي والمجموعة
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-700 block">
                    الاسم الكامل
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full h-12 rounded-2xl border border-slate-200 bg-slate-50/70 focus:bg-white px-4 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-700 block">
                    رقم الهاتف (محمي بإعدادات الخصوصية)
                  </label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+966501112233"
                    className="w-full h-12 rounded-2xl border border-slate-200 bg-slate-50/70 focus:bg-white px-4 text-base font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-700 block">
                    المجموعة / المجتمع
                  </label>
                  <input
                    type="text"
                    value={groupTag}
                    onChange={(e) => setGroupTag(e.target.value)}
                    placeholder="مجتمع عبود التقني"
                    className="w-full h-12 rounded-2xl border border-slate-200 bg-slate-50/70 focus:bg-white px-4 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-700 block">
                    المدينة
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="الرياض"
                    className="w-full h-12 rounded-2xl border border-slate-200 bg-slate-50/70 focus:bg-white px-4 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-slate-700 block">
                  نبذة مختصرة
                </label>
                <input
                  type="text"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full h-12 rounded-2xl border border-slate-200 bg-slate-50/70 focus:bg-white px-4 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Availability & Presence */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-700 block">
                    مستوى توفر الحساب للاتصال
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 h-12 p-1 rounded-2xl bg-slate-100">
                    {[
                      { id: "public", label: "عام" },
                      { id: "friends", label: "للأصدقاء" },
                      { id: "private", label: "خاص" },
                    ].map((av) => (
                      <button
                        key={av.id}
                        type="button"
                        onClick={() =>
                          setAvailabilityMode(av.id as AvailabilityMode)
                        }
                        className={`rounded-xl text-xs font-extrabold transition cursor-pointer ${
                          availabilityMode === av.id
                            ? "bg-white text-slate-900 shadow-2xs"
                            : "text-slate-600"
                        }`}
                      >
                        {av.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-700 block">
                    حالة التواجد المباشر
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 h-12 p-1 rounded-2xl bg-slate-100">
                    {[
                      {
                        id: "online",
                        label: "متصل الآن",
                        dot: "bg-emerald-500",
                      },
                      {
                        id: "unavailable",
                        label: "غير متاح",
                        dot: "bg-amber-500",
                      },
                      {
                        id: "offline",
                        label: "غير متصل",
                        dot: "bg-slate-400",
                      },
                    ].map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setPresenceStatus(st.id)}
                        className={`rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition cursor-pointer ${
                          presenceStatus === st.id
                            ? "bg-white text-slate-900 shadow-2xs"
                            : "text-slate-600"
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${st.dot}`} />
                        <span>{st.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Allowed Contact Channels */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="text-xs font-extrabold text-slate-800 block">
                  طرق الاتصال المتاحة التي تسمح بها:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <label className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={privacy.allowedContactMethods.internalMessage}
                      onChange={(e) =>
                        setPrivacy((prev) => ({
                          ...prev,
                          allowedContactMethods: {
                            ...prev.allowedContactMethods,
                            internalMessage: e.target.checked,
                          },
                        }))
                      }
                      className="w-4 h-4 rounded text-emerald-600"
                    />
                    <span className="text-xs font-bold text-slate-800">
                      رسالة داخلية (الافتراضي الآمن)
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={privacy.allowedContactMethods.email}
                      onChange={(e) =>
                        setPrivacy((prev) => ({
                          ...prev,
                          allowedContactMethods: {
                            ...prev.allowedContactMethods,
                            email: e.target.checked,
                          },
                        }))
                      }
                      className="w-4 h-4 rounded text-indigo-600"
                    />
                    <span className="text-xs font-bold text-slate-800">
                      التواصل عبر البريد الإلكتروني
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={privacy.allowedContactMethods.phone}
                      onChange={(e) =>
                        setPrivacy((prev) => ({
                          ...prev,
                          allowedContactMethods: {
                            ...prev.allowedContactMethods,
                            phone: e.target.checked,
                          },
                        }))
                      }
                      className="w-4 h-4 rounded text-emerald-600"
                    />
                    <span className="text-xs font-bold text-slate-800">
                      التواصل عبر رقم الهاتف
                    </span>
                  </label>
                </div>
              </div>

              {/* Password Change */}
              <div className="pt-3 border-t border-slate-100 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-extrabold text-slate-800">
                  <KeyRound className="w-4 h-4 text-indigo-600" />
                  <span>تغيير كلمة المرور (اختياري)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="password"
                    dir="ltr"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="كلمة المرور الحالية"
                    className="w-full h-11 rounded-2xl border border-slate-200 bg-slate-50/70 focus:bg-white px-4 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <input
                    type="password"
                    dir="ltr"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="كلمة المرور الجديدة (6+ خانات)"
                    className="w-full h-11 rounded-2xl border border-slate-200 bg-slate-50/70 focus:bg-white px-4 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full sm:w-auto h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-6 text-white font-extrabold text-sm inline-flex items-center justify-center gap-2 transition cursor-pointer"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري الحفظ...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>حفظ بيانات الملف الشخصي</span>
                  </>
                )}
              </button>
            </div>

            {/* Camera & Mic Test + Quick Account Switcher */}
            <div className="rounded-3xl bg-white border border-slate-200 p-5 sm:p-6 shadow-2xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    فحص الكاميرا والميكروفون قبل الاتصال
                  </h3>
                  <p className="text-xs text-slate-500">
                    اختبر جاهزية أجهزتك لمكالمات WebRTC المباشرة
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toggleMediaPreview}
                  className={`h-10 rounded-xl px-4 text-xs font-extrabold inline-flex items-center gap-2 transition cursor-pointer ${
                    testingMedia
                      ? "bg-rose-600 text-white"
                      : "bg-indigo-600 hover:bg-indigo-700 text-white"
                  }`}
                >
                  {testingMedia ? (
                    <>
                      <VideoOff className="w-4 h-4" />
                      <span>إيقاف المعاينة</span>
                    </>
                  ) : (
                    <>
                      <Video className="w-4 h-4" />
                      <span>تشغيل المعاينة</span>
                    </>
                  )}
                </button>
              </div>

              {testingMedia && (
                <div className="rounded-2xl overflow-hidden bg-slate-950 border border-slate-800">
                  <video
                    ref={previewVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full max-h-60 object-cover"
                  />
                  <div className="px-3.5 py-2 bg-slate-900 text-xs text-emerald-400 font-mono flex items-center justify-between">
                    <span>
                      {isSyntheticPreview
                        ? "بث كاميرا الاستوديو الذكية نشط"
                        : "الكاميرا والميكروفون يعملان بنجاح"}
                    </span>
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                </div>
              )}


            </div>
          </form>
        )}

        {/* TAB 2: Granular Privacy Controls */}
        {subTab === "privacy" && (
          <form
            onSubmit={handleSaveAll}
            className="rounded-3xl bg-white border border-slate-200 p-5 sm:p-6 shadow-2xs space-y-5"
          >
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-200 px-3 py-0.5 text-[11px] font-bold text-indigo-800">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                <span>تحكم كامل في خصوصية بياناتك</span>
              </div>
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900 pt-1">
                من يمكنه البحث عنك أو رؤية بياناتك؟
              </h3>
              <p className="text-xs text-slate-500">
                تُطبّق هذه القواعد على الخادم مباشرة قبل إرسال أي نتيجة بحث، ولا تُكشف أي بيانات حساسة بدون إذنك.
              </p>
            </div>

            <div className="divide-y divide-slate-100">
              {PRIVACY_FIELDS.map((field) => {
                const currentVal = privacy[field.key] || "everyone";
                return (
                  <div
                    key={field.key}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-0.5">
                      <div className="text-xs sm:text-sm font-extrabold text-slate-900">
                        {field.label}
                      </div>
                      <p className="text-[11px] text-slate-500">{field.hint}</p>
                    </div>

                    <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 shrink-0 sm:w-64">
                      {[
                        { id: "everyone", label: "الجميع" },
                        { id: "friends", label: "أصدقائي فقط" },
                        { id: "nobody", label: "ممنوع" },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            setPrivacy((prev) => ({
                              ...prev,
                              [field.key]: opt.id as PrivacyScope,
                            }))
                          }
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-extrabold transition cursor-pointer ${
                            currentVal === opt.id
                              ? "bg-white text-slate-900 shadow-2xs"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-6 text-white font-extrabold text-sm inline-flex items-center justify-center gap-2 transition cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جاري حفظ الخصوصية...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>حفظ وتطبيق إعدادات الخصوصية</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* TAB 3: Blocked Users, Reports History & Audit Logs */}
        {subTab === "security" && (
          <div className="space-y-5">
            {/* Blocked Users */}
            <div className="rounded-3xl bg-white border border-slate-200 p-5 sm:p-6 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-extrabold text-slate-900">
                  قائمة المستخدمين المحظورين ({blockedUsers.length})
                </h3>
                {loadingSecurity && (
                  <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                )}
              </div>

              {blockedUsers.length === 0 ? (
                <p className="text-xs text-slate-500">
                  لم تقم بحظر أي مستخدم حالياً.
                </p>
              ) : (
                <div className="space-y-2">
                  {blockedUsers.map((b) => (
                    <div
                      key={b.id}
                      className="rounded-2xl bg-slate-50 border border-slate-200 p-3 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5">
                        <img
                          src={b.avatarUrl || "/images/oboud-avatar.jpg"}
                          alt={b.displayName}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                        <div>
                          <div className="text-xs font-extrabold text-slate-900">
                            {b.displayName}
                          </div>
                          <div
                            className="text-[11px] font-mono text-slate-500"
                            dir="ltr"
                          >
                            @{b.username}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleUnblockUser(b.id)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-slate-200 hover:bg-emerald-50 hover:border-emerald-300 text-slate-700 hover:text-emerald-800 px-3 py-1.5 text-xs font-bold transition cursor-pointer"
                      >
                        <Unlock className="w-3.5 h-3.5" />
                        <span>إلغاء الحظر</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Reports History */}
            <div className="rounded-3xl bg-white border border-slate-200 p-5 sm:p-6 shadow-2xs space-y-3">
              <div className="flex items-center gap-2">
                <FileWarning className="w-4 h-4 text-rose-600" />
                <h3 className="text-base font-extrabold text-slate-900">
                  سجل البلاغات المرسلة ({reports.length})
                </h3>
              </div>

              {reports.length === 0 ? (
                <p className="text-xs text-slate-500">
                  لا توجد بلاغات مقدمة من حسابك.
                </p>
              ) : (
                <div className="space-y-2">
                  {reports.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-2xl border border-slate-200 p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="font-extrabold text-slate-900">
                          بلاغ ضد {r.reportedDisplayName} (@{r.reportedUsername})
                        </div>
                        <div className="text-slate-500">
                          السبب: {r.reason}{" "}
                          {r.details ? `• "${r.details}"` : ""}
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          r.adminAlertTriggered
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : "bg-amber-50 text-amber-800 border border-amber-200"
                        }`}
                      >
                        {r.adminAlertTriggered
                          ? "تم تنبيه الإدارة العليا 🛡️"
                          : "قيد المراجعة"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Audit Logs */}
            <div className="rounded-3xl bg-[#0F172A] text-slate-100 p-5 sm:p-6 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-emerald-400">
                  سجل التدقيق الأمني للعمليات الحساسة (Audit Logs)
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {auditLogs.length} events
                </span>
              </div>

              {auditLogs.length === 0 ? (
                <p className="text-xs text-slate-400">
                  سيتم تسجيل عمليات البحث وتعديل الخصوصية والبلاغات هنا تلقائياً.
                </p>
              ) : (
                <div
                  className="space-y-1.5 max-h-60 overflow-y-auto pr-1"
                  dir="ltr"
                >
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 font-mono text-[11px] flex flex-wrap items-center justify-between gap-2"
                    >
                      <span className="text-sky-300 font-bold">
                        {log.action}
                      </span>
                      <span className="text-slate-400 truncate max-w-xs">
                        {JSON.stringify(log.metadata || {})}
                      </span>
                      <span className="text-slate-500 text-[10px]">
                        {new Date(log.createdAt).toLocaleTimeString("en-GB")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
