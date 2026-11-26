"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  Code2,
  Mic,
  MicOff,
  MonitorUp,
  PhoneIncoming,
  PhoneOff,
  Radio,
  ShieldCheck,
  Sparkles,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import type { IncomingCallInvite, PublicUser } from "@/types/oboud";

export interface LiveSignalLogEntry {
  at: string;
  direction: "out" | "in" | "sys";
  label: string;
  snippet?: string;
}

interface CallStageOverlayProps {
  incomingInvite: IncomingCallInvite | null;
  onAcceptIncoming: () => void;
  onRejectIncoming: () => void;

  activeCall: {
    callId: string | null;
    peer: PublicUser;
    callType: "video" | "audio";
    phase: "ringing" | "connecting" | "connected";
    startedAtMs: number | null;
    isMuted: boolean;
    isCameraOff: boolean;
    isScreenSharing: boolean;
    isSyntheticLocal: boolean;
    transportMode:
      | "P2P Direct (STUN)"
      | "TURN Relay (TLS 5349)"
      | "Loopback P2P";
    iceState: string;
    rttMs: number;
    quality?: "excellent" | "good" | "poor" | "bad";
    lossPct?: number;
    videoTier?: number;
  } | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  signalLogs: LiveSignalLogEntry[];
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onToggleTurnRelay: () => void;
  onTriggerLoopbackAnswer: () => void;
  onHangup: () => void;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function CallStageOverlay({
  incomingInvite,
  onAcceptIncoming,
  onRejectIncoming,
  activeCall,
  localStream,
  remoteStream,
  signalLogs,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
  onToggleTurnRelay,
  onTriggerLoopbackAnswer,
  onHangup,
}: CallStageOverlayProps) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const [elapsedSec, setElapsedSec] = useState(0);
  const [showInspector, setShowInspector] = useState(false);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, activeCall?.callType, activeCall?.isCameraOff]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, activeCall?.phase, activeCall?.callType]);

  useEffect(() => {
    if (
      !activeCall ||
      activeCall.phase !== "connected" ||
      !activeCall.startedAtMs
    ) {
      setElapsedSec(0);
      return;
    }
    const tick = () => {
      setElapsedSec(
        Math.max(0, Math.floor((Date.now() - activeCall.startedAtMs!) / 1000))
      );
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [activeCall?.phase, activeCall?.startedAtMs]);

  // 1. Incoming Ringing Call Banner / Modal (Mobile-Optimized)
  if (incomingInvite && !activeCall) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
        <div className="w-full max-w-sm rounded-3xl bg-[#0F172A] border border-slate-800 p-6 sm:p-7 text-center text-white shadow-2xl space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3.5 py-1 text-xs font-bold text-emerald-300">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>
              {incomingInvite.callType === "video"
                ? "مكالمة فيديو واردة"
                : "مكالمة صوتية واردة"}
            </span>
          </div>

          <div className="relative mx-auto w-28 h-28 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-emerald-500/30 animate-pulse-ring" />
            <img
              src={incomingInvite.caller.avatarUrl || "/images/oboud-avatar.jpg"}
              alt={incomingInvite.caller.displayName}
              className="relative w-24 h-24 rounded-full object-cover border-4 border-emerald-500 shadow-lg"
            />
          </div>

          <div className="space-y-1">
            <h3 className="text-2xl font-extrabold">
              {incomingInvite.caller.displayName}
            </h3>
            <p className="text-xs font-mono text-slate-400" dir="ltr">
              @{incomingInvite.caller.username} • WebRTC P2P
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={onAcceptIncoming}
              className="h-13 inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 font-extrabold text-sm text-white shadow-lg shadow-emerald-950/50 transition cursor-pointer"
            >
              <PhoneIncoming className="w-5 h-5" />
              <span>قبول</span>
            </button>
            <button
              type="button"
              onClick={onRejectIncoming}
              className="h-13 inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-600 hover:bg-rose-500 font-extrabold text-sm text-white shadow-lg shadow-rose-950/50 transition cursor-pointer"
            >
              <PhoneOff className="w-5 h-5" />
              <span>رفض</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!activeCall) return null;

  const hasRemoteVideo =
    activeCall.callType === "video" &&
    remoteStream &&
    remoteStream.getVideoTracks().length > 0 &&
    activeCall.phase === "connected";

  return (
    <div className="fixed inset-0 z-50 h-[100dvh] bg-[#0B1120] text-slate-100 flex flex-col">
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Compact Top Telemetry Bar */}
      <div className="px-3.5 sm:px-6 py-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-bold border truncate ${
              activeCall.phase === "connected"
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                : "bg-amber-500/15 border-amber-500/40 text-amber-300"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                activeCall.phase === "connected"
                  ? "bg-emerald-400 animate-pulse"
                  : "bg-amber-400 animate-ping"
              }`}
            />
            <span className="truncate">
              {activeCall.phase === "connected"
                ? activeCall.iceState === "disconnected" ||
                  activeCall.iceState === "failed"
                  ? "انقطاع الشبكة... إعادة الاتصال"
                  : "متصل P2P"
                : activeCall.phase === "connecting"
                ? "جاري الربط..."
                : "يرن الآن..."}
            </span>
          </span>

          <span
            className="hidden md:inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] font-mono text-slate-300"
            dir="ltr"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>{activeCall.transportMode}</span>
          </span>

          {activeCall.phase === "connected" && (
            <span
              className="hidden lg:inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] font-mono text-sky-300"
              dir="ltr"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>
                ICE: {activeCall.iceState} • RTT {activeCall.rttMs}ms
              </span>
            </span>
          )}

          {activeCall.phase === "connected" && activeCall.quality && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] font-bold ${
                activeCall.quality === "excellent"
                  ? "text-emerald-300"
                  : activeCall.quality === "good"
                  ? "text-lime-300"
                  : activeCall.quality === "poor"
                  ? "text-amber-300"
                  : "text-red-400"
              }`}
              title={`فقد الحزم ${activeCall.lossPct ?? 0}%`}
            >
              <span className="flex items-end gap-[2px] h-3" aria-hidden>
                {[1, 2, 3, 4].map((n) => (
                  <span
                    key={n}
                    className="w-[3px] rounded-sm bg-current"
                    style={{
                      height: `${n * 25}%`,
                      opacity:
                        n <=
                        { excellent: 4, good: 3, poor: 2, bad: 1 }[
                          activeCall.quality!
                        ]
                          ? 1
                          : 0.25,
                    }}
                  />
                ))}
              </span>
              {
                {
                  excellent: "ممتازة",
                  good: "جيدة",
                  poor: "ضعيفة",
                  bad: "سيئة جداً",
                }[activeCall.quality]
              }
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="rounded-xl bg-slate-800 border border-slate-700 px-3 py-1 text-xs sm:text-sm font-mono font-bold text-white">
            {activeCall.phase === "connected"
              ? formatDuration(elapsedSec)
              : "00:00"}
          </div>

          <button
            type="button"
            onClick={() => setShowInspector((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 sm:px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
              showInspector
                ? "bg-indigo-600 border-indigo-500 text-white"
                : "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
            }`}
          >
            <Code2 className="w-4 h-4" />
            <span className="hidden sm:inline">فاحص SDP/ICE</span>
            <span className="font-mono text-[11px]">({signalLogs.length})</span>
          </button>
        </div>
      </div>

      {/* Main Theater Area */}
      <div className="relative flex-1 flex overflow-hidden">
        {/* Remote Video / Avatar Stage */}
        <div className="relative flex-1 flex items-center justify-center bg-gradient-to-b from-[#0F172A] to-[#020617] p-3 sm:p-4">
          {hasRemoteVideo ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full max-h-[75dvh] max-w-5xl rounded-3xl object-cover border border-slate-800 shadow-2xl bg-slate-950"
            />
          ) : (
            <div className="text-center space-y-4 sm:space-y-5 max-w-md px-4">
              <div className="relative mx-auto w-30 h-30 sm:w-36 sm:h-36 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-emerald-500/25 animate-pulse-ring" />
                <img
                  src={activeCall.peer.avatarUrl || "/images/sara-avatar.jpg"}
                  alt={activeCall.peer.displayName}
                  className="relative w-26 h-26 sm:w-32 sm:h-32 rounded-full object-cover border-4 border-emerald-500 shadow-2xl"
                />
              </div>

              <div className="space-y-1.5">
                <h2 className="text-xl sm:text-3xl font-extrabold text-white">
                  {activeCall.peer.displayName}
                </h2>
                <p className="text-xs sm:text-sm text-slate-400">
                  {activeCall.phase === "connected"
                    ? "مكالمة صوتية مشفرة نظير-لنظير جارية الآن"
                    : "بانتظار قبول المكالمة واستلام SDP Answer..."}
                </p>
              </div>

              {activeCall.phase === "ringing" && (
                <div className="pt-2 space-y-2">
                  <button
                    type="button"
                    onClick={onTriggerLoopbackAnswer}
                    className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg transition cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>رد فوري الآن (محاكاة نظير P2P)</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Local PiP Preview Card — Top-Left on Mobile Portrait so it never blocks controls */}
          <div className="absolute top-3 left-3 sm:top-auto sm:bottom-5 sm:left-5 w-28 sm:w-52 rounded-2xl overflow-hidden border-2 border-slate-700/90 bg-slate-900 shadow-2xl z-10">
            {activeCall.callType === "video" && !activeCall.isCameraOff ? (
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-34 sm:h-34 object-cover bg-slate-950"
              />
            ) : (
              <div className="w-full h-28 sm:h-34 flex flex-col items-center justify-center bg-slate-900 text-slate-400 gap-1 p-2 text-center">
                <VideoOff className="w-5 h-5 text-slate-500" />
                <span className="text-[10px] font-semibold leading-tight">
                  {activeCall.callType === "audio"
                    ? "اتصال صوتي"
                    : "الكاميرا متوقفة"}
                </span>
              </div>
            )}
            <div className="px-2 py-1 bg-slate-950/90 flex items-center justify-between text-[10px]">
              <span className="font-bold text-slate-200 truncate">أنت</span>
              <span className="text-emerald-400 font-mono text-[9px]">
                {activeCall.isSyntheticLocal ? "Studio" : "Live"}
              </span>
            </div>
          </div>
        </div>

        {/* Live Signaling Packet Inspector Drawer (Full overlay on mobile, side drawer on desktop) */}
        {showInspector && (
          <div
            className="absolute inset-0 sm:static sm:w-96 z-20 border-r border-slate-800 bg-slate-950/98 p-4 overflow-y-auto space-y-3"
            dir="ltr"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <span className="text-xs font-mono font-bold text-emerald-400">
                LIVE WEBRTC SIGNALING LOG
              </span>
              <button
                type="button"
                onClick={() => setShowInspector(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {signalLogs.length === 0 ? (
              <p className="text-xs font-mono text-slate-500">
                Waiting for SDP / ICE events...
              </p>
            ) : (
              signalLogs.map((entry, idx) => (
                <div
                  key={`${entry.at}-${idx}`}
                  className="rounded-xl border border-slate-800 bg-slate-900/90 p-3 space-y-1.5 font-mono text-[11px]"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-bold ${
                        entry.direction === "out"
                          ? "text-sky-400"
                          : entry.direction === "in"
                          ? "text-emerald-400"
                          : "text-amber-300"
                      }`}
                    >
                      {entry.direction.toUpperCase()} • {entry.label}
                    </span>
                    <span className="text-slate-500 text-[10px]">
                      {new Date(entry.at).toLocaleTimeString("en-GB")}
                    </span>
                  </div>
                  {entry.snippet && (
                    <pre className="text-[10px] text-slate-300 overflow-x-auto whitespace-pre-wrap break-all bg-slate-950 p-2 rounded-lg border border-slate-800/80 max-h-28">
                      {entry.snippet}
                    </pre>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Mobile-Ergonomic Bottom Call Controls Dock */}
      <div className="px-3 sm:px-6 py-3.5 sm:py-4 bg-slate-900/95 border-t border-slate-800 flex items-center justify-center gap-2.5 sm:gap-4 shrink-0">
        <button
          type="button"
          onClick={onToggleMute}
          title={activeCall.isMuted ? "إلغاء الكتم" : "كتم الصوت"}
          className={`w-12 h-12 sm:w-auto sm:h-auto sm:px-4 sm:py-3 rounded-full sm:rounded-2xl inline-flex items-center justify-center gap-2 text-xs font-bold transition cursor-pointer ${
            activeCall.isMuted
              ? "bg-amber-500/20 border border-amber-500/50 text-amber-300"
              : "bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white"
          }`}
        >
          {activeCall.isMuted ? (
            <MicOff className="w-5 h-5 sm:w-4 sm:h-4" />
          ) : (
            <Mic className="w-5 h-5 sm:w-4 sm:h-4" />
          )}
          <span className="hidden sm:inline">
            {activeCall.isMuted ? "إلغاء الكتم" : "كتم الصوت"}
          </span>
        </button>

        {activeCall.callType === "video" && (
          <button
            type="button"
            onClick={onToggleCamera}
            title={
              activeCall.isCameraOff ? "تشغيل الكاميرا" : "إيقاف الكاميرا"
            }
            className={`w-12 h-12 sm:w-auto sm:h-auto sm:px-4 sm:py-3 rounded-full sm:rounded-2xl inline-flex items-center justify-center gap-2 text-xs font-bold transition cursor-pointer ${
              activeCall.isCameraOff
                ? "bg-amber-500/20 border border-amber-500/50 text-amber-300"
                : "bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white"
            }`}
          >
            {activeCall.isCameraOff ? (
              <VideoOff className="w-5 h-5 sm:w-4 sm:h-4" />
            ) : (
              <Video className="w-5 h-5 sm:w-4 sm:h-4" />
            )}
            <span className="hidden sm:inline">
              {activeCall.isCameraOff ? "تشغيل الكاميرا" : "إيقاف الكاميرا"}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={onToggleScreenShare}
          title="مشاركة الشاشة"
          className={`hidden xs:inline-flex sm:inline-flex w-12 h-12 sm:w-auto sm:h-auto sm:px-4 sm:py-3 rounded-full sm:rounded-2xl items-center justify-center gap-2 text-xs font-bold transition cursor-pointer ${
            activeCall.isScreenSharing
              ? "bg-indigo-600 border border-indigo-500 text-white"
              : "bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white"
          }`}
        >
          <MonitorUp className="w-5 h-5 sm:w-4 sm:h-4" />
          <span className="hidden sm:inline">
            {activeCall.isScreenSharing ? "إيقاف المشاركة" : "مشاركة الشاشة"}
          </span>
        </button>

        <button
          type="button"
          onClick={onToggleTurnRelay}
          title="تبديل مرحل TURN"
          className={`w-12 h-12 sm:w-auto sm:h-auto sm:px-4 sm:py-3 rounded-full sm:rounded-2xl inline-flex items-center justify-center gap-2 text-xs font-bold transition cursor-pointer ${
            activeCall.transportMode === "TURN Relay (TLS 5349)"
              ? "bg-amber-600 border border-amber-500 text-white"
              : "bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200"
          }`}
        >
          <ShieldCheck className="w-5 h-5 sm:w-4 sm:h-4" />
          <span className="hidden sm:inline">
            {activeCall.transportMode === "TURN Relay (TLS 5349)"
              ? "TURN نشط"
              : "عبور TURN"}
          </span>
        </button>

        <button
          type="button"
          onClick={onHangup}
          className="h-12 px-5 sm:px-6 rounded-full sm:rounded-2xl inline-flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-xs sm:text-sm font-extrabold text-white shadow-lg shadow-rose-950/50 transition cursor-pointer"
        >
          <PhoneOff className="w-5 h-5 sm:w-4 sm:h-4" />
          <span>إنهاء</span>
        </button>
      </div>
    </div>
  );
}
