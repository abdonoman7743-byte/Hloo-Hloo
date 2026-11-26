"use client";

import React, { useEffect, useState } from "react";
import { ArchitectureStudioView } from "@/components/ArchitectureStudioView";

interface OwnerData {
  webrtc: { activeCalls: number };
  postgres: { version: string | null };
  uptimeSec: number;
  memoryMb: number;
  recentLogs: {
    action: string;
    ipHint: string | null;
    createdAt: string;
  }[];
}

function LoginForm() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error || "تعذر تسجيل الدخول");
    window.location.reload();
  };
  return (
    <main dir="rtl" className="min-h-screen grid place-items-center bg-slate-50 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-6 shadow">
        <h1 className="text-lg font-extrabold">دخول المالك</h1>
        <input className="w-full rounded-xl border p-3 text-sm" placeholder="البريد أو اسم المستخدم" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" />
        <input className="w-full rounded-xl border p-3 text-sm" type="password" placeholder="كلمة المرور" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button className="w-full rounded-xl bg-slate-900 p-3 text-sm font-bold text-white">دخول</button>
      </form>
    </main>
  );
}

function Panel() {
  const [d, setD] = useState<OwnerData | null>(null);
  const load = async () => {
    const res = await fetch("/api/architecture/stats");
    if (res.ok) setD(await res.json());
  };
  useEffect(() => {
    const t0 = setTimeout(load, 0);
    const t = setInterval(load, 15000);
    return () => { clearTimeout(t0); clearInterval(t); };
  }, []);
  if (!d) return null;
  return (
    <section dir="rtl" className="mx-auto max-w-6xl space-y-3 p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-sm">
        <div className="rounded-xl bg-white p-3 shadow-xs">مكالمات نشطة: <b>{d.webrtc.activeCalls}</b></div>
        <div className="rounded-xl bg-white p-3 shadow-xs">التشغيل (ث): <b>{d.uptimeSec}</b></div>
        <div className="rounded-xl bg-white p-3 shadow-xs">الذاكرة: <b>{d.memoryMb} MB</b></div>
        <div className="rounded-xl bg-white p-3 shadow-xs" dir="ltr">{d.postgres.version?.split(" on ")[0]}</div>
      </div>
      <div className="rounded-xl bg-white p-3 shadow-xs">
        <h2 className="mb-2 text-sm font-extrabold">سجلات النظام</h2>
        <ul className="max-h-64 overflow-auto text-xs font-mono space-y-1" dir="ltr">
          {d.recentLogs.map((l, i) => (
            <li key={i}>{new Date(l.createdAt).toISOString()} · {l.action} · {l.ipHint ?? "-"}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function OwnerArchitecture({ authenticated }: { authenticated: boolean }) {
  if (!authenticated) return <LoginForm />;
  return (
    <div className="min-h-screen bg-slate-50">
      <Panel />
      <ArchitectureStudioView />
    </div>
  );
}
