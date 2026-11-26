"use client";

import React, { useState } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Code2,
  Phone,
  PhoneMissed,
  ShieldCheck,
  Video,
} from "lucide-react";
import type { CallLogItem, PublicUser } from "@/types/oboud";

interface CallHistoryViewProps {
  calls: CallLogItem[];
  currentUserId: string;
  onStartCall: (peer: PublicUser, callType: "video" | "audio") => void;
}

function formatCallDuration(sec: number | null): string {
  if (sec === null || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s} ثانية`;
  return `${m} د و ${s} ث`;
}

export function CallHistoryView({
  calls,
  currentUserId,
  onStartCall,
}: CallHistoryViewProps) {
  const [filter, setFilter] = useState<"all" | "video" | "audio" | "missed">(
    "all"
  );
  const [selectedCallId, setSelectedCallId] = useState<string | null>(
    calls[0]?.id ?? null
  );
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  const filteredCalls = calls.filter((c) => {
    if (filter === "video") return c.type === "video";
    if (filter === "audio") return c.type === "audio";
    if (filter === "missed") return c.status === "missed";
    return true;
  });

  const activeCall =
    filteredCalls.find((c) => c.id === selectedCallId) ??
    filteredCalls[0] ??
    null;

  return (
    <div className="h-full flex flex-col lg:flex-row overflow-hidden bg-[#F8FAFC]">
      {/* Right Column (RTL): Call List */}
      <div
        className={`w-full lg:w-[420px] border-l border-slate-200 bg-white flex-col h-full ${
          mobileShowDetail ? "hidden lg:flex" : "flex"
        }`}
      >
        <div className="p-4 sm:p-5 border-b border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
              سجل المكالمات
            </h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-mono font-bold text-slate-600">
              {filteredCalls.length}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5 bg-slate-100 p-1 rounded-xl">
            {[
              { id: "all", label: "الكل" },
              { id: "video", label: "مرئية" },
              { id: "audio", label: "صوتية" },
              { id: "missed", label: "فائتة" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() =>
                  setFilter(f.id as "all" | "video" | "audio" | "missed")
                }
                className={`py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                  filter === f.id
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 pb-20 md:pb-0">
          {filteredCalls.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              لا توجد سجلات مطابقة لهذا التصنيف بعد.
            </div>
          ) : (
            filteredCalls.map((c) => {
              const peerObj =
                c.callerId === currentUserId ? c.callee : c.caller;
              const isSelected = activeCall?.id === c.id;
              const isMissed = c.status === "missed";

              return (
                <div
                  key={c.id}
                  onClick={() => {
                    setSelectedCallId(c.id);
                    setMobileShowDetail(true);
                  }}
                  className={`p-4 flex items-center justify-between gap-3 transition cursor-pointer ${
                    isSelected
                      ? "lg:bg-indigo-50/70 lg:border-r-4 lg:border-indigo-600 hover:bg-slate-50"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={peerObj?.avatarUrl || "/images/oboud-avatar.jpg"}
                      alt={peerObj?.displayName || "مستخدم"}
                      className="w-11 h-11 rounded-full object-cover border border-slate-200 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-slate-900 truncate">
                        {peerObj?.displayName || "جهة اتصال"}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs mt-0.5">
                        {isMissed ? (
                          <PhoneMissed className="w-3.5 h-3.5 text-rose-600" />
                        ) : c.direction === "outgoing" ? (
                          <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <ArrowDownLeft className="w-3.5 h-3.5 text-sky-600" />
                        )}
                        <span
                          className={
                            isMissed
                              ? "text-rose-600 font-semibold"
                              : "text-slate-500"
                          }
                        >
                          {c.type === "video" ? "مكالمة فيديو" : "مكالمة صوتية"}{" "}
                          •{" "}
                          {isMissed
                            ? "لم يرد"
                            : formatCallDuration(c.durationSec)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-mono text-slate-400">
                      {new Date(c.createdAt).toLocaleTimeString("ar-EG", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {peerObj && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onStartCall(
                            {
                              id: peerObj.id,
                              username: peerObj.username,
                              displayName: peerObj.displayName,
                              email: `${peerObj.username}@oboud.app`,
                              avatarUrl: peerObj.avatarUrl,
                              bio: null,
                              presenceStatus: "online",
                            },
                            c.type
                          );
                        }}
                        title="إعادة الاتصال"
                        className="w-9 h-9 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 flex items-center justify-center transition cursor-pointer"
                      >
                        {c.type === "video" ? (
                          <Video className="w-4 h-4" />
                        ) : (
                          <Phone className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Left / Main Pane: Signaling JSON & Diagnostic Inspector */}
      <div
        className={`flex-1 overflow-y-auto p-4 sm:p-7 pb-24 md:pb-8 ${
          mobileShowDetail ? "block" : "hidden lg:block"
        }`}
      >
        {/* Mobile Back Button */}
        <div className="lg:hidden mb-4">
          <button
            type="button"
            onClick={() => setMobileShowDetail(false)}
            className="inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3.5 py-2 text-xs font-extrabold text-slate-800 shadow-2xs cursor-pointer"
          >
            <ArrowRight className="w-4 h-4 text-emerald-600" />
            <span>العودة إلى قائمة المكالمات</span>
          </button>
        </div>

        {!activeCall ? (
          <div className="h-full flex items-center justify-center text-sm text-slate-500">
            اختر مكالمة من القائمة لاستعراض بيانات مصافحة WebRTC وحقل{" "}
            <code className="mx-1 font-mono">signaling_json</code>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-5">
            <div className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 shadow-2xs">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-bold text-indigo-800">
                  <Code2 className="w-3.5 h-3.5" />
                  <span>فاحص الجلسة التشخيصي (calls.signaling_json)</span>
                </div>
                <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 pt-1">
                  {activeCall.caller?.displayName} ↔{" "}
                  {activeCall.callee?.displayName}
                </h3>
                <p className="text-[11px] font-mono text-slate-500 break-all" dir="ltr">
                  Call UUID: {activeCall.id}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-mono font-bold text-emerald-800">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>
                    {activeCall.signalingJson?.transportMode ||
                      "P2P Direct (STUN)"}
                  </span>
                </span>
                <span className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">
                  المدة: {formatCallDuration(activeCall.durationSec)}
                </span>
              </div>
            </div>

            {/* Event Timeline */}
            {activeCall.signalingJson?.events &&
              activeCall.signalingJson.events.length > 0 && (
                <div className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 space-y-3">
                  <h4 className="font-bold text-sm text-slate-900">
                    التسلسل الزمني لإشارات الجلسة
                  </h4>
                  <div className="space-y-2">
                    {activeCall.signalingJson.events.map((ev, i) => (
                      <div
                        key={`${ev.at}-${i}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-2.5 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                            {ev.step}
                          </span>
                          <span className="text-slate-700 font-medium">
                            {ev.detail}
                          </span>
                        </div>
                        <span className="font-mono text-slate-400" dir="ltr">
                          {new Date(ev.at).toLocaleTimeString("en-GB")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* SDP Offer & Answer */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" dir="ltr">
              <div className="rounded-2xl bg-[#0F172A] text-slate-100 p-4 space-y-2">
                <div className="text-xs font-mono font-bold text-sky-400">
                  SDP OFFER (Caller)
                </div>
                <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap break-all max-h-48">
                  {activeCall.signalingJson?.offer?.sdp ||
                    "No SDP Offer payload stored"}
                </pre>
              </div>
              <div className="rounded-2xl bg-[#0F172A] text-slate-100 p-4 space-y-2">
                <div className="text-xs font-mono font-bold text-emerald-400">
                  SDP ANSWER (Callee)
                </div>
                <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap break-all max-h-48">
                  {activeCall.signalingJson?.answer?.sdp ||
                    "No SDP Answer (Missed / Unanswered Call)"}
                </pre>
              </div>
            </div>

            {/* ICE Candidates */}
            <div
              className="rounded-2xl bg-[#0F172A] text-slate-100 p-4 sm:p-5 space-y-2.5"
              dir="ltr"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-amber-300">
                  EXCHANGED ICE CANDIDATES (
                  {activeCall.signalingJson?.iceCandidates?.length ?? 0})
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  STUN / TURN NAT Traversal
                </span>
              </div>
              {activeCall.signalingJson?.iceCandidates &&
              activeCall.signalingJson.iceCandidates.length > 0 ? (
                <div className="space-y-2">
                  {activeCall.signalingJson.iceCandidates.map((ic, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg bg-slate-900 border border-slate-800 p-2.5 font-mono text-[11px] text-slate-300 break-all"
                    >
                      <span className="text-emerald-400 font-bold mr-2">
                        [{ic.from}]
                      </span>
                      {ic.candidate}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs font-mono text-slate-500">
                  No ICE candidates persisted for this session.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
