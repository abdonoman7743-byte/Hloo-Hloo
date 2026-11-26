"use client";

import React, { useState } from "react";
import {
  CheckCircle2,
  KeyRound,
  LogIn,
  Sparkles,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { PublicUser } from "@/types/oboud";

interface AuthSwitcherModalProps {
  open: boolean;
  onClose: () => void;
  currentUser: PublicUser | null;
  demoUsers: PublicUser[];
  onAuthenticated: (user: PublicUser, token: string) => void;
}

export function AuthSwitcherModal({
  open,
  onClose,
  currentUser,
  demoUsers,
  onAuthenticated,
}: AuthSwitcherModalProps) {
  const [tab, setTab] = useState<"quick" | "login" | "register">("quick");
  const [identifier, setIdentifier] = useState("oboud@oboud.app");
  const [password, setPassword] = useState("oboud123");

  const [regDisplayName, setRegDisplayName] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleQuickSwitch = async (username: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quickSwitchUsername: username }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "تعذر تبديل الحساب");
      } else {
        onAuthenticated(data.user, data.token);
        onClose();
      }
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "بيانات الدخول غير صحيحة");
      } else {
        onAuthenticated(data.user, data.token);
        onClose();
      }
    } catch {
      setError("حدث خطأ في الاتصال");
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: regDisplayName,
          username: regUsername,
          email: regEmail,
          password: regPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "تعذر إنشاء الحساب");
      } else {
        onAuthenticated(data.user, data.token);
        onClose();
      }
    } catch {
      setError("حدث خطأ أثناء التسجيل");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">
                الهوية والجلسات (JWT HS256 + bcrypt)
              </h3>
              <p className="text-xs text-slate-500">
                كل تبويب متصفح يحتفظ برمز JWT مستقل لاختبار المكالمات الحية
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="grid grid-cols-3 gap-1.5 p-3 bg-slate-100/80 border-b border-slate-200/70">
          <button
            type="button"
            onClick={() => {
              setTab("quick");
              setError(null);
            }}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition cursor-pointer ${
              tab === "quick"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Users className="w-3.5 h-3.5 text-emerald-600" />
            <span>تبديل سريع</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("login");
              setError(null);
            }}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition cursor-pointer ${
              tab === "login"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <LogIn className="w-3.5 h-3.5 text-indigo-600" />
            <span>تسجيل دخول</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("register");
              setError(null);
            }}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition cursor-pointer ${
              tab === "register"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <UserPlus className="w-3.5 h-3.5 text-sky-600" />
            <span>حساب جديد</span>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs font-semibold text-rose-700">
              {error}
            </div>
          )}

          {tab === "quick" && (
            <div className="space-y-4">
              <div className="rounded-xl bg-emerald-50/80 border border-emerald-200 p-3.5 text-xs text-emerald-900 leading-relaxed flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>نصيحة لاختبار اتصال WebRTC الحقيقي بين نافذتين:</strong>{" "}
                  أبقِ هذا التبويب على حساب <strong>عبود الحسن</strong>، وافتح
                  تبويباً ثانياً واختر <strong>سارة المنصور</strong> ثم اضغط
                  اتصال!
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {demoUsers.map((u) => {
                  const isCurrent = currentUser?.id === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      disabled={busy}
                      onClick={() => handleQuickSwitch(u.username)}
                      className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-right transition cursor-pointer ${
                        isCurrent
                          ? "border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500/30"
                          : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={u.avatarUrl || "/images/oboud-avatar.jpg"}
                          alt={u.displayName}
                          className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-slate-900 truncate">
                            {u.displayName}
                          </div>
                          <div
                            className="font-mono text-xs text-slate-500 truncate"
                            dir="ltr"
                          >
                            @{u.username}
                          </div>
                        </div>
                      </div>
                      {isCurrent && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "login" && (
            <form onSubmit={handleLogin} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  البريد الإلكتروني أو اسم المستخدم
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="oboud@oboud.app"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  كلمة المرور (مشفرة بـ bcrypt)
                </label>
                <input
                  type="password"
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  كلمة مرور الحسابات التجريبية الافتراضية:{" "}
                  <code className="bg-slate-100 px-1.5 py-0.5 rounded">
                    oboud123
                  </code>
                </p>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-2.5 text-sm transition cursor-pointer"
              >
                {busy ? "جاري التحقق وإصدار JWT..." : "تسجيل الدخول"}
              </button>
            </form>
          )}

          {tab === "register" && (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    الاسم الكامل بالعربية أو الإنجليزية
                  </label>
                  <input
                    type="text"
                    value={regDisplayName}
                    onChange={(e) => setRegDisplayName(e.target.value)}
                    placeholder="أحمد الكيلاني"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اسم المستخدم (بالإنجليزية)
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    placeholder="ahmad_k"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  البريد الإلكتروني
                </label>
                <input
                  type="email"
                  dir="ltr"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="ahmad@example.com"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  كلمة المرور (6 خانات على الأقل)
                </label>
                <input
                  type="password"
                  dir="ltr"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-2.5 text-sm transition cursor-pointer"
              >
                {busy
                  ? "جاري التشفير بـ bcrypt وإنشاء الحساب..."
                  : "إنشاء حساب والربط مع عبود"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
