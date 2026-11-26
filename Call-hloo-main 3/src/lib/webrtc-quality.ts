export type NetQuality = "excellent" | "good" | "poor" | "bad";

const STUN: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/** TURN is read from NEXT_PUBLIC_TURN_URLS (comma separated), *_USERNAME, *_CREDENTIAL. */
export function hasTurnConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_TURN_URLS;
}

export function buildRtcConfig(forceRelay = false): RTCConfiguration {
  const iceServers = [...STUN];
  const turnUrls = process.env.NEXT_PUBLIC_TURN_URLS;
  if (turnUrls) {
    iceServers.push({
      urls: turnUrls.split(",").map((u) => u.trim()).filter(Boolean),
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }
  return {
    iceServers,
    // Pre-gather candidates so the offer/answer is ready sooner.
    iceCandidatePoolSize: 4,
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
    iceTransportPolicy: forceRelay && hasTurnConfigured() ? "relay" : "all",
  };
}

function isAppleWebkit(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Safari/.test(ua) && !/Chrome|Chromium|Android/.test(ua));
}

/** VP8 first (software-friendly, resilient); H.264 first on Safari/iOS where it is hardware-accelerated. */
export function applyCodecPreferences(pc: RTCPeerConnection) {
  try {
    const caps = RTCRtpSender.getCapabilities?.("video");
    if (!caps) return;
    const rank = (mime: string) => {
      const m = mime.toLowerCase();
      const order = isAppleWebkit()
        ? ["video/h264", "video/vp8"]
        : ["video/vp8", "video/h264"];
      const i = order.indexOf(m);
      return i === -1 ? 10 : i;
    };
    const sorted = [...caps.codecs].sort((a, b) => rank(a.mimeType) - rank(b.mimeType));
    pc.getTransceivers().forEach((t) => {
      if (t.receiver.track.kind === "video" && t.setCodecPreferences) {
        t.setCodecPreferences(sorted);
      }
    });
  } catch {
    // unsupported: browser default negotiation
  }
}

export const VIDEO_TIERS = [
  { maxBitrate: 1_500_000, scale: 1, maxFramerate: 30 },
  { maxBitrate: 800_000, scale: 1.5, maxFramerate: 30 },
  { maxBitrate: 400_000, scale: 2, maxFramerate: 24 },
  { maxBitrate: 150_000, scale: 4, maxFramerate: 15 },
] as const;

/** Audio gets high priority and a small, steady bitrate; video degrades resolution before audio suffers. */
export async function tuneSenders(pc: RTCPeerConnection, tier = 0) {
  for (const sender of pc.getSenders()) {
    const kind = sender.track?.kind;
    if (!kind) continue;
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      const enc = params.encodings[0];
      if (kind === "audio") {
        enc.maxBitrate = 40_000;
        enc.priority = "high";
        enc.networkPriority = "high";
      } else {
        const t = VIDEO_TIERS[tier];
        enc.maxBitrate = t.maxBitrate;
        enc.scaleResolutionDownBy = t.scale;
        enc.maxFramerate = t.maxFramerate;
        enc.priority = "low";
        enc.networkPriority = "low";
        (params as RTCRtpSendParameters).degradationPreference = "maintain-framerate";
      }
      await sender.setParameters(params);
    } catch {
      // not supported by this browser
    }
  }
}

/** Ask the receiving jitter buffer for minimum audio delay. */
export function lowLatencyReceivers(pc: RTCPeerConnection) {
  pc.getReceivers().forEach((r) => {
    try {
      const rr = r as RTCRtpReceiver & { jitterBufferTarget?: number | null };
      if ("jitterBufferTarget" in rr) rr.jitterBufferTarget = r.track.kind === "audio" ? 0 : 50;
    } catch {
      // ignore
    }
  });
}

export interface StatsSample {
  rttMs: number | null;
  lossPct: number;
  outKbps: number;
  relay: boolean;
  quality: NetQuality;
}

export function classify(rttMs: number | null, lossPct: number): NetQuality {
  const rtt = rttMs ?? 0;
  if (lossPct > 12 || rtt > 600) return "bad";
  if (lossPct > 5 || rtt > 300) return "poor";
  if (lossPct > 1.5 || rtt > 150) return "good";
  return "excellent";
}

/** Reads getStats() and derives RTT, packet loss, send bitrate and relay usage. */
export async function sampleStats(
  pc: RTCPeerConnection,
  prev: { bytes: number; at: number; lost: number; recv: number }
): Promise<{ sample: StatsSample; next: typeof prev }> {
  const report = await pc.getStats();
  let rtt: number | null = null;
  let bytes = 0;
  let lost = 0;
  let recv = 0;
  let relay = false;
  const byId = new Map<string, RTCStats & Record<string, unknown>>();
  report.forEach((s) => byId.set(s.id, s as RTCStats & Record<string, unknown>));
  report.forEach((s) => {
    const st = s as RTCStats & Record<string, unknown>;
    if (st.type === "candidate-pair" && (st.nominated || st.state === "succeeded") && typeof st.currentRoundTripTime === "number") {
      rtt = Math.round((st.currentRoundTripTime as number) * 1000);
      const local = byId.get(String(st.localCandidateId));
      if (local && local.candidateType === "relay") relay = true;
    }
    if (st.type === "outbound-rtp" && typeof st.bytesSent === "number") bytes += st.bytesSent as number;
    if (st.type === "inbound-rtp") {
      lost += Number(st.packetsLost || 0);
      recv += Number(st.packetsReceived || 0);
    }
  });
  const now = performance.now();
  const dt = Math.max(0.5, (now - prev.at) / 1000);
  const dLost = Math.max(0, lost - prev.lost);
  const dRecv = Math.max(0, recv - prev.recv);
  const lossPct = dLost + dRecv > 0 ? (dLost / (dLost + dRecv)) * 100 : 0;
  const outKbps = prev.at ? Math.round(((bytes - prev.bytes) * 8) / dt / 1000) : 0;
  return {
    sample: { rttMs: rtt, lossPct, outKbps, relay, quality: classify(rtt, lossPct) },
    next: { bytes, at: now, lost, recv },
  };
}
