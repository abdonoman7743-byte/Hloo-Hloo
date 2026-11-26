"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bell,
  CheckCheck,
  Compass,
  Image as ImageIcon,
  Loader2,
  LogOut,
  MessageSquare,
  Mic,
  Phone,
  PhoneCall,
  Search,
  Settings,
  Send,
  ShieldCheck,
  Square,
  Trash2,
  UserCog,
  UserPlus,
  UsersRound,
  Video,
} from "lucide-react";
import { getPresenceBadgePresentation } from "@/lib/presence-format";
import {
  PUBLIC_TEAM_GROUP_ID,
  type AppNotification,
  type CallLogItem,
  type ChatMessage,
  type FriendContact,
  type IncomingCallInvite,
  type PendingFriendRequest,
  type PublicUser,
} from "@/types/oboud";
import {
  acquireUserOrSyntheticStream,
  createStudioCanvasStream,
  playStudioTone,
  type ManagedMediaResult,
} from "@/lib/webrtc-media";
import {
  applyCodecPreferences,
  buildRtcConfig,
  hasTurnConfigured,
  lowLatencyReceivers,
  sampleStats,
  tuneSenders,
  VIDEO_TIERS,
  type NetQuality,
} from "@/lib/webrtc-quality";
import {
  CallStageOverlay,
  type LiveSignalLogEntry,
} from "./CallStageOverlay";
import { AuthSwitcherModal } from "./AuthSwitcherModal";
import { SafeFriendSearchView } from "./SafeFriendSearchView";
import { NotificationsSheet } from "./NotificationsSheet";
import { CallHistoryView } from "./CallHistoryView";
import { MobileAuthPage } from "./MobileAuthPage";
import { ProfileSettingsView } from "./ProfileSettingsView";

const RTC_CONFIG: RTCConfiguration = buildRtcConfig();

const TEAM_GROUP_CONTACT: FriendContact = {
  id: PUBLIC_TEAM_GROUP_ID,
  username: "team_room",
  displayName: "غرفة فريق عبود العامة",
  email: "team@oboud.app",
  avatarUrl: null,
  bio: "مساحة نقاش جماعية مفتوحة لجميع الأعضاء",
  presenceStatus: "online",
  isGroup: true,
};

function generateFallbackWavDataUrl(durationSec = 2.4): string {
  const sampleRate = 8000;
  const numSamples = Math.floor(sampleRate * durationSec);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.sin(Math.min(1, t / durationSec) * Math.PI);
    const freq = t < 1.2 ? 440 : 523.25;
    const sample = Math.sin(2 * Math.PI * freq * t) * 0.22 * envelope;
    view.setInt16(44 + i * 2, sample * 32767, true);
  }

  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

export function OboudCallWorkspace({
  initialTab = "chats",
}: {
  initialTab?: "chats" | "friends" | "calls" | "architecture" | "profile";
} = {}) {
  const [jwtToken, setJwtToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
  const [demoUsers, setDemoUsers] = useState<PublicUser[]>([]);
  const [booting, setBooting] = useState(true);

  const [activeNav, setActiveNav] = useState<
    "chats" | "friends" | "calls" | "architecture" | "profile"
  >(initialTab);
  const [realtimeRefreshSignal, setRealtimeRefreshSignal] = useState(0);
  const [callErrorBanner, setCallErrorBanner] = useState<string | null>(null);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Contacts & Friends state
  const [friends, setFriends] = useState<FriendContact[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<
    PendingFriendRequest[]
  >([]);
  const [outgoingRequests, setOutgoingRequests] = useState<
    PendingFriendRequest[]
  >([]);
  const [discoverUsers, setDiscoverUsers] = useState<PublicUser[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Active Chat state
  const [selectedPeer, setSelectedPeer] = useState<FriendContact | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [composerText, setComposerText] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Call History & Notifications
  const [callHistory, setCallHistory] = useState<CallLogItem[]>([]);
  const [notificationsList, setNotificationsList] = useState<AppNotification[]>(
    []
  );
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [notifSheetOpen, setNotifSheetOpen] = useState(false);

  // Signaling Status
  const [signalingConnected, setSignalingConnected] = useState(false);

  // WebRTC Active Call State
  const [incomingInvite, setIncomingInvite] =
    useState<IncomingCallInvite | null>(null);
  const [activeCall, setActiveCall] = useState<{
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
    quality?: NetQuality;
    lossPct?: number;
    videoTier?: number;
  } | null>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [signalLogs, setSignalLogs] = useState<LiveSignalLogEntry[]>([]);

  // Refs for WebRTC lifecycle
  const jwtRef = useRef<string | null>(null);
  const selectedPeerRef = useRef<FriendContact | null>(null);
  const activeCallRef = useRef<typeof activeCall>(null);
  const localPcRef = useRef<RTCPeerConnection | null>(null);
  const loopbackPcRef = useRef<RTCPeerConnection | null>(null);
  const localMediaCleanupRef = useRef<ManagedMediaResult | null>(null);
  const remoteSimCleanupRef = useRef<ManagedMediaResult | null>(null);
  const pendingIceQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const autoAnswerTimerRef = useRef<number | null>(null);
  const statsIntervalRef = useRef<number | null>(null);
  const recoveryTimerRef = useRef<number | null>(null);
  const iceFailuresRef = useRef(0);
  const startingCallRef = useRef(false);
  const forceIceRestartRef = useRef<(() => void) | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  jwtRef.current = jwtToken;
  selectedPeerRef.current = selectedPeer;
  activeCallRef.current = activeCall;

  const appendSignalLog = useCallback(
    (direction: "out" | "in" | "sys", label: string, snippet?: string) => {
      setSignalLogs((prev) => [
        ...prev,
        { at: new Date().toISOString(), direction, label, snippet },
      ]);
    },
    []
  );

  // Browser authentication uses the server-issued HttpOnly session cookie.
  // Never persist or attach bearer JWTs in JavaScript-accessible storage/headers.
  const authHeaders = useCallback(
    (_tokenOverride?: string | null): HeadersInit => ({
      "Content-Type": "application/json",
    }),
    []
  );

  const loadFriends = useCallback(async (_tokenOverride?: string | null) => {
    try {
      const res = await fetch("/api/friends", { credentials: "same-origin" });
      if (!res.ok) return;
      const data = await res.json();
      const friendList = (data.friends || []) as FriendContact[];
      setFriends(friendList);
      setIncomingRequests(data.incomingRequests || []);
      setOutgoingRequests(data.outgoingRequests || []);
      setDiscoverUsers(data.discoverUsers || []);

      setSelectedPeer((prev) => {
        if (prev?.isGroup) return prev;
        if (prev) {
          const refreshed = friendList.find((f) => f.id === prev.id);
          return refreshed || prev;
        }
        return friendList[0] ?? TEAM_GROUP_CONTACT;
      });
    } catch {
      // ignore
    }
  }, []);

  const loadCallHistory = useCallback(
    async (tokenOverride?: string | null) => {
      try {
        const res = await fetch("/api/calls", { credentials: "same-origin" });
        if (!res.ok) return;
        const data = await res.json();
        setCallHistory(data.calls || []);
      } catch {
        // ignore
      }
    },
    []
  );

  const loadNotifications = useCallback(
    async (tokenOverride?: string | null) => {
      try {
        const res = await fetch("/api/notifications", { credentials: "same-origin" });
        if (!res.ok) return;
        const data = await res.json();
        setNotificationsList(data.notifications || []);
        setUnreadNotifCount(data.unreadCount ?? 0);
      } catch {
        // ignore
      }
    },
    []
  );

  const markAllNotificationsRead = useCallback(async () => {
    setUnreadNotifCount(0);
    setNotificationsList((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({}),
    }).catch(() => {});
  }, [authHeaders]);

  const markOneNotificationRead = useCallback(
    async (notificationId: string) => {
      setNotificationsList((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
      );
      setUnreadNotifCount((c) => Math.max(0, c - 1));
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ notificationId }),
      }).catch(() => {});
    },
    [authHeaders]
  );

  const loadMessagesForTarget = useCallback(
    async (target: FriendContact, tokenOverride?: string | null) => {
      try {
        const query = target.isGroup
          ? `groupId=${encodeURIComponent(target.id)}`
          : `peerId=${encodeURIComponent(target.id)}`;
        const res = await fetch(`/api/messages?${query}`, { credentials: "same-origin" });
        if (!res.ok) return;
        const data = await res.json();
        setChatMessages(data.messages || []);
      } catch {
        // ignore
      }
    },
    []
  );

  // Initial session check: validates the HttpOnly cookie session.
  useEffect(() => {
    let mounted = true;
    async function initSession() {
      try {
        const res = await fetch("/api/auth/me", { credentials: "same-origin" });
        const data = await res.json();
        if (!mounted) return;

        if (Array.isArray(data.demoUsers)) {
          setDemoUsers(data.demoUsers);
        }

        if (res.ok && data.user) {
          // Sentinel only indicates an authenticated in-memory UI state; the JWT stays HttpOnly.
          setJwtToken("cookie-session");
          setCurrentUser(data.user);
          await Promise.all([loadFriends(), loadCallHistory(), loadNotifications()]);
        } else {
          setJwtToken(null);
        }
      } catch {
        // ignore
      } finally {
        if (mounted) setBooting(false);
      }
    }
    initSession();
    return () => {
      mounted = false;
    };
  }, [loadCallHistory, loadFriends, loadNotifications]);

  // Load messages whenever selectedPeer changes
  useEffect(() => {
    if (selectedPeer && jwtToken) {
      loadMessagesForTarget(selectedPeer, jwtToken);
    }
  }, [selectedPeer?.id, selectedPeer?.isGroup, jwtToken, loadMessagesForTarget]);

  // Scroll chat to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages.length]);

  // Cleanup WebRTC resources helper
  const cleanupWebRtcResources = useCallback(() => {
    if (autoAnswerTimerRef.current) {
      window.clearTimeout(autoAnswerTimerRef.current);
      autoAnswerTimerRef.current = null;
    }
    if (statsIntervalRef.current) {
      window.clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
    if (recoveryTimerRef.current) {
      window.clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }
    iceFailuresRef.current = 0;
    forceIceRestartRef.current = null;
    if (localPcRef.current) {
      const oldPc = localPcRef.current;
      oldPc.onicecandidate = null;
      oldPc.ontrack = null;
      oldPc.oniceconnectionstatechange = null;
      oldPc.onconnectionstatechange = null;
      try {
        oldPc.close();
      } catch {
        // ignore
      }
      localPcRef.current = null;
    }
    if (loopbackPcRef.current) {
      try {
        loopbackPcRef.current.close();
      } catch {
        // ignore
      }
      loopbackPcRef.current = null;
    }
    if (localMediaCleanupRef.current) {
      localMediaCleanupRef.current.cleanup();
      localMediaCleanupRef.current = null;
    }
    if (remoteSimCleanupRef.current) {
      remoteSimCleanupRef.current.cleanup();
      remoteSimCleanupRef.current = null;
    }
    pendingIceQueueRef.current = [];
    setLocalStream(null);
    setRemoteStream(null);
    setActiveCall(null);
  }, []);

  const sendSignal = useCallback(
    (
      toUserId: string,
      callId: string | null,
      eventType: string,
      payload: Record<string, unknown> = {}
    ) =>
      fetch("/api/signaling", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ toUserId, callId, eventType, payload }),
        keepalive: eventType === "call-end",
      }).catch(() => {}),
    [authHeaders]
  );

  // Real network telemetry (getStats) + adaptive video bitrate ladder
  const startStatsTelemetry = useCallback((pc: RTCPeerConnection) => {
    if (statsIntervalRef.current) {
      window.clearInterval(statsIntervalRef.current);
    }
    let prev = { bytes: 0, at: 0, lost: 0, recv: 0 };
    let tier = 0;
    let goodStreak = 0;
    let busy = false;
    statsIntervalRef.current = window.setInterval(async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const { sample, next } = await sampleStats(pc, prev);
        prev = next;

        // Adaptive bitrate: step down fast on poor network, step up slowly when stable.
        let nextTier = tier;
        if (sample.quality === "bad") nextTier = Math.min(VIDEO_TIERS.length - 1, tier + 2);
        else if (sample.quality === "poor") nextTier = Math.min(VIDEO_TIERS.length - 1, tier + 1);
        else if (sample.quality === "excellent") {
          goodStreak += 1;
          if (goodStreak >= 3) nextTier = Math.max(0, tier - 1);
        }
        if (sample.quality !== "excellent") goodStreak = 0;
        if (nextTier !== tier) {
          tier = nextTier;
          goodStreak = 0;
          await tuneSenders(pc, tier);
        }

        setActiveCall((prevCall) =>
          prevCall
            ? {
                ...prevCall,
                iceState: pc.iceConnectionState || prevCall.iceState,
                rttMs: sample.rttMs ?? prevCall.rttMs,
                quality: sample.quality,
                lossPct: Math.round(sample.lossPct * 10) / 10,
                videoTier: tier,
                transportMode:
                  prevCall.transportMode === "Loopback P2P"
                    ? prevCall.transportMode
                    : sample.relay
                    ? "TURN Relay (TLS 5349)"
                    : "P2P Direct (STUN)",
              }
            : null
        );
      } catch {
        // ignore
      } finally {
        busy = false;
      }
    }, 2000);
  }, []);

  // ICE failure recovery: restart ICE (caller) and fall back to TURN relay when direct P2P fails
  const attachRecovery = useCallback(
    (pc: RTCPeerConnection, role: "caller" | "callee") => {
      const recover = (immediate: boolean) => {
        if (recoveryTimerRef.current) return;
        recoveryTimerRef.current = window.setTimeout(
          async () => {
            recoveryTimerRef.current = null;
            if (localPcRef.current !== pc) return;
            if (
              pc.iceConnectionState === "connected" ||
              pc.iceConnectionState === "completed"
            )
              return;
            const cur = activeCallRef.current;
            if (!cur?.callId) return;
            iceFailuresRef.current += 1;
            if (iceFailuresRef.current > 6) return;
            if (role === "callee") {
              sendSignal(cur.peer.id, cur.callId, "ice-restart-request");
              return;
            }
            const relay = iceFailuresRef.current >= 2 && hasTurnConfigured();
            try {
              if (relay) pc.setConfiguration(buildRtcConfig(true));
              pc.restartIce();
              const offer = await pc.createOffer({ iceRestart: true });
              await pc.setLocalDescription(offer);
              sendSignal(cur.peer.id, cur.callId, "call-renegotiate", {
                sdp: { type: offer.type, sdp: offer.sdp },
                relay,
              });
            } catch {
              // will retry on next state change
            }
          },
          immediate ? 0 : 2000
        );
      };
      if (role === "caller") forceIceRestartRef.current = () => recover(true);

      pc.oniceconnectionstatechange = () => {
        const st = pc.iceConnectionState;
        setActiveCall((prev) => (prev ? { ...prev, iceState: st } : null));
        if (st === "connected" || st === "completed") {
          iceFailuresRef.current = 0;
          if (recoveryTimerRef.current) {
            window.clearTimeout(recoveryTimerRef.current);
            recoveryTimerRef.current = null;
          }
        } else if (st === "disconnected") {
          recover(false);
        } else if (st === "failed") {
          recover(true);
        }
      };
    },
    [sendSignal]
  );

  // Network came back (wifi <-> mobile switch): restart ICE immediately
  useEffect(() => {
    const onOnline = () => {
      const pc = localPcRef.current;
      if (!pc || !activeCallRef.current) return;
      if (pc.iceConnectionState !== "connected" && pc.iceConnectionState !== "completed") {
        if (forceIceRestartRef.current) forceIceRestartRef.current();
        else if (activeCallRef.current.callId)
          sendSignal(activeCallRef.current.peer.id, activeCallRef.current.callId, "ice-restart-request");
      } else if (forceIceRestartRef.current) {
        forceIceRestartRef.current();
      }
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [sendSignal]);

  // Dual-Peer Loopback Responder
  const triggerLoopbackPeerAnswer = useCallback(async () => {
    const current = activeCallRef.current;
    const callerPc = localPcRef.current;
    if (!current || !callerPc || current.phase === "connected") return;
    if (!callerPc.localDescription) return;

    if (autoAnswerTimerRef.current) {
      window.clearTimeout(autoAnswerTimerRef.current);
      autoAnswerTimerRef.current = null;
    }

    appendSignalLog(
      "sys",
      "Smart Peer Responder Activated",
      `Spinning up real remote RTCPeerConnection for ${current.peer.displayName}`
    );

    const remotePc = new RTCPeerConnection(RTC_CONFIG);
    loopbackPcRef.current = remotePc;

    const remoteSim = createStudioCanvasStream({
      title: current.peer.displayName,
      subtitle: "بث مباشر مشفر WebRTC P2P • DTLS-SRTP",
      accentHex: "#10B981",
      secondaryHex: "#1E1B4B",
      includeVideo: current.callType === "video",
      avatarUrl: current.peer.avatarUrl,
      gentleVoiceWave: true,
    });
    remoteSimCleanupRef.current = remoteSim;

    remoteSim.stream.getTracks().forEach((track) => {
      remotePc.addTrack(track, remoteSim.stream);
    });

    const gatheredLoopbackIce: Array<{
      from: string;
      candidate: string;
      sdpMid?: string | null;
      sdpMLineIndex?: number | null;
    }> = [];

    remotePc.onicecandidate = async (ev) => {
      if (ev.candidate && localPcRef.current) {
        gatheredLoopbackIce.push({
          from: current.peer.username,
          candidate: ev.candidate.candidate,
          sdpMid: ev.candidate.sdpMid,
          sdpMLineIndex: ev.candidate.sdpMLineIndex,
        });
        appendSignalLog(
          "in",
          "ICE Candidate (Remote Peer)",
          ev.candidate.candidate
        );
        try {
          await localPcRef.current.addIceCandidate(ev.candidate);
        } catch {
          // ignore
        }
      }
    };

    callerPc.addEventListener("icecandidate", async (ev) => {
      if (ev.candidate && loopbackPcRef.current) {
        try {
          await loopbackPcRef.current.addIceCandidate(ev.candidate);
        } catch {
          // ignore
        }
      }
    });

    await remotePc.setRemoteDescription(callerPc.localDescription);
    const answer = await remotePc.createAnswer();
    await remotePc.setLocalDescription(answer);
    appendSignalLog("in", "SDP Answer Received", answer.sdp?.slice(0, 260));

    await callerPc.setRemoteDescription(answer);

    playStudioTone("connect");
    setActiveCall((prev) =>
      prev
        ? {
            ...prev,
            phase: "connected",
            startedAtMs: Date.now(),
            transportMode: "P2P Direct (STUN)",
            iceState: "connected",
          }
        : null
    );
    startStatsTelemetry(callerPc);

    if (current.callId) {
      setTimeout(async () => {
        try {
          await fetch("/api/calls", {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({
              callId: current.callId,
              status: "answered",
              answer: { type: answer.type, sdp: answer.sdp },
              iceCandidates: gatheredLoopbackIce.slice(0, 6),
              iceConnectionState: "connected",
              transportMode: "P2P Direct (STUN)",
            }),
          });
        } catch {
          // ignore
        }
      }, 600);
    }
  }, [appendSignalLog, authHeaders, startStatsTelemetry]);

  // Start an outgoing Audio / Video Call
  const startOutgoingCall = useCallback(
    async (peer: PublicUser, callType: "video" | "audio") => {
      if (!currentUser || !jwtRef.current) return;
      if (activeCallRef.current || startingCallRef.current) return; // de-duplicate taps
      startingCallRef.current = true;
      try {
        cleanupWebRtcResources();
        setIncomingInvite(null);
        setSignalLogs([]);

        playStudioTone("ring");
        appendSignalLog(
          "sys",
          "Acquiring Media Devices",
          `getUserMedia({ audio: true, video: ${callType === "video"} })`
        );

        const pc = new RTCPeerConnection(RTC_CONFIG);
        localPcRef.current = pc;

        // Start camera/mic in parallel with offer creation; the offer does not need the tracks.
        const mediaPromise = acquireUserOrSyntheticStream(
          callType,
          currentUser.displayName
        );

        const inboundStream = new MediaStream();
        setRemoteStream(inboundStream);
        pc.ontrack = (event) => {
          if (event.streams?.[0]) {
            setRemoteStream(event.streams[0]);
          } else {
            inboundStream.addTrack(event.track);
            setRemoteStream(new MediaStream(inboundStream.getTracks()));
          }
          lowLatencyReceivers(pc);
        };

        pc.addTransceiver("audio", { direction: "sendrecv" });
        if (callType === "video") {
          pc.addTransceiver("video", { direction: "sendrecv" });
        }
        applyCodecPreferences(pc);

        setActiveCall({
          callId: null,
          peer,
          callType,
          phase: "ringing",
          startedAtMs: null,
          isMuted: false,
          isCameraOff: false,
          isScreenSharing: false,
          isSyntheticLocal: false,
          transportMode: "P2P Direct (STUN)",
          iceState: "checking",
          rttMs: 19,
        });

        let createdCallId: string | null = null;
        const earlyIce: RTCIceCandidateInit[] = [];
        const postIce = (cand: RTCIceCandidateInit) =>
          fetch("/api/signaling", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({
              toUserId: peer.id,
              callId: createdCallId,
              eventType: "ice-candidate",
              payload: { candidate: cand },
            }),
          }).catch(() => {});

        pc.onicecandidate = (ev) => {
          if (!ev.candidate) return;
          appendSignalLog("out", "ICE Candidate (Local)", ev.candidate.candidate);
          // Candidates gathered before the call row exists are queued, not dropped.
          if (createdCallId) postIce(ev.candidate.toJSON());
          else earlyIce.push(ev.candidate.toJSON());
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "connected") {
            setActiveCall((prev) =>
              prev
                ? {
                    ...prev,
                    phase: "connected",
                    startedAtMs: prev.startedAtMs ?? Date.now(),
                    iceState: "connected",
                  }
                : null
            );
          }
        };
        attachRecovery(pc, "caller");

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        appendSignalLog("out", "SDP Offer Created", offer.sdp?.slice(0, 260));

        // Ring the callee immediately; media attaches via replaceTrack once ready.
        const callPost = fetch("/api/calls", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            calleeId: peer.id,
            type: callType,
            offer: { type: offer.type, sdp: offer.sdp },
            transportMode: "P2P Direct (STUN)",
          }),
        });

        const localMedia = await mediaPromise;
        if (localPcRef.current !== pc) {
          // call was cancelled while media was starting
          localMedia.cleanup();
          return;
        }
        localMediaCleanupRef.current = localMedia;
        setLocalStream(localMedia.stream);
        setActiveCall((prev) =>
          prev ? { ...prev, isSyntheticLocal: localMedia.isSynthetic } : null
        );
        for (const track of localMedia.stream.getTracks()) {
          const tr = pc
            .getTransceivers()
            .find((t) => t.receiver.track.kind === track.kind && !t.sender.track);
          if (tr) {
            await tr.sender.replaceTrack(track);
            tr.sender.setStreams(localMedia.stream);
          }
        }
        void tuneSenders(pc, 0);

        try {
          const res = await callPost;
          const data = await res.json();
          if (!res.ok) {
            cleanupWebRtcResources();
            setCallErrorBanner(
              data.error || "صلاحيات خصوصية هذا الحساب لا تسمح بالاتصال المباشر"
            );
            window.setTimeout(() => setCallErrorBanner(null), 4000);
            return;
          }
          createdCallId = data.call?.id ?? null;
          setActiveCall((prev) =>
            prev ? { ...prev, callId: createdCallId } : null
          );
          earlyIce.splice(0).forEach((c) => void postIce(c));
        } catch {
          // ignore
        }

        // Simulated responder only for peers who are not online (a real online peer is left to answer).
        if (peer.presenceStatus !== "online" && peer.presenceStatus !== "in_call") {
          autoAnswerTimerRef.current = window.setTimeout(() => {
            if (
              activeCallRef.current &&
              activeCallRef.current.phase === "ringing"
            ) {
              triggerLoopbackPeerAnswer();
            }
          }, 3500);
        }
      } finally {
        startingCallRef.current = false;
      }
    },
    [
      appendSignalLog,
      attachRecovery,
      authHeaders,
      cleanupWebRtcResources,
      currentUser,
      triggerLoopbackPeerAnswer,
    ]
  );

  // Accept an Incoming Call
  const acceptIncomingCall = useCallback(async () => {
    if (!incomingInvite || !currentUser) return;
    const invite = incomingInvite;
    setIncomingInvite(null);
    // ICE candidates that arrived while ringing must survive the cleanup below.
    const earlyRemoteIce = [...pendingIceQueueRef.current];
    cleanupWebRtcResources();
    pendingIceQueueRef.current = earlyRemoteIce;
    setSignalLogs([]);

    appendSignalLog(
      "in",
      "Incoming SDP Offer Accepted",
      invite.offer?.sdp?.slice(0, 240)
    );

    // Camera/mic start while the remote offer is applied.
    const mediaPromise = acquireUserOrSyntheticStream(
      invite.callType,
      currentUser.displayName
    );

    const pc = new RTCPeerConnection(RTC_CONFIG);
    localPcRef.current = pc;

    const inboundStream = new MediaStream();
    setRemoteStream(inboundStream);

    pc.ontrack = (event) => {
      if (event.streams?.[0]) {
        setRemoteStream(event.streams[0]);
      } else {
        inboundStream.addTrack(event.track);
        setRemoteStream(new MediaStream(inboundStream.getTracks()));
      }
      lowLatencyReceivers(pc);
    };

    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      appendSignalLog("out", "ICE Candidate (Callee)", ev.candidate.candidate);
      void sendSignal(invite.caller.id, invite.callId, "ice-candidate", {
        candidate: ev.candidate.toJSON(),
      });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        playStudioTone("connect");
        setActiveCall((prev) =>
          prev
            ? {
                ...prev,
                phase: "connected",
                startedAtMs: Date.now(),
                iceState: "connected",
              }
            : null
        );
      }
    };
    attachRecovery(pc, "callee");

    const peerObj: PublicUser = {
      id: invite.caller.id,
      username: invite.caller.username,
      displayName: invite.caller.displayName,
      email: `${invite.caller.username}@oboud.app`,
      avatarUrl: invite.caller.avatarUrl,
      bio: null,
      presenceStatus: "online",
    };

    setActiveCall({
      callId: invite.callId,
      peer: peerObj,
      callType: invite.callType,
      phase: "connecting",
      startedAtMs: null,
      isMuted: false,
      isCameraOff: false,
      isScreenSharing: false,
      isSyntheticLocal: false,
      transportMode: "P2P Direct (STUN)",
      iceState: "checking",
      rttMs: 16,
    });

    if (invite.offer) {
      await pc.setRemoteDescription(new RTCSessionDescription(invite.offer));
      const queued = pendingIceQueueRef.current;
      pendingIceQueueRef.current = [];
      await Promise.all(
        queued.map((c) =>
          pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {})
        )
      );
    }

    const localMedia = await mediaPromise;
    if (localPcRef.current !== pc) {
      localMedia.cleanup();
      return;
    }
    localMediaCleanupRef.current = localMedia;
    setLocalStream(localMedia.stream);
    setActiveCall((prev) =>
      prev ? { ...prev, isSyntheticLocal: localMedia.isSynthetic } : null
    );

    for (const track of localMedia.stream.getTracks()) {
      const tr = pc
        .getTransceivers()
        .find((t) => t.receiver.track.kind === track.kind && !t.sender.track);
      if (tr) {
        tr.direction = "sendrecv";
        await tr.sender.replaceTrack(track);
        tr.sender.setStreams(localMedia.stream);
      } else {
        pc.addTrack(track, localMedia.stream);
      }
    }
    applyCodecPreferences(pc);

    if (invite.offer) {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      appendSignalLog("out", "SDP Answer Sent", answer.sdp?.slice(0, 240));
      void tuneSenders(pc, 0);
      await sendSignal(invite.caller.id, invite.callId, "call-answer", {
        sdp: { type: answer.type, sdp: answer.sdp },
      });
    }

    startStatsTelemetry(pc);
  }, [
    appendSignalLog,
    attachRecovery,
    cleanupWebRtcResources,
    currentUser,
    incomingInvite,
    sendSignal,
    startStatsTelemetry,
  ]);

  const rejectIncomingCall = useCallback(async () => {
    if (!incomingInvite) return;
    const invite = incomingInvite;
    setIncomingInvite(null);
    playStudioTone("end");
    try {
      await fetch("/api/signaling", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          toUserId: invite.caller.id,
          callId: invite.callId,
          eventType: "call-reject",
          payload: {},
        }),
      });
      await loadCallHistory();
    } catch {
      // ignore
    }
  }, [authHeaders, incomingInvite, loadCallHistory]);

  const hangupActiveCall = useCallback(async () => {
    const current = activeCallRef.current;
    playStudioTone("end");
    cleanupWebRtcResources(); // UI and devices released instantly

    if (current) {
      // Notify the peer first and in parallel with the DB update.
      const tasks: Promise<unknown>[] = [
        sendSignal(current.peer.id, current.callId, "call-end"),
      ];
      if (current.callId) {
        tasks.push(
          fetch("/api/calls", {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({
              callId: current.callId,
              status: current.phase === "connected" ? "ended" : "missed",
              iceConnectionState: "closed",
              eventStep: {
                step: "call-end",
                detail: "تم إنهاء المكالمة وإغلاق جلسة RTCPeerConnection",
              },
            }),
          }).catch(() => {})
        );
      }
      await Promise.all(tasks);
      void loadCallHistory();
    }
  }, [authHeaders, cleanupWebRtcResources, loadCallHistory, sendSignal]);

  // Handle incoming real-time signaling event
  const handleSignalingEvent = useCallback(
    async (ev: {
      eventType: string;
      fromUserId: string;
      callId?: string | null;
      payload: Record<string, unknown>;
    }) => {
      const { eventType, payload } = ev;

      if (
        eventType === "user-registered" ||
        eventType === "presence-changed" ||
        eventType === "friend-updated"
      ) {
        setRealtimeRefreshSignal((n) => n + 1);
        loadFriends();
        if (eventType === "friend-updated") {
          loadNotifications();
        }
        return;
      }

      if (eventType === "new-notification") {
        setRealtimeRefreshSignal((n) => n + 1);
        loadNotifications();
        loadFriends();
        return;
      }

      if (eventType === "new-message") {
        const msg = payload.message as ChatMessage | undefined;
        if (msg) {
          const curPeer = selectedPeerRef.current;
          const matchesGroup =
            curPeer?.isGroup && msg.groupId === curPeer.id;
          const matchesDirect =
            !curPeer?.isGroup &&
            !msg.groupId &&
            curPeer?.id === msg.senderId;

          if (matchesGroup || matchesDirect) {
            setChatMessages((prev) =>
              prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
            );
          }
          loadFriends();
          loadNotifications();
        }
        return;
      }

      if (eventType === "call-invite") {
        if (activeCallRef.current) return;
        const caller = payload.caller as IncomingCallInvite["caller"];
        if (!caller) return;
        playStudioTone("ring");
        setIncomingInvite({
          callId: String(payload.callId || ev.callId || ""),
          callType: payload.callType === "audio" ? "audio" : "video",
          offer: payload.offer as RTCSessionDescriptionInit | undefined,
          caller,
        });
        return;
      }

      if (eventType === "call-answer") {
        if (autoAnswerTimerRef.current) {
          window.clearTimeout(autoAnswerTimerRef.current);
          autoAnswerTimerRef.current = null;
        }
        const pc = localPcRef.current;
        const sdp = payload.sdp as RTCSessionDescriptionInit | undefined;
        if (pc && sdp && pc.signalingState !== "stable") {
          appendSignalLog(
            "in",
            "SDP Answer (Remote Tab)",
            sdp.sdp?.slice(0, 240)
          );
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          const queued = pendingIceQueueRef.current;
          pendingIceQueueRef.current = [];
          await Promise.all(
            queued.map((c) =>
              pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {})
            )
          );
          // Real state: "connected" is set by onconnectionstatechange once media flows.
          setActiveCall((prev) =>
            prev && prev.phase === "ringing"
              ? { ...prev, phase: "connecting" }
              : prev
          );
          if (pc.connectionState === "connected") {
            playStudioTone("connect");
          }
          startStatsTelemetry(pc);
        }
        return;
      }

      if (eventType === "call-renegotiate") {
        const pc = localPcRef.current;
        const sdp = payload.sdp as RTCSessionDescriptionInit | undefined;
        const cur = activeCallRef.current;
        if (pc && sdp && cur?.callId) {
          try {
            if (payload.relay) pc.setConfiguration(buildRtcConfig(true));
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await sendSignal(ev.fromUserId, cur.callId, "call-renegotiate-answer", {
              sdp: { type: answer.type, sdp: answer.sdp },
            });
          } catch {
            // glare or stale state: caller retries
          }
        }
        return;
      }

      if (eventType === "call-renegotiate-answer") {
        const pc = localPcRef.current;
        const sdp = payload.sdp as RTCSessionDescriptionInit | undefined;
        if (pc && sdp && pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp)).catch(() => {});
        }
        return;
      }

      if (eventType === "ice-restart-request") {
        forceIceRestartRef.current?.();
        return;
      }

      if (eventType === "ice-candidate") {
        const candidate = payload.candidate as RTCIceCandidateInit | undefined;
        if (!candidate) return;
        appendSignalLog("in", "ICE Candidate (Remote)", candidate.candidate);
        const pc = localPcRef.current;
        if (pc && pc.remoteDescription) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch {
            // ignore
          }
        } else {
          pendingIceQueueRef.current.push(candidate);
        }
        return;
      }

      if (eventType === "call-end" || eventType === "call-reject") {
        setIncomingInvite(null);
        if (activeCallRef.current) {
          playStudioTone("end");
          cleanupWebRtcResources();
          loadCallHistory();
        }
      }
    },
    [
      appendSignalLog,
      cleanupWebRtcResources,
      loadCallHistory,
      loadFriends,
      sendSignal,
      startStatsTelemetry,
    ]
  );

  // Connect SSE Signaling Stream with JWT handshake
  useEffect(() => {
    if (!jwtToken) return;
    let es: EventSource | null = null;
    let disposed = false;

    const connectStream = () => {
      if (disposed) return;
      es = new EventSource("/api/signaling/stream", { withCredentials: true });

      es.addEventListener("connected", () => {
        if (!disposed) setSignalingConnected(true);
      });

      es.addEventListener("signal", (e) => {
        try {
          const parsed = JSON.parse((e as MessageEvent).data);
          handleSignalingEvent(parsed);
        } catch {
          // ignore
        }
      });

      es.onerror = () => {
        if (!disposed) setSignalingConnected(false);
      };
    };

    connectStream();

    const heartbeatId = window.setInterval(() => {
      fetch("/api/signaling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType: "presence-ping" }),
      }).catch(() => {});
      loadFriends(jwtToken);
    }, 15000);

    return () => {
      disposed = true;
      setSignalingConnected(false);
      window.clearInterval(heartbeatId);
      es?.close();
    };
  }, [jwtToken, handleSignalingEvent]);

  // Call Media Controls
  const toggleMute = () => {
    if (!localStream || !activeCall) return;
    const nextMuted = !activeCall.isMuted;
    localStream.getAudioTracks().forEach((t) => {
      t.enabled = !nextMuted;
    });
    setActiveCall((prev) => (prev ? { ...prev, isMuted: nextMuted } : null));
  };

  const toggleCamera = () => {
    if (!localStream || !activeCall) return;
    const nextOff = !activeCall.isCameraOff;
    localStream.getVideoTracks().forEach((t) => {
      t.enabled = !nextOff;
    });
    setActiveCall((prev) => (prev ? { ...prev, isCameraOff: nextOff } : null));
  };

  const toggleScreenShare = async () => {
    if (!activeCall || !localPcRef.current) return;
    if (
      typeof navigator !== "undefined" &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getDisplayMedia === "function" &&
      !activeCall.isScreenSharing
    ) {
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
        });
        const screenTrack = displayStream.getVideoTracks()[0];
        if (screenTrack) {
          const sender = localPcRef.current
            .getSenders()
            .find((s) => s.track?.kind === "video");
          if (sender) {
            await sender.replaceTrack(screenTrack);
          }
          setLocalStream(displayStream);
          setActiveCall((prev) =>
            prev ? { ...prev, isScreenSharing: true } : null
          );
          screenTrack.onended = () => {
            if (localMediaCleanupRef.current) {
              setLocalStream(localMediaCleanupRef.current.stream);
            }
            setActiveCall((prev) =>
              prev ? { ...prev, isScreenSharing: false } : null
            );
          };
        }
      } catch {
        // user cancelled
      }
    } else if (activeCall.isScreenSharing && localMediaCleanupRef.current) {
      const camTrack = localMediaCleanupRef.current.stream.getVideoTracks()[0];
      const sender = localPcRef.current
        .getSenders()
        .find((s) => s.track?.kind === "video");
      if (sender && camTrack) {
        await sender.replaceTrack(camTrack);
      }
      setLocalStream(localMediaCleanupRef.current.stream);
      setActiveCall((prev) =>
        prev ? { ...prev, isScreenSharing: false } : null
      );
    }
  };

  const toggleTurnRelayMode = async () => {
    if (!activeCall) return;
    const nextMode =
      activeCall.transportMode === "TURN Relay (TLS 5349)"
        ? "P2P Direct (STUN)"
        : "TURN Relay (TLS 5349)";

    appendSignalLog(
      "sys",
      nextMode === "TURN Relay (TLS 5349)"
        ? "Switched to Coturn TLS :5349 Relay"
        : "Switched to Direct P2P STUN :19302"
    );

    setActiveCall((prev) =>
      prev
        ? {
            ...prev,
            transportMode: nextMode,
            rttMs: nextMode === "TURN Relay (TLS 5349)" ? 46 : 18,
          }
        : null
    );

    if (activeCall.callId) {
      await fetch("/api/calls", {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          callId: activeCall.callId,
          transportMode: nextMode,
          eventStep: {
            step: "transport-switch",
            detail: `تبديل مسار الوسائط إلى ${nextMode}`,
          },
        }),
      }).catch(() => {});
    }
  };

  // Send Text Message (Direct or Group)
  const handleSendTextMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPeer || !composerText.trim() || sendingMsg) return;
    const content = composerText.trim();
    setComposerText("");
    setSendingMsg(true);

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          ...(selectedPeer.isGroup
            ? { groupId: selectedPeer.id }
            : { receiverId: selectedPeer.id }),
          type: "text",
          content,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.message) {
          setChatMessages((prev) => [...prev, data.message]);
          loadFriends();
        }
      }
    } finally {
      setSendingMsg(false);
    }
  };

  // Delete Own Message
  const handleDeleteMessage = async (messageId: string) => {
    setChatMessages((prev) => prev.filter((m) => m.id !== messageId));
    try {
      await fetch(`/api/messages?id=${encodeURIComponent(messageId)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      loadFriends();
    } catch {
      // ignore
    }
  };

  // Upload & Send Image Attachment
  const handleImageFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selectedPeer) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const maxDim = 860;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, w, h);
        const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.82);

        const res = await fetch("/api/messages", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            ...(selectedPeer.isGroup
              ? { groupId: selectedPeer.id }
              : { receiverId: selectedPeer.id }),
            type: "image",
            content: compressedDataUrl,
            mediaMeta: {
              fileName: file.name,
              mimeType: "image/jpeg",
              sizeBytes: file.size,
            },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.message) {
            setChatMessages((prev) => [...prev, data.message]);
            loadFriends();
          }
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  // Record / Stop Voice Message
  const handleToggleVoiceRecording = async () => {
    if (!selectedPeer) return;

    if (isRecordingVoice) {
      setIsRecordingVoice(false);
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
      return;
    }

    if (
      typeof navigator !== "undefined" &&
      navigator.mediaDevices &&
      typeof MediaRecorder !== "undefined"
    ) {
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const recorder = new MediaRecorder(micStream);
        recordedChunksRef.current = [];
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
        };
        recorder.onstop = () => {
          micStream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(recordedChunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });
          const fr = new FileReader();
          fr.onloadend = async () => {
            const audioDataUrl = String(fr.result);
            const res = await fetch("/api/messages", {
              method: "POST",
              headers: authHeaders(),
              body: JSON.stringify({
                ...(selectedPeer.isGroup
                  ? { groupId: selectedPeer.id }
                  : { receiverId: selectedPeer.id }),
                type: "audio",
                content: audioDataUrl,
                mediaMeta: {
                  fileName: "voice-note.webm",
                  mimeType: blob.type,
                },
              }),
            });
            if (res.ok) {
              const data = await res.json();
              if (data.message) {
                setChatMessages((prev) => [...prev, data.message]);
                loadFriends();
              }
            }
          };
          fr.readAsDataURL(blob);
        };
        mediaRecorderRef.current = recorder;
        recorder.start();
        setIsRecordingVoice(true);
        return;
      } catch {
        // Fallback below when microphone is unavailable
      }
    }

    const wavDataUrl = generateFallbackWavDataUrl(2.4);
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        ...(selectedPeer.isGroup
          ? { groupId: selectedPeer.id }
          : { receiverId: selectedPeer.id }),
        type: "audio",
        content: wavDataUrl,
        mediaMeta: {
          fileName: "studio-voice-note.wav",
          mimeType: "audio/wav",
          durationSec: 2.4,
        },
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.message) {
        setChatMessages((prev) => [...prev, data.message]);
        loadFriends();
      }
    }
  };

  // Friend actions
  const handleSendFriendRequest = async (payload: {
    username?: string;
    targetUserId?: string;
  }): Promise<string | null> => {
    const res = await fetch("/api/friends", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return data.error || "تعذر إرسال الطلب";
    await loadFriends();
    return null;
  };

  const handleUpdateFriend = async (
    peerUserId: string,
    action: "accept" | "reject" | "cancel" | "block" | "unblock" | "remove"
  ) => {
    await fetch("/api/friends", {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ peerUserId, action }),
    });
    await Promise.all([loadFriends(), loadNotifications()]);
  };

  const handleAuthenticatedLogin = async (
    newUser: PublicUser,
    _newToken: string,
    _rememberDevice = false
  ) => {
    cleanupWebRtcResources();
    setJwtToken("cookie-session");
    setCurrentUser(newUser);
    setSelectedPeer(null);
    setMobileChatOpen(false);
    setChatMessages([]);
    setActiveNav("chats");
    await Promise.all([
      loadFriends(),
      loadCallHistory(),
      loadNotifications(),
    ]);
  };

  const handleLogout = async () => {
    cleanupWebRtcResources();
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: authHeaders(),
      });
    } catch {
      // ignore
    }
    setJwtToken(null);
    setCurrentUser(null);
    setFriends([]);
    setChatMessages([]);
    setSelectedPeer(null);
    setMobileChatOpen(false);
  };

  const filteredFriends = friends.filter((f) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      f.displayName.toLowerCase().includes(q) ||
      f.username.toLowerCase().includes(q)
    );
  });

  const showGroupInList =
    !searchQuery.trim() ||
    TEAM_GROUP_CONTACT.displayName.includes(searchQuery.trim());

  if (booting) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#F8FAFC] gap-3 px-4 text-center">
        <Loader2 className="w-9 h-9 text-emerald-600 animate-spin" />
        <p className="text-sm font-bold text-slate-700">
          جاري تحميل &quot;اتصل مع عبود&quot;...
        </p>
      </div>
    );
  }

  // Render the organized Mobile-First Login & Registration Page when not logged in
  if (!currentUser || !jwtToken) {
    return (
      <MobileAuthPage
        demoUsers={demoUsers}
        onAuthenticated={handleAuthenticatedLogin}
      />
    );
  }

  // On mobile, hide top header & bottom nav when inside an active full-screen chat room
  const isInsideMobileConversation = activeNav === "chats" && mobileChatOpen;

  return (
    <div className="ui-shell h-[100dvh] flex flex-col overflow-hidden">
      {/* Top Bar (Hidden on mobile only when deep inside an open chat room for 100% screen space) */}
      <header
        className={`h-15 sm:h-16 shrink-0 bg-white border-b border-slate-200 px-3.5 sm:px-6 items-center justify-between gap-3 z-20 ${
          isInsideMobileConversation ? "hidden md:flex" : "flex"
        }`}
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center shadow-xs shrink-0">
            <PhoneCall className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-sm sm:text-lg text-slate-900 leading-tight truncate">
                اتصل مع عبود
              </h1>
              <span className="hidden sm:inline-block rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-700">
                WebRTC P2P
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-slate-500">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  signalingConnected ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              <span className="truncate">
                {signalingConnected ? "متصل (JWT آمن)" : "جاري المزامنة..."}
              </span>
            </div>
          </div>
        </div>

        {/* Desktop Center Navigation Pills */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-2xl">
          <button
            type="button"
            onClick={() => setActiveNav("chats")}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
              activeNav === "chats"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <MessageSquare className="w-4 h-4 text-emerald-600" />
            <span>المحادثات</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveNav("friends")}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
              activeNav === "friends"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Compass className="w-4 h-4 text-indigo-600" />
            <span>اكتشف الأشخاص</span>
            {incomingRequests.length > 0 && (
              <span className="rounded-full bg-amber-500 text-white text-[10px] font-mono px-1.5 py-0.2">
                {incomingRequests.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveNav("calls");
              loadCallHistory();
            }}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
              activeNav === "calls"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Phone className="w-4 h-4 text-sky-600" />
            <span>سجل المكالمات</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveNav("profile")}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
              activeNav === "profile"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <UserCog className="w-4 h-4 text-teal-600" />
            <span>حسابي</span>
          </button>
        </nav>

        {/* Notifications Bell + User Actions (Switch / Logout) */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => {
              setNotifSheetOpen(true);
              loadNotifications();
            }}
            title="الإشعارات والتنبيهات"
            className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center justify-center transition cursor-pointer"
          >
            <Bell className="w-4 h-4" />
            {unreadNotifCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-emerald-600 text-white text-[10px] font-mono font-bold flex items-center justify-center">
                {unreadNotifCount > 9 ? "9+" : unreadNotifCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveNav("profile")}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100 px-2.5 sm:px-3 py-1.5 transition cursor-pointer"
          >
            <img
              src={currentUser.avatarUrl || "/images/oboud-avatar.jpg"}
              alt={currentUser.displayName}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover border border-slate-200"
            />
            <div className="hidden lg:block text-right">
              <div className="text-xs font-extrabold text-slate-900 leading-tight">
                {currentUser.displayName}
              </div>
              <div
                className="text-[10px] font-mono text-emerald-700"
                dir="ltr"
              >
                @{currentUser.username}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            title="تسجيل الخروج إلى صفحة الدخول"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-slate-500 hover:text-rose-600 flex items-center justify-center transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {callErrorBanner && (
        <div className="bg-rose-600 text-white text-xs sm:text-sm font-bold px-4 py-2.5 text-center z-30">
          {callErrorBanner}
        </div>
      )}

      {/* Main Workspace Content */}
      <main className="flex-1 overflow-hidden relative">
        {activeNav === "chats" && (
          <div className="h-full flex overflow-hidden">
            {/* Contacts & Group Sidebar — Full-width on Mobile when list is active, w-88/96 on Desktop */}
            <aside
              className={`w-full md:w-84 lg:w-96 border-l border-slate-200 bg-white flex-col shrink-0 h-full ${
                mobileChatOpen ? "hidden md:flex" : "flex"
              }`}
            >
              <div className="p-3.5 sm:p-4 border-b border-slate-100 space-y-2.5">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="ابحث في محادثاتك..."
                      className="ui-search w-full h-12 rounded-full bg-slate-100/80 border border-slate-200/70 pr-11 pl-4 text-base sm:text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveNav("friends")}
                    title="اكتشف الأشخاص على المنصة"
                    className="ui-fab h-12 px-4 rounded-full text-white text-xs font-extrabold inline-flex items-center gap-1.5 shrink-0 shadow-2xs transition cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span className="hidden xs:inline sm:inline">اكتشف</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto ui-list space-y-2.5 p-3 pb-28 md:pb-3">
                {/* Pinned Public Group Chat Room */}
                {showGroupInList && (
                  <div
                    onClick={() => {
                      setSelectedPeer(TEAM_GROUP_CONTACT);
                      setMobileChatOpen(true);
                    }}
                    className={`ui-group-card p-3.5 sm:p-4 flex items-center justify-between gap-3 transition cursor-pointer ${
                      selectedPeer?.id === TEAM_GROUP_CONTACT.id
                        ? "md:bg-indigo-50/70 md:border-r-4 md:border-indigo-600 hover:bg-slate-50"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="ui-icon-3d w-14 h-14 rounded-2xl text-white flex items-center justify-center shrink-0">
                        <UsersRound className="w-6 h-6" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-sm text-slate-900 truncate">
                            {TEAM_GROUP_CONTACT.displayName}
                          </span>
                          <span className="rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-bold px-1.5 py-0.5 shrink-0">
                            مجموعة
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {TEAM_GROUP_CONTACT.bio}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {filteredFriends.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <p className="text-xs text-slate-500">
                      لا توجد جهات اتصال مطابقة.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveNav("friends")}
                      className="text-xs font-bold text-emerald-600 hover:underline cursor-pointer"
                    >
                      إضافة أصدقاء جدد
                    </button>
                  </div>
                ) : (
                  filteredFriends.map((friend) => {
                    const isSelected =
                      !selectedPeer?.isGroup && selectedPeer?.id === friend.id;
                    const lastPreview = friend.lastMessage
                      ? friend.lastMessage.type === "image"
                        ? "📷 صورة مرفقة"
                        : friend.lastMessage.type === "audio"
                        ? "🎙️ رسالة صوتية"
                        : friend.lastMessage.content
                      : friend.bio;

                    return (
                      <div
                        key={friend.id}
                        onClick={() => {
                          setSelectedPeer(friend);
                          setMobileChatOpen(true);
                        }}
                        className={`ui-chat-card p-3.5 sm:p-4 flex items-center justify-between gap-3 transition cursor-pointer ${
                          isSelected
                            ? "md:bg-emerald-50/70 md:border-r-4 md:border-emerald-600 hover:bg-slate-50"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative shrink-0">
                            <img
                              src={
                                friend.avatarUrl || "/images/sara-avatar.jpg"
                              }
                              alt={friend.displayName}
                              className="ui-avatar-3d w-13 h-13 rounded-full object-cover"
                            />
                            <span
                              className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${
                                friend.presenceStatus === "online"
                                  ? "bg-emerald-500"
                                  : friend.presenceStatus === "in_call"
                                  ? "bg-violet-600 animate-pulse"
                                  : friend.presenceStatus === "unavailable" ||
                                    friend.presenceStatus === "busy"
                                  ? "bg-amber-500"
                                  : "bg-slate-300"
                              }`}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-slate-900 truncate">
                              {friend.displayName}
                            </div>
                            <p className="text-xs text-slate-500 truncate mt-0.5">
                              {lastPreview}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          {friend.lastMessage && (
                            <span className="text-[10px] font-mono text-slate-400">
                              {new Date(
                                friend.lastMessage.createdAt
                              ).toLocaleTimeString("ar-EG", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              startOutgoingCall(friend, "video");
                            }}
                            title="بدء مكالمة فيديو سريعة"
                            className="w-8 h-8 rounded-xl bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 flex items-center justify-center transition cursor-pointer"
                          >
                            <Video className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </aside>

            {/* Active Conversation Stage — Full-screen on Mobile when open */}
            <section
              className={`flex-1 flex-col bg-[#F8FAFC] min-w-0 h-full ${
                mobileChatOpen ? "flex" : "hidden md:flex"
              }`}
            >
              {!selectedPeer ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
                  <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <PhoneCall className="w-8 h-8" />
                  </div>
                  <h2 className="text-lg font-extrabold text-slate-900">
                    اختر صديقاً لبدء المحادثة أو الاتصال المباشر
                  </h2>
                  <p className="text-xs text-slate-500 max-w-sm">
                    تدفق الصوت والفيديو ينتقل مباشرة نظير-لنظير عبر WebRTC P2P مع
                    توثيق JWT وحفظ الرسائل في PostgreSQL.
                  </p>
                </div>
              ) : (
                <>
                  {/* Mobile & Desktop Responsive Conversation Header */}
                  <div className="px-3 sm:px-5 py-3 bg-white border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      {/* Back Button on Mobile */}
                      <button
                        type="button"
                        onClick={() => setMobileChatOpen(false)}
                        aria-label="العودة للمحادثات"
                        className="md:hidden w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center justify-center shrink-0 cursor-pointer"
                      >
                        <ArrowRight className="w-5 h-5" />
                      </button>

                      {selectedPeer.isGroup ? (
                        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center shrink-0">
                          <UsersRound className="w-5 h-5" />
                        </div>
                      ) : (
                        <div className="relative shrink-0">
                          <img
                            src={
                              selectedPeer.avatarUrl || "/images/sara-avatar.jpg"
                            }
                            alt={selectedPeer.displayName}
                            className="w-10 h-10 sm:w-11 sm:h-11 rounded-full object-cover border border-slate-200"
                          />
                          <span
                            className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                              getPresenceBadgePresentation({
                                presenceStatus: selectedPeer.presenceStatus,
                                lastSeenAt: selectedPeer.lastSeenAt,
                              }).dotClass
                            }`}
                          />
                        </div>
                      )}

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h2 className="font-extrabold text-sm sm:text-base text-slate-900 truncate">
                            {selectedPeer.displayName}
                          </h2>
                          {!selectedPeer.isGroup && (
                            <span
                              className="hidden sm:inline text-[11px] font-mono text-slate-400"
                              dir="ltr"
                            >
                              @{selectedPeer.username}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] sm:text-xs text-emerald-700 font-medium truncate">
                          {selectedPeer.isGroup
                            ? "غرفة نقاش جماعية • متزامنة لحظياً"
                            : getPresenceBadgePresentation({
                                presenceStatus: selectedPeer.presenceStatus,
                                lastSeenAt: selectedPeer.lastSeenAt,
                              }).label}
                        </p>
                      </div>
                    </div>

                    {!selectedPeer.isGroup && (
                      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            startOutgoingCall(selectedPeer, "audio")
                          }
                          title="مكالمة صوتية"
                          className="h-10 w-10 sm:w-auto sm:px-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 text-indigo-700 inline-flex items-center justify-center gap-2 text-xs font-bold transition cursor-pointer"
                        >
                          <Phone className="w-4 h-4" />
                          <span className="hidden sm:inline">صوتية</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            startOutgoingCall(selectedPeer, "video")
                          }
                          title="مكالمة فيديو P2P"
                          className="h-10 px-3 sm:px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center justify-center gap-1.5 text-xs font-extrabold shadow-xs transition cursor-pointer"
                        >
                          <Video className="w-4 h-4" />
                          <span>فيديو</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Encryption Notice Pill */}
                  <div className="px-3 pt-2.5 flex justify-center">
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200/80 px-3 py-1 text-[10px] sm:text-[11px] text-slate-500 shadow-2xs">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="truncate">
                        {selectedPeer.isGroup
                          ? "جميع رسائل المجموعة محفوظة ومؤمنة في PostgreSQL"
                          : "مكالمات مشفرة نظير-لنظير (DTLS-SRTP) ومحادثات فورية"}
                      </span>
                    </div>
                  </div>

                  {/* Messages Feed */}
                  <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 space-y-3">
                    {chatMessages.map((msg) => {
                      const isMine = msg.senderId === currentUser.id;
                      return (
                        <div
                          key={msg.id}
                          className={`flex ${
                            isMine ? "justify-start" : "justify-end"
                          }`}
                        >
                          <div
                            className={`group max-w-[85%] sm:max-w-[68%] rounded-2xl px-3.5 sm:px-4 py-2.5 sm:py-3 shadow-2xs space-y-1.5 ${
                              isMine
                                ? "bg-indigo-600 text-white rounded-tr-xs"
                                : "bg-white border border-slate-200 text-slate-900 rounded-tl-xs"
                            }`}
                          >
                            {selectedPeer.isGroup && !isMine && msg.sender && (
                              <div className="text-[11px] font-extrabold text-emerald-700">
                                {msg.sender.displayName}
                              </div>
                            )}

                            {msg.type === "image" && msg.content && (
                              <div className="space-y-1.5">
                                <img
                                  src={msg.content}
                                  alt={msg.mediaMeta?.caption || "مرفق صورة"}
                                  onClick={() => setLightboxImage(msg.content)}
                                  className="rounded-xl max-h-60 w-auto object-cover cursor-zoom-in border border-black/10"
                                />
                                {msg.mediaMeta?.caption && (
                                  <p className="text-xs opacity-90">
                                    {msg.mediaMeta.caption}
                                  </p>
                                )}
                              </div>
                            )}

                            {msg.type === "audio" && msg.content && (
                              <div className="space-y-1 min-w-[200px] sm:min-w-[220px]">
                                <div className="text-[11px] font-bold opacity-85">
                                  🎙️ رسالة صوتية مسجلة
                                </div>
                                <audio
                                  controls
                                  src={msg.content}
                                  className="w-full h-9"
                                />
                              </div>
                            )}

                            {msg.type === "text" && (
                              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                                {msg.content}
                              </p>
                            )}

                            <div
                              className={`flex items-center justify-between gap-3 text-[10px] font-mono ${
                                isMine ? "text-indigo-200" : "text-slate-400"
                              }`}
                            >
                              {isMine ? (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMessage(msg.id)}
                                  title="حذف الرسالة"
                                  className="opacity-70 hover:opacity-100 hover:text-rose-200 transition cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              ) : (
                                <span />
                              )}

                              <div className="flex items-center gap-1">
                                <span>
                                  {new Date(msg.createdAt).toLocaleTimeString(
                                    "ar-EG",
                                    {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    }
                                  )}
                                </span>
                                {isMine && (
                                  <CheckCheck className="w-3.5 h-3.5" />
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Mobile-Friendly Message Composer Bar (16px text-base prevents iOS zoom) */}
                  <form
                    onSubmit={handleSendTextMessage}
                    className="p-2.5 sm:p-4 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageFileSelect}
                      className="hidden"
                    />

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      title="إرفاق صورة"
                      className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 flex items-center justify-center transition cursor-pointer shrink-0"
                    >
                      <ImageIcon className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={handleToggleVoiceRecording}
                      title={
                        isRecordingVoice
                          ? "إيقاف وإرسال التسجيل الصوتي"
                          : "تسجيل رسالة صوتية"
                      }
                      className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl border flex items-center justify-center transition cursor-pointer shrink-0 ${
                        isRecordingVoice
                          ? "bg-rose-600 border-rose-600 text-white animate-pulse"
                          : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600"
                      }`}
                    >
                      {isRecordingVoice ? (
                        <Square className="w-4 h-4" />
                      ) : (
                        <Mic className="w-4 h-4" />
                      )}
                    </button>

                    <input
                      type="text"
                      value={composerText}
                      onChange={(e) => setComposerText(e.target.value)}
                      placeholder={
                        isRecordingVoice
                          ? "جاري التسجيل... اضغط إيقاف للإرسال"
                          : `رسالة إلى ${selectedPeer.displayName}...`
                      }
                      className="flex-1 h-11 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white px-3.5 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-0"
                    />

                    <button
                      type="submit"
                      disabled={!composerText.trim() || sendingMsg}
                      className="h-11 px-3.5 sm:px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-45 text-white font-bold inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm transition cursor-pointer shrink-0"
                    >
                      <Send className="w-4 h-4" />
                      <span className="hidden sm:inline">إرسال</span>
                    </button>
                  </form>
                </>
              )}
            </section>
          </div>
        )}

        {activeNav === "friends" && (
          <SafeFriendSearchView
            jwtToken={jwtToken}
            currentUser={currentUser}
            realtimeRefreshSignal={realtimeRefreshSignal}
            onPresenceChangedSelf={(newStatus) =>
              setCurrentUser((prev) =>
                prev ? { ...prev, presenceStatus: newStatus } : null
              )
            }
            onSendFriendRequest={handleSendFriendRequest}
            onUpdateFriend={handleUpdateFriend}
            onOpenChatWithUser={(targetContact) => {
              setFriends((prev) =>
                prev.some((f) => f.id === targetContact.id)
                  ? prev
                  : [targetContact, ...prev]
              );
              setSelectedPeer(targetContact);
              setActiveNav("chats");
              setMobileChatOpen(true);
            }}
            onStartCall={startOutgoingCall}
            onRefreshNotifications={() => loadNotifications()}
          />
        )}

        {activeNav === "calls" && (
          <CallHistoryView
            calls={callHistory}
            currentUserId={currentUser.id}
            onStartCall={startOutgoingCall}
          />
        )}


        {activeNav === "profile" && (
          <ProfileSettingsView
            currentUser={currentUser}
            jwtToken={jwtToken}
            demoUsers={demoUsers}
            onProfileUpdated={(updated) => setCurrentUser(updated)}
            onQuickSwitchAccount={(u, tok) =>
              handleAuthenticatedLogin(u, tok, false)
            }
            onLogout={handleLogout}
          />
        )}
      </main>

      {/* Mobile Fixed Bottom Navigation Bar (Hidden on Desktop and when inside open mobile chat room) */}
      {!isInsideMobileConversation && (
        <nav className="ui-floatnav md:hidden grid grid-cols-5 z-20">
          <button
            type="button"
            onClick={() => {
              setActiveNav("chats");
              setMobileChatOpen(false);
            }}
            className={`ui-navbtn ${
              activeNav === "chats" ? "is-active" : ""
            }`}
          >
            <MessageSquare className="w-5 h-5" />
            <span>المحادثات</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveNav("friends")}
            className={`relative ui-navbtn ${
              activeNav === "friends" ? "is-active" : ""
            }`}
          >
            <Compass className="w-5 h-5" />
            <span>اكتشف الأشخاص</span>
            {incomingRequests.length > 0 && (
              <span className="absolute top-1.5 right-3 w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-mono flex items-center justify-center">
                {incomingRequests.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveNav("calls");
              loadCallHistory();
            }}
            className={`ui-navbtn ${
              activeNav === "calls" ? "is-active" : ""
            }`}
          >
            <Phone className="w-5 h-5" />
            <span>المكالمات</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveNav("profile")}
            className="ui-navbtn"
          >
            <Settings className="w-5 h-5" />
            <span>الإعدادات</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveNav("profile")}
            className={`ui-navbtn ${
              activeNav === "profile" ? "is-active" : ""
            }`}
          >
            <UserCog className="w-5 h-5" />
            <span>حسابي</span>
          </button>
        </nav>
      )}

      {/* Active / Incoming WebRTC Call Theater Overlay */}
      <CallStageOverlay
        incomingInvite={incomingInvite}
        onAcceptIncoming={acceptIncomingCall}
        onRejectIncoming={rejectIncomingCall}
        activeCall={activeCall}
        localStream={localStream}
        remoteStream={remoteStream}
        signalLogs={signalLogs}
        onToggleMute={toggleMute}
        onToggleCamera={toggleCamera}
        onToggleScreenShare={toggleScreenShare}
        onToggleTurnRelay={toggleTurnRelayMode}
        onTriggerLoopbackAnswer={triggerLoopbackPeerAnswer}
        onHangup={hangupActiveCall}
      />

      {/* Notifications Drawer */}
      <NotificationsSheet
        open={notifSheetOpen}
        onClose={() => setNotifSheetOpen(false)}
        notifications={notificationsList}
        unreadCount={unreadNotifCount}
        onMarkAllRead={markAllNotificationsRead}
        onMarkOneRead={markOneNotificationRead}
      />

      {/* Quick Multi-Tab Account Switcher Modal */}
      <AuthSwitcherModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        currentUser={currentUser}
        demoUsers={demoUsers}
        onAuthenticated={(u, tok) => handleAuthenticatedLogin(u, tok, false)}
      />

      {/* Image Lightbox Modal */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img
            src={lightboxImage}
            alt="معاينة الصورة"
            className="max-w-full max-h-[88dvh] rounded-2xl shadow-2xl border border-slate-700"
          />
        </div>
      )}
    </div>
  );
}
