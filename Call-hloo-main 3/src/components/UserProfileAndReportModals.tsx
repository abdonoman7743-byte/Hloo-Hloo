"use client";

import React, { useState } from "react";
import {
  Check,
  Flag,
  Hand,
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Share2,
  ShieldAlert,
  ShieldBan,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  Video,
  X,
} from "lucide-react";
import { getPresenceBadgePresentation } from "@/lib/presence-format";
import type { PublicUser, SafeSearchResultUser } from "@/types/oboud";

interface UserProfileModalProps {
  profile: SafeSearchResultUser | null;
  onClose: () => void;
  onOpenChat: (profile: SafeSearchResultUser) => void;
  onStartCall: (peer: PublicUser, type: "video" | "audio") => void;
  onSendFriendRequest: (targetUserId: string) => Promise<void>;
  onUpdateFriendRelation?: (
    peerUserId: string,
    action: "accept" | "reject" | "cancel" | "remove"
  ) => Promise<void>;
  onSendWelcomeWave: (username: string) => Promise<string | null>;
  onBlockUser: (targetUserId: string) => Promise<void>;
  onOpenReport: (profile: SafeSearchResultUser) => void;
}

export function UserProfileModal({
  profile,
  onClose,
  onOpenChat,
  onStartCall,
  onSendFriendRequest,
  onUpdateFriendRelation,
  onSendWelcomeWave,
  onBlockUser,
  onOpenReport,
}: UserProfileModalProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [waveFeedback, setWaveFeedback] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  if (!profile) return null;

  const copyShareUrl = async () => {
    try {
      const shareUrl = `${window.location.origin}/u/${encodeURIComponent(
        profile.username
      )}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      // ignore
    }
  };

  const handleWave = async () => {
    setBusyAction("wave");
    const msg = await onSendWelcomeWave(profile.username);
    setBusyAction(null);
    setWaveFeedback(msg || "تم إرسال تحية الترحيب بنجاح!");
    setTimeout(() => setWaveFeedback(null), 3500);
  };

  const presenceInfo = getPresenceBadgePresentation({
    presenceStatus: profile.presenceStatus,
    lastSeenAt: profile.lastSeenAt,
    presenceHiddenByPrivacy: profile.presenceHiddenByPrivacy,
  });

  const asPublicPeer: PublicUser = {
    id: profile.id,
    username: profile.username,
    firstName: profile.firstName,
    displayName: profile.displayName,
    email: profile.visibleEmail || `${profile.username}@oboud.app`,
    phone: profile.visiblePhone,
    city: profile.city,
    groupTag: profile.groupTag,
    avatarUrl: profile.avatarUrl,
    bio: profile.bio,
    presenceStatus: profile.presenceStatus,
    lastSeenAt: profile.lastSeenAt,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden max-h-[92dvh] overflow-y-auto">
        {/* Top Cover */}
        <div className="h-24 bg-gradient-to-l from-emerald-600 via-teal-600 to-indigo-700 relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 left-3 w-9 h-9 rounded-xl bg-black/25 hover:bg-black/40 text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 sm:px-6 pb-6 -mt-11 space-y-4">
          {profile.isHiddenPrivate ? (
            <div className="pt-12 text-center space-y-3 py-6">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 text-slate-500 flex items-center justify-center mx-auto">
                <Lock className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-extrabold text-slate-900">
                {profile.hiddenMessage || "هذا المستخدم غير متاح للبحث حاليًا"}
              </h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                قام صاحب الحساب بتخصيص إعدادات الخصوصية لإخفاء ملفه الشخصي وبيانات التواصل الخاصة به.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-end justify-between gap-3">
                <div className="relative">
                  <img
                    src={profile.avatarUrl || "/images/oboud-avatar.jpg"}
                    alt={profile.displayName}
                    className="w-22 h-22 rounded-3xl object-cover border-4 border-white shadow-md bg-white"
                  />
                  <span
                    className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-white ${presenceInfo.dotClass}`}
                  />
                </div>

                <div className="flex items-center gap-2 pb-1">
                  <button
                    type="button"
                    onClick={copyShareUrl}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 transition cursor-pointer"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>تم نسخ الرابط!</span>
                      </>
                    ) : (
                      <>
                        <Share2 className="w-3.5 h-3.5 text-indigo-600" />
                        <span>مشاركة الملف</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xl font-extrabold text-slate-900">
                    {profile.displayName}
                  </h3>
                  <span
                    className="text-xs font-mono text-slate-500"
                    dir="ltr"
                  >
                    @{profile.username}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] ${presenceInfo.pillClass}`}
                  >
                    {presenceInfo.label}
                  </span>
                </div>

                {profile.bio && (
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    {profile.bio}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {profile.groupTag && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">
                      <Users className="w-3.5 h-3.5 text-indigo-600" />
                      <span>{profile.groupTag}</span>
                    </span>
                  )}
                  {profile.city && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{profile.city}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Allowed External Contact Info */}
              {(profile.visibleEmail || profile.visiblePhone) && (
                <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-3.5 space-y-2">
                  <div className="text-[11px] font-extrabold text-slate-500">
                    قنوات التواصل الإضافية المسموح بها:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {profile.visibleEmail && (
                      <a
                        href={`mailto:${profile.visibleEmail}`}
                        dir="ltr"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 px-3 py-1.5 text-xs font-mono font-semibold text-slate-800 transition"
                      >
                        <Mail className="w-3.5 h-3.5 text-indigo-600" />
                        <span>{profile.visibleEmail}</span>
                      </a>
                    )}
                    {profile.visiblePhone && (
                      <a
                        href={`tel:${profile.visiblePhone}`}
                        dir="ltr"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-slate-200 hover:border-emerald-300 px-3 py-1.5 text-xs font-mono font-semibold text-slate-800 transition"
                      >
                        <Phone className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{profile.visiblePhone}</span>
                      </a>
                    )}
                  </div>
                </div>
              )}

              {waveFeedback && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2 text-xs font-bold text-emerald-800">
                  {waveFeedback}
                </div>
              )}

              {/* Direct Communication Actions: Chat, Audio Call, Video Call, Friend Request */}
              {profile.relationship !== "self" && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {profile.canMessageInternally ? (
                      <button
                        type="button"
                        onClick={() => {
                          onOpenChat(profile);
                          onClose();
                        }}
                        className="h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span>بدء المحادثة</span>
                      </button>
                    ) : (
                      <div className="h-11 rounded-xl bg-slate-100 text-slate-400 text-[11px] font-bold inline-flex items-center justify-center gap-1">
                        <Lock className="w-3.5 h-3.5" />
                        <span>المحادثة للأصدقاء</span>
                      </div>
                    )}

                    {profile.canCall ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            onStartCall(asPublicPeer, "audio");
                            onClose();
                          }}
                          className="h-11 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-800 text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          <Phone className="w-4 h-4" />
                          <span>اتصال صوتي</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onStartCall(asPublicPeer, "video");
                            onClose();
                          }}
                          className="col-span-2 sm:col-span-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          <Video className="w-4 h-4" />
                          <span>اتصال مرئي</span>
                        </button>
                      </>
                    ) : (
                      <div className="col-span-1 sm:col-span-2 h-11 rounded-xl bg-slate-100 text-slate-400 text-[11px] font-bold inline-flex items-center justify-center gap-1">
                        <Lock className="w-3.5 h-3.5" />
                        <span>الاتصال الصوتي والمرئي مسموح للأصدقاء</span>
                      </div>
                    )}
                  </div>

                  {/* Friendship Status Row */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {profile.relationship === "friend" ? (
                      <div className="flex-1 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-extrabold inline-flex items-center justify-center gap-1.5">
                        <UserCheck className="w-4 h-4" />
                        <span>أنتما صديقان على المنصة</span>
                      </div>
                    ) : profile.relationship === "outgoing_pending" ? (
                      <button
                        type="button"
                        disabled={busyAction === "cancel"}
                        onClick={async () => {
                          if (!onUpdateFriendRelation) return;
                          setBusyAction("cancel");
                          await onUpdateFriendRelation(profile.id, "cancel");
                          setBusyAction(null);
                          onClose();
                        }}
                        className="flex-1 h-10 rounded-xl bg-amber-50 hover:bg-rose-50 border border-amber-200 hover:border-rose-200 text-amber-800 hover:text-rose-700 text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <UserX className="w-4 h-4" />
                        <span>إلغاء طلب الصداقة المرسل</span>
                      </button>
                    ) : profile.relationship === "incoming_pending" ? (
                      <div className="flex-1 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            if (!onUpdateFriendRelation) return;
                            await onUpdateFriendRelation(profile.id, "accept");
                            onClose();
                          }}
                          className="flex-1 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold cursor-pointer"
                        >
                          قبول طلب الصداقة
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!onUpdateFriendRelation) return;
                            await onUpdateFriendRelation(profile.id, "reject");
                            onClose();
                          }}
                          className="h-10 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                        >
                          رفض
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={busyAction === "add"}
                        onClick={async () => {
                          setBusyAction("add");
                          await onSendFriendRequest(profile.id);
                          setBusyAction(null);
                        }}
                        className="flex-1 h-10 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <UserPlus className="w-4 h-4" />
                        <span>إضافة كصديق</span>
                      </button>
                    )}

                    {profile.canMessageInternally && (
                      <button
                        type="button"
                        disabled={busyAction === "wave"}
                        onClick={handleWave}
                        className="h-10 px-3.5 rounded-xl bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-800 text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Hand className="w-4 h-4" />
                        <span>ترحيب</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Safety Actions: Block & Report */}
              {profile.relationship !== "self" && (
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <button
                    type="button"
                    onClick={async () => {
                      await onBlockUser(profile.id);
                      onClose();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-bold text-slate-500 hover:text-rose-700 hover:bg-rose-50 transition cursor-pointer"
                  >
                    <ShieldBan className="w-3.5 h-3.5" />
                    <span>حظر المستخدم</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenReport(profile);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-bold text-slate-500 hover:text-amber-700 hover:bg-amber-50 transition cursor-pointer"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span>إبلاغ عن إساءة</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface ReportUserModalProps {
  target: SafeSearchResultUser | null;
  onClose: () => void;
  jwtToken: string;
  onReportSubmitted: () => void;
}

const REPORT_REASONS = [
  { id: "spam", label: "رسائل مزعجة أو عشوائية (Spam)" },
  { id: "harassment", label: "مضايقة أو سلوك غير لائق" },
  { id: "impersonation", label: "انتحال شخصية عضو آخر" },
  { id: "privacy_violation", label: "محاولة انتهاك الخصوصية" },
  { id: "other", label: "سبب آخر" },
];

export function ReportUserModal({
  target,
  onClose,
  jwtToken,
  onReportSubmitted,
}: ReportUserModalProps) {
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resultMsg, setResultMsg] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  if (!target) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResultMsg(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          
        },
        body: JSON.stringify({
          reportedUserId: target.id,
          reason,
          details,
          alsoBlock,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResultMsg({
          ok: false,
          text: data.error || "تعذر إرسال البلاغ",
        });
      } else {
        setResultMsg({
          ok: true,
          text: data.message || "تم تسجيل البلاغ بنجاح",
        });
        onReportSubmitted();
        setTimeout(() => {
          onClose();
          setResultMsg(null);
          setDetails("");
        }, 1600);
      }
    } catch {
      setResultMsg({ ok: false, text: "حدث خطأ في الاتصال بالخادم" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 bg-rose-50/70 border-b border-rose-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                الإبلاغ عن @{target.username}
              </h3>
              <p className="text-[11px] text-slate-500">
                يتم التعامل مع البلاغات بسرية تامة وتنبيه الإدارة عند تكرار الإساءة
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {resultMsg && (
            <div
              className={`rounded-2xl px-4 py-3 text-xs font-bold border ${
                resultMsg.ok
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-rose-50 border-rose-200 text-rose-700"
              }`}
            >
              {resultMsg.text}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-extrabold text-slate-800 block">
              سبب الإبلاغ
            </label>
            <div className="space-y-1.5">
              {REPORT_REASONS.map((r) => (
                <label
                  key={r.id}
                  className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs font-bold cursor-pointer transition ${
                    reason === r.id
                      ? "border-rose-500 bg-rose-50/50 text-rose-900"
                      : "border-slate-200 hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    checked={reason === r.id}
                    onChange={() => setReason(r.id)}
                    className="text-rose-600 focus:ring-rose-500"
                  />
                  <span>{r.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-extrabold text-slate-800 block">
              تفاصيل إضافية (اختياري)
            </label>
            <textarea
              rows={2}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="اكتب أي توضيح يساعد فريق الأمان..."
              className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 focus:bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <label className="flex items-center gap-2.5 rounded-xl bg-slate-50 border border-slate-200 p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={alsoBlock}
              onChange={(e) => setAlsoBlock(e.target.checked)}
              className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500"
            />
            <span className="text-xs font-bold text-slate-800">
              حظر هذا المستخدم فوراً ومنعه من مراسلتي أو البحث عني
            </span>
          </label>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 h-11 rounded-2xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm transition cursor-pointer"
            >
              {submitting ? "جاري تسجيل البلاغ..." : "إرسال البلاغ الآمن"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-4 rounded-2xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
