export interface ManagedMediaResult {
  stream: MediaStream;
  isSynthetic: boolean;
  cleanup: () => void;
}

/**
 * Attempts real getUserMedia first; falls back cleanly to a live 30fps studio canvas + silent/ambient audio track
 * so RTCPeerConnection SDP negotiation & live video tracks work 100% reliably in any browser environment.
 */
export async function acquireUserOrSyntheticStream(
  callType: "video" | "audio",
  labelName: string
): Promise<ManagedMediaResult> {
  if (
    typeof navigator !== "undefined" &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  ) {
    try {
      const realStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
        },
        video:
          callType === "video"
            ? {
                width: { ideal: 960, max: 1280 },
                height: { ideal: 540, max: 720 },
                frameRate: { ideal: 30, max: 30 },
                facingMode: "user",
              }
            : false,
      });

      realStream.getAudioTracks().forEach((t) => {
        (t as MediaStreamTrack & { contentHint?: string }).contentHint = "speech";
      });
      realStream.getVideoTracks().forEach((t) => {
        (t as MediaStreamTrack & { contentHint?: string }).contentHint = "motion";
      });

      return {
        stream: realStream,
        isSynthetic: false,
        cleanup: () => {
          realStream.getTracks().forEach((t) => t.stop());
        },
      };
    } catch {
      // Fallback to synthetic studio stream below
    }
  }

  return createStudioCanvasStream({
    title: labelName,
    subtitle: "بث الكاميرا المحلية (وضع الاستوديو الافتراضي)",
    accentHex: "#10B981",
    secondaryHex: "#0F172A",
    includeVideo: callType === "video",
    gentleVoiceWave: false,
  });
}

export function createStudioCanvasStream(opts: {
  title: string;
  subtitle: string;
  accentHex: string;
  secondaryHex: string;
  includeVideo: boolean;
  avatarUrl?: string | null;
  gentleVoiceWave?: boolean;
}): ManagedMediaResult {
  const tracks: MediaStreamTrack[] = [];
  const cleanups: Array<() => void> = [];

  // 1. Create live WebAudio MediaStreamTrack
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const dest = ctx.createMediaStreamDestination();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = opts.gentleVoiceWave ? 220 : 180;
      // Extremely subtle or near-silent gain so there's no annoying hum, while RTP packets actively flow!
      gain.gain.value = opts.gentleVoiceWave ? 0.004 : 0.0005;
      osc.connect(gain);
      gain.connect(dest);
      osc.start();

      const audioTrack = dest.stream.getAudioTracks()[0];
      if (audioTrack) {
        tracks.push(audioTrack);
      }
      cleanups.push(() => {
        try {
          osc.stop();
          ctx.close();
        } catch {
          // ignore
        }
      });
    }
  } catch {
    // ignore WebAudio restrictions
  }

  // 2. Create 30fps live animated Canvas Video Track when video call is active
  if (opts.includeVideo && typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 540;
    const ctx = canvas.getContext("2d");

    let avatarImg: HTMLImageElement | null = null;
    if (opts.avatarUrl) {
      avatarImg = new Image();
      avatarImg.crossOrigin = "anonymous";
      avatarImg.src = opts.avatarUrl;
    }

    let frame = 0;
    const drawFrame = () => {
      if (!ctx) return;
      frame += 1;
      const t = frame * 0.05;

      // Studio dark gradient background
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, opts.secondaryHex);
      grad.addColorStop(0.55, "#1E293B");
      grad.addColorStop(1, "#0F172A");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Subtle glowing radar circles
      for (let i = 1; i <= 3; i++) {
        const radius = 95 + i * 38 + Math.sin(t + i) * 8;
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2 - 22, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(16, 185, 129, ${0.22 - i * 0.05})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Avatar circle in center
      const cx = canvas.width / 2;
      const cy = canvas.height / 2 - 22;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, 76, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      if (avatarImg && avatarImg.complete && avatarImg.naturalWidth > 0) {
        ctx.drawImage(avatarImg, cx - 76, cy - 76, 152, 152);
      } else {
        ctx.fillStyle = opts.accentHex;
        ctx.fillRect(cx - 76, cy - 76, 152, 152);
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 46px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(opts.title.slice(0, 2), cx, cy);
      }
      ctx.restore();

      // Glowing border around avatar
      ctx.beginPath();
      ctx.arc(cx, cy, 78, 0, Math.PI * 2);
      ctx.strokeStyle = opts.accentHex;
      ctx.lineWidth = 4;
      ctx.stroke();

      // Live audio equalizer bars under avatar
      const barCount = 19;
      const barWidth = 8;
      const gap = 6;
      const totalWidth = barCount * barWidth + (barCount - 1) * gap;
      const startX = (canvas.width - totalWidth) / 2;
      const baseY = cy + 122;

      for (let b = 0; b < barCount; b++) {
        const wave =
          Math.abs(Math.sin(t * 2.1 + b * 0.45)) *
          (b % 2 === 0 ? 28 : 18) +
          6;
        ctx.fillStyle = opts.accentHex;
        ctx.beginPath();
        ctx.roundRect(startX + b * (barWidth + gap), baseY - wave / 2, barWidth, wave, 4);
        ctx.fill();
      }

      // Title & live P2P badge
      ctx.fillStyle = "#F8FAFC";
      ctx.font = "bold 28px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(opts.title, cx, baseY + 52);

      ctx.fillStyle = "#94A3B8";
      ctx.font = "18px sans-serif";
      ctx.fillText(opts.subtitle, cx, baseY + 84);

      // Top-left WebRTC P2P RTP frame counter
      ctx.fillStyle = "rgba(15, 23, 42, 0.72)";
      ctx.beginPath();
      ctx.roundRect(24, 24, 295, 38, 19);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(46, 43, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#10B981";
      ctx.fill();

      ctx.fillStyle = "#E2E8F0";
      ctx.font = "14px monospace";
      ctx.textAlign = "left";
      const clock = new Date().toLocaleTimeString("en-GB");
      ctx.fillText(`WebRTC RTP LIVE • ${clock}`, 62, 48);
    };

    drawFrame();
    const intervalId = window.setInterval(drawFrame, 33);
    cleanups.push(() => window.clearInterval(intervalId));

    if (typeof canvas.captureStream === "function") {
      const canvasStream = canvas.captureStream(30);
      canvasStream.getVideoTracks().forEach((vt) => tracks.push(vt));
      cleanups.push(() => {
        canvasStream.getTracks().forEach((t) => t.stop());
      });
    }
  }

  const combined = new MediaStream(tracks);

  return {
    stream: combined,
    isSynthetic: true,
    cleanup: () => {
      cleanups.forEach((fn) => fn());
      combined.getTracks().forEach((t) => t.stop());
    },
  };
}

export function playStudioTone(kind: "ring" | "connect" | "end") {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (kind === "ring") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.16);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.start(now);
      osc.stop(now + 0.46);
    } else if (kind === "connect") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(587.33, now + 0.1);
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.32);
    } else {
      osc.type = "sine";
      osc.frequency.setValueAtTime(392, now);
      osc.frequency.setValueAtTime(261.63, now + 0.12);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.start(now);
      osc.stop(now + 0.3);
    }

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 600);
  } catch {
    // ignore audio autoplay policy errors
  }
}
