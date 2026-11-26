"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Loader2,
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  PhoneCall,
  Share2,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { SafeSearchResultUser } from "@/types/oboud";

export default function ShareableUserProfilePage() {
  const params = useParams<{ username: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<SafeSearchResultUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/users/${encodeURIComponent(String(params.username || ""))}`, {
      credentials: "same-origin",
    })
      .then(async (res) => {
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        const data = await res.json();
        setProfile(data.profile || null);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [params.username]);

  const copyCurrentUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#F8FAFC] gap-3">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
        <p className="text-sm font-bold text-slate-600">
          جاري فحص أذونات الخصوصية وتحميل الملف الشخصي...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-emerald-50/60 via-[#F8FAFC] to-slate-100 px-4 py-6 sm:py-12 flex flex-col items-center justify-center">
      <div className="w-full max-w-md space-y-4">
        {/* Top Nav */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-2 rounded-2xl bg-white border border-slate-200 px-3.5 py-2 text-xs font-extrabold text-slate-800 shadow-2xs cursor-pointer"
          >
            <ArrowRight className="w-4 h-4 text-emerald-600" />
            <span>العودة لمنصة اتصل مع عبود</span>
          </button>

          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
            <PhoneCall className="w-4 h-4" />
            <span>اتصل مع عبود</span>
          </div>
        </div>

        <div className="rounded-3xl bg-white border border-slate-200 shadow-xl overflow-hidden">
          <div className="h-24 bg-gradient-to-l from-emerald-600 via-teal-600 to-indigo-700" />

          {notFound || !profile ? (
            <div className="p-8 text-center space-y-2">
              <h1 className="text-lg font-extrabold text-slate-900">
                لم يتم العثور على هذا المستخدم
              </h1>
              <p className="text-xs text-slate-500">
                تأكد من صحة اسم المستخدم أو عد للصفحة الرئيسية للبحث.
              </p>
            </div>
          ) : profile.isHiddenPrivate ? (
            <div className="p-8 text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 text-slate-500 flex items-center justify-center mx-auto -mt-14 shadow-sm">
                <Lock className="w-7 h-7" />
              </div>
              <h1 className="text-lg font-extrabold text-slate-900">
                {profile.hiddenMessage || "هذا المستخدم غير متاح للبحث حاليًا"}
              </h1>
              <p className="text-xs text-slate-500 leading-relaxed">
                يحترم نظام &quot;اتصل مع عبود&quot; إعدادات الخصوصية الصارمة ولا يعرض بيانات الحسابات الخاصة بدون إذن أصحابها.
              </p>
            </div>
          ) : (
            <div className="px-6 pb-6 -mt-12 space-y-4">
              <div className="flex items-end justify-between">
                <img
                  src={profile.avatarUrl || "/images/oboud-avatar.jpg"}
                  alt={profile.displayName}
                  className="w-24 h-24 rounded-3xl object-cover border-4 border-white shadow-md bg-white"
                />
                <button
                  type="button"
                  onClick={copyCurrentUrl}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>تم نسخ الرابط</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-3.5 h-3.5 text-indigo-600" />
                      <span>نسخ الرابط</span>
                    </>
                  )}
                </button>
              </div>

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-extrabold text-slate-900">
                    {profile.displayName}
                  </h1>
                  <span
                    className="text-xs font-mono text-slate-500"
                    dir="ltr"
                  >
                    @{profile.username}
                  </span>
                </div>

                {profile.bio && (
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {profile.bio}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  {profile.groupTag && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                      <Users className="w-3.5 h-3.5 text-indigo-600" />
                      <span>{profile.groupTag}</span>
                    </span>
                  )}
                  {profile.city && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{profile.city}</span>
                    </span>
                  )}
                </div>
              </div>

              {(profile.visibleEmail || profile.visiblePhone) && (
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3.5 space-y-2">
                  <div className="text-[11px] font-bold text-slate-500">
                    وسائل اتصال مسموحة من المستخدم:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {profile.visibleEmail && (
                      <a
                        href={`mailto:${profile.visibleEmail}`}
                        dir="ltr"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-slate-200 px-3 py-1.5 text-xs font-mono font-bold text-slate-800"
                      >
                        <Mail className="w-3.5 h-3.5 text-indigo-600" />
                        <span>{profile.visibleEmail}</span>
                      </a>
                    )}
                    {profile.visiblePhone && (
                      <a
                        href={`tel:${profile.visiblePhone}`}
                        dir="ltr"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-slate-200 px-3 py-1.5 text-xs font-mono font-bold text-slate-800"
                      >
                        <Phone className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{profile.visiblePhone}</span>
                      </a>
                    )}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => router.push("/")}
                className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm inline-flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 transition cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                <span>افتح المنصة للتواصل الآمن أو بدء مكالمة</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>محمي بنظام خصوصية البيانات في منصة اتصل مع عبود</span>
        </div>
      </div>
    </div>
  );
}
