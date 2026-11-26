"use client";

import React, { useEffect, useState } from "react";
import {
  Activity,
  Check,
  Copy,
  Database,
  Globe,
  Layers,
  Lock,
  Network,
  PhoneCall,
  RefreshCw,
  Server,
  ShieldCheck,
  Smartphone,
  Terminal,
  Video,
} from "lucide-react";

interface ArchStatsResponse {
  metrics: {
    users: number;
    friends: number;
    messages: number;
    calls: number;
    signalingPackets: number;
    onlineUsers: number;
  };
  iceConfig: {
    stun: string[];
    turn: string;
    encryption: string;
    authHandshake: string;
  };
  checkedAt: string;
}

const VALIDATED_MERMAID_DIAGRAM = `%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#f8f9fa', 'primaryBorderColor': '#6c757d', 'secondaryColor': '#e9ecef', 'fontFamily': 'sans-serif'}}}%%
flowchart TB
    subgraph F[ Frontend Clients ]
        A[Mobile App - Flutter]
        B[Web App - React / Next.js TS]
        C[Desktop / WebView]
    end
    subgraph S[ Signaling & API Layer ]
        GS[Gateway Nginx / Cloud LB]
        AUTH[Auth Service: JWT HS256 + bcrypt]
        WS[Real-Time Signaling Server]
        REST[REST API Service]
    end
    subgraph M[ Media & NAT Traversal ]
        TURN[TURN Server - Coturn + TLS 5349]
        STUN[Public STUN - Google 19302]
        REC[Optional Media Recorder / MCU]
    end
    subgraph D[ Database & Storage ]
        PG[(PostgreSQL: users/friends/messages/calls)]
        OBJ[Object / Media Storage]
        REDIS[(Presence & Session Cache)]
    end
    A -->|HTTPS + WS/SSE JWT| GS
    B -->|HTTPS + WS/SSE JWT| GS
    C -->|HTTPS + WS/SSE JWT| GS
    GS --> AUTH
    AUTH --> WS
    GS --> REST
    REST <--> PG
    REST <--> OBJ
    WS -.-> REDIS
    WS -.-> TURN
    WS -.-> STUN
    A -->|WebRTC Offer/Answer + ICECandidates| WS
    B -->|WebRTC Offer/Answer + ICECandidates| WS
    A -.->|Direct P2P Media Stream DTLS-SRTP| B
    A -.->|Fallback Relay Stream| TURN
    B -.->|Fallback Relay Stream| TURN`;

const DOCKER_COMPOSE_SNIPPET = `version: '3.8'
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: callapp
    volumes:
      - pg_data:/var/lib/postgresql/data
    ports: ["5432:5432"]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
  turn:
    image: coturn/coturn:latest
    command: ["-c", "/etc/turn/turn.conf"]
    volumes:
      - ./turn:/etc/turn
    ports: ["3478:3478/udp", "5349:5349/tcp"]
  api:
    build: ./backend
    environment:
      DATABASE_URL: postgres://app:changeme@db:5432/callapp
      JWT_SECRET: \${JWT_SECRET}
      TURN_USER: callapp
      TURN_PASSWORD: secure123
    depends_on: [db, redis, turn]
    ports: ["3000:3000"]
  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    ports: ["443:443"]
    depends_on: [api]
volumes:
  pg_data:`;

const NGINX_SNIPPET = `events { worker_connections 1024; }
http {
    upstream api { server api:3000; }
    server {
        listen 443 ssl;
        ssl_certificate /etc/letsencrypt/live/api.oboud.app/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/api.oboud.app/privkey.pem;
        location / {
            proxy_pass http://api;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
        }
        location /media/ {
            alias /var/www/media/;
        }
    }
}`;

const SQL_SNIPPET = `CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_url TEXT,
    device_token TEXT,
    presence_status TEXT DEFAULT 'online',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE friends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    friend_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status friend_status DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, friend_id)
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type message_type NOT NULL,
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caller_id UUID REFERENCES users(id) ON DELETE CASCADE,
    callee_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status call_status DEFAULT 'ringing',
    type call_type NOT NULL,
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,
    signaling_json JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);`;

const LAYER_CARDS = [
  {
    id: "frontend",
    title: "طبقة العملاء (Frontend Clients)",
    badge: "Flutter + React / Next.js TS",
    color: "border-indigo-200 bg-indigo-50/60 text-indigo-950",
    icon: Smartphone,
    summary:
      "تشغيل الكاميرا والميكروفون عبر getUserMedia، وبناء جلسة RTCPeerConnection، وجمع مرشحات ICE وعرض المكالمات والمحادثات.",
    details: [
      "قيود الصوت والفيديو عالية الدقة مع إلغاء الصدى والضجيج",
      "إدارة حالات الرنين، كتم الميكروفون، إيقاف الكاميرا، ومشاركة الشاشة",
      "دعم اتصال التبويبات المتعددة ومحاكاة النظير الذكي للاختبار الفوري",
    ],
  },
  {
    id: "signaling",
    title: "طبقة الإشارات والمصادقة (Signaling & API)",
    badge: "JWT HS256 + bcrypt + SSE/WS",
    color: "border-emerald-200 bg-emerald-50/60 text-emerald-950",
    colorDot: "bg-emerald-600",
    icon: Server,
    summary:
      "التحقق من الهوية عبر bcrypt + JWT وتوجيه حزم SDP Offer/Answer ومرشحات ICE دون لمس البث الخام للوسائط.",
    details: [
      "توثيق الاتصال عبر جلسة آمنة في Cookie من نوع HttpOnly دون وضع الرموز السرية في عناوين URL",
      "توجيه فوري لأحداث call-invite و call-answer و ice-candidate",
      "واجهات REST متكاملة للأصدقاء، الرسائل، وسجل المكالمات",
    ],
  },
  {
    id: "media",
    title: "طبقة الوسائط واجتياز الجدران (Media & Traversal)",
    badge: "WebRTC P2P + STUN 19302 + Coturn 5349",
    color: "border-amber-200 bg-amber-50/60 text-amber-950",
    icon: Network,
    summary:
      "انتقال الصوت والفيديو مشفراً نظير-لنظير (DTLS-SRTP) مباشرة بين المتصلين مع احتياطي TURN عند وجود جدار ناري متماثل.",
    details: [
      "استخدام خوادم Google STUN العامة لاكتشاف العنوان العام (srflx)",
      "التبديل التلقائي لمرحل Coturn TLS على المنفذ 5349 عند فشل المسار المباشر",
      "الخادم لا يخزن ولا يعالج التدفق الصوتي/المرئي الخام حفاظاً على الخصوصية والأداء",
    ],
  },
  {
    id: "database",
    title: "طبقة البيانات والتخزين (PostgreSQL & Storage)",
    badge: "PostgreSQL + Drizzle ORM + JSONB",
    color: "border-sky-200 bg-sky-50/60 text-sky-950",
    icon: Database,
    summary:
      "تخزين معياري للمستخدمين والأصدقاء والرسائل وسجلات المكالمات مع حفظ حزم التشخيص signaling_json بصيغة JSONB.",
    details: [
      "فهارس سريعة للرسائل والمكالمات وعلاقات الصداقة الثنائية",
      "حفظ الصور المرسلة والمقاطع الصوتية مع بياناتها الوصفية",
      "تتبع الحضور اللحظي (Online / Offline) وآخر ظهور لكل مستخدم",
    ],
  },
];

const SIGNALING_STEPS = [
  {
    num: 1,
    title: "تسجيل الدخول والتحقق (JWT + bcrypt)",
    desc: "التحقق من البريد/كلمة المرور عبر bcrypt وإصدار رمز JWT موقع بخوارزمية HS256.",
  },
  {
    num: 2,
    title: "فتح قناة الإشارات الموثقة",
    desc: "تمرير رمز JWT في المصافحة لفتح قناة الإشارات الفورية واستقبال الأحداث.",
  },
  {
    num: 3,
    title: "بث حالة الحضور (Presence)",
    desc: "تسجيل المستخدم كمتصل (Online) وتحديث قائمة الأصدقاء لحظياً.",
  },
  {
    num: 4,
    title: "بدء المكالمة وإنشاء SDP Offer",
    desc: "تشغيل getUserMedia وإضافة المسارات لـ RTCPeerConnection وتوليد عرض الاتصال.",
  },
  {
    num: 5,
    title: "توجيه الدعوة واستلام SDP Answer",
    desc: "عرض إشعار الرنين لدى الطرف الثاني وتوليد SDP Answer وإعادته للمتصل.",
  },
  {
    num: 6,
    title: "تبادل مرشحات الشبكة (ICE Candidates)",
    desc: "جمع عناوين الشبكة عبر onicecandidate وتمريرها لإتمام الربط المباشر.",
  },
  {
    num: 7,
    title: "تدفق الوسائط المباشر P2P / TURN",
    desc: "عبور الصوت والفيديو مباشرة بين الطرفين بتشفير DTLS-SRTP أو عبر Coturn عند الحاجة.",
  },
  {
    num: 8,
    title: "إنهاء المكالمة وأرشفة السجل",
    desc: "إغلاق PeerConnection وتسجيل وقت الانتهاء وحزم الإشارات في جدول calls.",
  },
];

export function ArchitectureStudioView({
  onStartQuickDemoCall,
}: {
  onStartQuickDemoCall?: () => void;
}) {
  const [stats, setStats] = useState<ArchStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLayer, setSelectedLayer] = useState<string>("signaling");
  const [activeCodeTab, setActiveCodeTab] = useState<
    "mermaid" | "sql" | "docker" | "nginx"
  >("mermaid");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadStats = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/architecture/stats");
      if (res.ok) {
        const data = (await res.json()) as ArchStatsResponse;
        setStats(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const copySnippet = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // ignore
    }
  };

  const activeLayerObj =
    LAYER_CARDS.find((l) => l.id === selectedLayer) ?? LAYER_CARDS[1]!;

  const codeContent =
    activeCodeTab === "mermaid"
      ? VALIDATED_MERMAID_DIAGRAM
      : activeCodeTab === "sql"
      ? SQL_SNIPPET
      : activeCodeTab === "docker"
      ? DOCKER_COMPOSE_SNIPPET
      : NGINX_SNIPPET;

  return (
    <div className="h-full overflow-y-auto bg-[#F8FAFC] p-4 sm:p-6 lg:p-8 pb-24 md:pb-8 space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-800">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>معمارية إنتاجية حية • WebRTC P2P + PostgreSQL</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">
            المخطط الهندسي وتدفق الإشارات لتطبيق &quot;اتصل مع عبود&quot;
          </h2>
          <p className="text-sm text-slate-600 max-w-3xl">
            جميع الطبقات أدناه تعمل فعلياً في هذا التطبيق: مصادقة{" "}
            <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
              JWT HS256 + bcrypt
            </span>
            ، وجداول{" "}
            <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
              PostgreSQL
            </span>
            ، وتبادل حزم{" "}
            <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
              SDP / ICE
            </span>{" "}
            المباشر.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={loadStats}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-700 transition cursor-pointer"
          >
            <RefreshCw
              className={`w-4 h-4 ${loading ? "animate-spin text-emerald-600" : ""}`}
            />
            <span>تحديث المقاييس الحية</span>
          </button>
          {onStartQuickDemoCall && <button
            type="button"
            onClick={onStartQuickDemoCall}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition cursor-pointer"
          >
            <Video className="w-4 h-4" />
            <span>اختبار مكالمة WebRTC حية الآن</span>
          </button>}
        </div>
      </div>

      {/* Live Database & Signaling Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          {
            label: "المستخدمون (users)",
            val: stats?.metrics.users ?? "—",
            accent: "text-slate-900",
          },
          {
            label: "متصل الآن (Online)",
            val: stats?.metrics.onlineUsers ?? "—",
            accent: "text-emerald-600",
          },
          {
            label: "علاقات الصداقة",
            val: stats?.metrics.friends ?? "—",
            accent: "text-indigo-600",
          },
          {
            label: "الرسائل المحفوظة",
            val: stats?.metrics.messages ?? "—",
            accent: "text-sky-600",
          },
          {
            label: "سجلات المكالمات",
            val: stats?.metrics.calls ?? "—",
            accent: "text-amber-600",
          },
          {
            label: "حزم الإشارات SDP/ICE",
            val: stats?.metrics.signalingPackets ?? "—",
            accent: "text-rose-600",
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl bg-white border border-slate-200 p-4 shadow-2xs"
          >
            <div className="text-xs font-medium text-slate-500">{item.label}</div>
            <div className={`mt-1.5 text-2xl font-extrabold font-mono ${item.accent}`}>
              {item.val}
            </div>
          </div>
        ))}
      </div>

      {/* Interactive Visual Architecture Topology */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-600" />
              <h3 className="font-bold text-slate-900 text-base">
                مخطط الطبقات المعماري التفاعلي (اضغط على أي طبقة للفحص)
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-500">
              P2P Topology v1.0
            </span>
          </div>

          <div className="space-y-3">
            {LAYER_CARDS.map((layer, index) => {
              const Icon = layer.icon;
              const isSelected = selectedLayer === layer.id;
              return (
                <React.Fragment key={layer.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedLayer(layer.id)}
                    className={`w-full text-right rounded-xl border p-4 transition cursor-pointer ${
                      isSelected
                        ? `${layer.color} ring-2 ring-indigo-500/30 shadow-xs`
                        : "border-slate-200 bg-slate-50/60 hover:bg-slate-50 text-slate-900"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-white border border-slate-200/80 flex items-center justify-center shadow-2xs">
                          <Icon className="w-4 h-4 text-slate-800" />
                        </div>
                        <div>
                          <div className="font-bold text-sm">{layer.title}</div>
                          <div className="text-xs text-slate-600 mt-0.5">
                            {layer.summary}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-[11px] font-semibold bg-white/90 border border-slate-200 px-2.5 py-1 rounded-md text-slate-700">
                        {layer.badge}
                      </span>
                    </div>
                  </button>
                  {index < LAYER_CARDS.length - 1 && (
                    <div className="flex items-center justify-center gap-3 text-[11px] font-mono text-slate-400">
                      <span>↓↑</span>
                      <span>
                        {index === 0
                          ? "HTTPS + JWT Handshake + SDP/ICE"
                          : index === 1
                          ? "STUN 19302 / Coturn TLS 5349 + Direct P2P RTP"
                          : "SQL Queries + JSONB Signaling Logs"}
                      </span>
                      <span>↓↑</span>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Selected Layer Technical Inspector + ICE Config */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                تفاصيل الطبقة المحددة
              </span>
              <span className="font-mono text-xs bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-md">
                {activeLayerObj.badge}
              </span>
            </div>
            <h4 className="text-lg font-extrabold text-slate-900">
              {activeLayerObj.title}
            </h4>
            <p className="text-sm text-slate-600 leading-relaxed">
              {activeLayerObj.summary}
            </p>
            <ul className="space-y-2.5 pt-2 border-t border-slate-100">
              {activeLayerObj.details.map((d) => (
                <li
                  key={d}
                  className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-700"
                >
                  <span className="mt-1 w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl bg-slate-900 text-slate-100 p-5 sm:p-6 space-y-3">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
              <Lock className="w-4 h-4" />
              <span>إعدادات التشفير واجتياز الشبكة النشطة</span>
            </div>
            <div className="space-y-2 text-xs font-mono" dir="ltr">
              <div className="flex justify-between gap-2 py-1.5 border-b border-slate-800">
                <span className="text-slate-400">Auth:</span>
                <span className="text-emerald-300">
                  {stats?.iceConfig.authHandshake ?? "JWT HS256 + bcrypt"}
                </span>
              </div>
              <div className="flex justify-between gap-2 py-1.5 border-b border-slate-800">
                <span className="text-slate-400">STUN:</span>
                <span className="text-sky-300">stun:stun.l.google.com:19302</span>
              </div>
              <div className="flex justify-between gap-2 py-1.5 border-b border-slate-800">
                <span className="text-slate-400">TURN Fallback:</span>
                <span className="text-amber-300">Coturn TLS :5349 / UDP :3478</span>
              </div>
              <div className="flex justify-between gap-2 py-1.5">
                <span className="text-slate-400">Media Stream:</span>
                <span className="text-indigo-300">Direct P2P (DTLS-SRTP)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 8-Step Realistic Signaling Flow */}
      <div className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-emerald-600" />
          <h3 className="font-bold text-slate-900 text-base">
            التدفق الفعلي لبروتوكول الإشارات والمكالمات (8 مراحل متكاملة)
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {SIGNALING_STEPS.map((s) => (
            <div
              key={s.num}
              className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white font-mono text-xs font-bold">
                  {s.num}
                </span>
                <PhoneCall className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div className="font-bold text-sm text-slate-900">{s.title}</div>
              <p className="text-xs text-slate-600 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Mermaid Diagram + SQL + Docker + Nginx Blueprints */}
      <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: "mermaid", label: "Mermaid Diagram (مصحح وجاهز)" },
              { id: "sql", label: "PostgreSQL Schema" },
              { id: "docker", label: "docker-compose.yml" },
              { id: "nginx", label: "nginx.conf (TLS + WS)" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() =>
                  setActiveCodeTab(
                    tab.id as "mermaid" | "sql" | "docker" | "nginx"
                  )
                }
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeCodeTab === tab.id
                    ? "bg-slate-900 text-white"
                    : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => copySnippet(activeCodeTab, codeContent)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-bold transition cursor-pointer"
          >
            {copiedKey === activeCodeTab ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>تم النسخ!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>نسخ الكود</span>
              </>
            )}
          </button>
        </div>

        <div className="bg-[#0F172A] p-5 overflow-x-auto" dir="ltr">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400 mb-3">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span>
              {activeCodeTab === "mermaid"
                ? "architecture-oboud.mmd — Validated Mermaid Flowchart"
                : activeCodeTab === "sql"
                ? "schema.sql — PostgreSQL Tables & Indexes"
                : activeCodeTab === "docker"
                ? "docker-compose.yml — Postgres + Redis + Coturn + API + Nginx"
                : "nginx.conf — HTTPS TLS Termination & WebSocket Upgrade"}
            </span>
          </div>
          <pre className="text-xs sm:text-sm font-mono text-slate-100 leading-relaxed whitespace-pre">
            {codeContent}
          </pre>
        </div>
      </div>

      {/* Safe Friend Search & Privacy Product Specification Matrix */}
      <div className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 space-y-5">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-bold text-indigo-800">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
            <span>مواصفات المنتج وخطة النظام (البحث والاتصال الآمن)</span>
          </div>
          <h3 className="text-lg font-extrabold text-slate-900 pt-1">
            الخطة الهندسية المنفذة لنظام البحث عن الأصدقاء وحماية الخصوصية
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
            <div className="text-xs font-extrabold text-emerald-700">
              1. قصص المستخدم (User Stories)
            </div>
            <ul className="text-xs text-slate-700 space-y-1.5 leading-relaxed">
              <li>• كمستخدم، أبحث عن صديقي بالاسم أو @المعرف مع التسامح مع الأخطاء الإملائية في أقل من 50ms.</li>
              <li>• كعضو حريص على خصوصيته، أتحكم بمن يرى هاتفي وبريدي أو أخفي حسابي بالكامل.</li>
              <li>• عند التعرض لإزعاج، أحظر الحساب وأبلّغ عنه ليصل تنبيه فوري للإدارة عند التكرار.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
            <div className="text-xs font-extrabold text-indigo-700">
              2. واجهات الـ API المنفذة
            </div>
            <ul className="text-xs font-mono text-slate-700 space-y-1" dir="ltr">
              <li>GET /api/users/search?q=&amp;friendsOnly=1</li>
              <li>GET / POST /api/users/[username]</li>
              <li>GET / POST / PATCH /api/friends</li>
              <li>PATCH /api/profile (Privacy Matrix)</li>
              <li>GET / PATCH /api/notifications</li>
              <li>GET / POST /api/reports + Audit Logs</li>
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
            <div className="text-xs font-extrabold text-amber-700">
              3. الأمان، الاختبار، والنشر
            </div>
            <ul className="text-xs text-slate-700 space-y-1.5 leading-relaxed">
              <li>• إخفاء الهاتف والبريد على الخادم قبل إرسال الاستجابة (Zero Data Leakage).</li>
              <li>• حماية Rate Limiting + استعلامات Drizzle المعلمة ضد SQL Injection + JWT HS256.</li>
              <li>• تسجيل العمليات الحساسة في جدول audit_logs وفهرسة الحقول لاستجابة أقل من 300ms.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Footer note */}
      <div className="flex items-center justify-center gap-2 text-xs text-slate-500 pb-4">
        <Globe className="w-3.5 h-3.5 text-emerald-600" />
        <span>
          منصة &quot;اتصل مع عبود&quot; — جميع حزم الصوت والفيديو تنتقل نظير-لنظير (WebRTC P2P) بتشفير قياسي.
        </span>
      </div>
    </div>
  );
}
