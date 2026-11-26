"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  AtSign,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogIn,
  Mail,
  PhoneCall,
  ShieldCheck,
  User,
  UserPlus,
  Video,
} from "lucide-react";
import type { PublicUser } from "@/types/oboud";

interface MobileAuthPageProps {
  demoUsers?: PublicUser[];
  onAuthenticated: (
    user: PublicUser,
    token: string,
    rememberDevice: boolean
  ) => void;
  initialMode?: "login" | "register";
}

export function MobileAuthPage({
  onAuthenticated,
  initialMode = "login",
}: MobileAuthPageProps) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);

  // Login fields
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);

  // Register fields
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Status
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError("يرجى إدخال اسم المستخدم أو البريد الإلكتروني وكلمة المرور");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: identifier.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "بيانات الدخول غير صحيحة");
      } else {
        onAuthenticated(data.user, data.token, rememberDevice);
      }
    } catch {
      setError("تعذر الاتصال بالخادم، يرجى المحاولة مرة أخرى");
    } finally {
      setBusy(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !displayName.trim() ||
      !username.trim() ||
      !email.trim() ||
      !regPassword
    ) {
      setError("يرجى تعبئة جميع الحقول المطلوبة لإنشاء الحساب");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          username: username.trim(),
          email: email.trim(),
          password: regPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "تعذر إنشاء الحساب");
      } else {
        onAuthenticated(data.user, data.token, rememberDevice);
      }
    } catch {
      setError("حدث خطأ في الشبكة أثناء إنشاء الحساب");
    } finally {
      setBusy(false);
    }
  };

  const passwordStrength =
    regPassword.length === 0
      ? 0
      : regPassword.length < 6
      ? 1
      : regPassword.length < 9
      ? 2
      : 3;

  return (
    <div className="min-h-[100dvh] w-full bg-gradient-to-b from-emerald-50/70 via-[#F8FAFC] to-[#F1F5F9] flex flex-col justify-between px-4 py-6 sm:py-10 overflow-y-auto">
      <div className="w-full max-w-[440px] mx-auto space-y-5 my-auto">
        {/* Compact Mobile-Friendly Brand Header */}
        <div className="text-center space-y-2.5 px-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-md shadow-emerald-600/20 mx-auto">
            <PhoneCall className="w-7 h-7" />
          </div>

          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white border border-emerald-200 px-3 py-0.5 text-[11px] font-bold text-emerald-800 shadow-2xs">
              <Video className="w-3.5 h-3.5 text-emerald-600" />
              <span>مكالمات WebRTC P2P واكتشاف عالمي للأصدقاء</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              اتصل مع عبود
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              تواصل بالصوت والفيديو عالي الدقة واكتشف أصدقاءك على المنصة بكل سلاسة وأمان
            </p>
          </div>
        </div>

        {/* Organized Main Auth Card */}
        <div className="rounded-3xl bg-white border border-slate-200/90 shadow-lg shadow-slate-200/50 p-5 sm:p-7 space-y-5">
          {/* Clean 2-Tab Segmented Switcher */}
          <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-slate-100 border border-slate-200/60">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
              }}
              className={`h-11 rounded-xl flex items-center justify-center gap-2 text-sm font-extrabold transition cursor-pointer ${
                mode === "login"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <LogIn className="w-4 h-4 text-emerald-600" />
              <span>تسجيل الدخول</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError(null);
              }}
              className={`h-11 rounded-xl flex items-center justify-center gap-2 text-sm font-extrabold transition cursor-pointer ${
                mode === "register"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <UserPlus className="w-4 h-4 text-indigo-600" />
              <span>إنشاء حساب</span>
            </button>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 flex items-start gap-2.5 text-xs sm:text-sm font-bold text-rose-700">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {mode === "login" ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              {/* Identifier Field */}
              <div className="space-y-1.5">
                <label
                  htmlFor="login-identifier"
                  className="text-xs font-extrabold text-slate-800 block"
                >
                  البريد أو رقم الهاتف أو اسم المستخدم
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-identifier"
                    type="text"
                    dir="ltr"
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="username أو email@domain.com"
                    className="w-full h-12 rounded-2xl border border-slate-200 bg-slate-50/70 focus:bg-white pl-10 pr-4 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-1.5">
                <label
                  htmlFor="login-password"
                  className="text-xs font-extrabold text-slate-800 block"
                >
                  كلمة المرور
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    dir="ltr"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-12 rounded-2xl border border-slate-200 bg-slate-50/70 focus:bg-white pl-10 pr-12 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={
                      showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"
                    }
                    className="w-10 h-10 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 flex items-center justify-center absolute right-1.5 top-1/2 -translate-y-1/2 transition cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Remember Me Checkbox */}
              <div className="flex items-center justify-between pt-0.5">
                <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberDevice}
                    onChange={(e) => setRememberDevice(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-bold text-slate-700">
                    البقاء متصلاً على هذا الجهاز
                  </span>
                </label>

                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>JWT آمن</span>
                </span>
              </div>

              {/* Primary Submit Button */}
              <button
                type="submit"
                disabled={busy}
                className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-55 text-white font-extrabold text-sm sm:text-base shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition cursor-pointer"
              >
                {busy ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>جاري التحقق وتسجيل الدخول...</span>
                  </>
                ) : (
                  <>
                    <span>تسجيل الدخول</span>
                    <ArrowLeft className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* Organized Mobile Registration Form */
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              {/* Full Name */}
              <div className="space-y-1">
                <label
                  htmlFor="reg-displayname"
                  className="text-xs font-extrabold text-slate-800 block"
                >
                  الاسم الشخصي أو الكامل
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="reg-displayname"
                    type="text"
                    autoComplete="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="مثال: أحمد الكيلاني"
                    className="w-full h-12 rounded-2xl border border-slate-200 bg-slate-50/70 focus:bg-white pr-10 pl-4 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  />
                </div>
              </div>

              {/* Username */}
              <div className="space-y-1">
                <label
                  htmlFor="reg-username"
                  className="text-xs font-extrabold text-slate-800 block"
                >
                  اسم المستخدم الفريد (@Username)
                </label>
                <div className="relative">
                  <AtSign className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="reg-username"
                    type="text"
                    dir="ltr"
                    autoComplete="username"
                    value={username}
                    onChange={(e) =>
                      setUsername(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9_.-]/g, "")
                      )
                    }
                    placeholder="ahmad_k"
                    className="w-full h-12 rounded-2xl border border-slate-200 bg-slate-50/70 focus:bg-white pl-10 pr-4 text-base font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1">
                <label
                  htmlFor="reg-email"
                  className="text-xs font-extrabold text-slate-800 block"
                >
                  البريد الإلكتروني
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="reg-email"
                    type="email"
                    inputMode="email"
                    dir="ltr"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ahmad@example.com"
                    className="w-full h-12 rounded-2xl border border-slate-200 bg-slate-50/70 focus:bg-white pl-10 pr-4 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  />
                </div>
              </div>

              {/* Password + Strength Meter */}
              <div className="space-y-1.5">
                <label
                  htmlFor="reg-password"
                  className="text-xs font-extrabold text-slate-800 block"
                >
                  كلمة المرور (6 خانات على الأقل)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="reg-password"
                    type={showRegPassword ? "text" : "password"}
                    dir="ltr"
                    autoComplete="new-password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-12 rounded-2xl border border-slate-200 bg-slate-50/70 focus:bg-white pl-10 pr-12 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPassword((v) => !v)}
                    aria-label={
                      showRegPassword
                        ? "إخفاء كلمة المرور"
                        : "إظهار كلمة المرور"
                    }
                    className="w-10 h-10 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 flex items-center justify-center absolute right-1.5 top-1/2 -translate-y-1/2 transition cursor-pointer"
                  >
                    {showRegPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {regPassword.length > 0 && (
                  <div className="space-y-1 pt-0.5">
                    <div className="grid grid-cols-3 gap-1.5">
                      {[1, 2, 3].map((step) => (
                        <div
                          key={step}
                          className={`h-1.5 rounded-full transition-colors ${
                            passwordStrength >= step
                              ? passwordStrength === 1
                                ? "bg-rose-500"
                                : passwordStrength === 2
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                              : "bg-slate-200"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {passwordStrength === 1
                        ? "قصيرة جداً — أضف 6 خانات على الأقل"
                        : passwordStrength === 2
                        ? "قوة متوسطة وجاهزة للتشفير بـ bcrypt"
                        : "كلمة مرور قوية وممتازة"}
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-indigo-50/70 border border-indigo-100 px-3.5 py-2.5 flex items-center gap-2 text-xs text-indigo-900">
                <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>
                  بمجرد التسجيل، سيظهر حسابك فوراً في نظام <strong>«اكتشف الأشخاص»</strong> للتواصل مع بقية الأعضاء وفق إعدادات خصوصيتك.
                </span>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-55 text-white font-extrabold text-sm sm:text-base shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 transition cursor-pointer"
              >
                {busy ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>جاري إنشاء الحساب...</span>
                  </>
                ) : (
                  <>
                    <span>إنشاء الحساب والبدء الآن</span>
                    <ArrowLeft className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Clean Mobile Trust Badges */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] font-semibold text-slate-500 px-2">
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            تشفير bcrypt + JWT
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            اتصال P2P مباشر
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
            متوافق مع الجوال والكمبيوتر
          </span>
        </div>
      </div>
    </div>
  );
}
