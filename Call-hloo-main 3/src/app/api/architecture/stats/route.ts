import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  auditLogs,
  calls,
  friends,
  messages,
  signalingEvents,
  users,
} from "@/db/schema";
import { ensureSeeded } from "@/lib/seed";
import { requireOwner } from "@/lib/roles";
import { count, desc, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const owner = await requireOwner(req);
  if (owner.status !== 200) {
    return NextResponse.json(
      { error: owner.status === 401 ? "غير مصرح" : "ممنوع" },
      { status: owner.status }
    );
  }
  try {
    await ensureSeeded();

    const [[uCount], [fCount], [mCount], [cCount], [sCount], [onlineCount]] =
      await Promise.all([
        db.select({ value: count() }).from(users),
        db.select({ value: count() }).from(friends),
        db.select({ value: count() }).from(messages),
        db.select({ value: count() }).from(calls),
        db.select({ value: count() }).from(signalingEvents),
        db
          .select({ value: count() })
          .from(users)
          .where(eq(users.presenceStatus, "online")),
      ]);

    // Owner only: recent calls (signaling payloads stripped) and audit logs.
    const recentCalls = (
      await db.select().from(calls).orderBy(desc(calls.createdAt)).limit(10)
    ).map(({ signalingJson: _s, ...rest }) => {
      void _s;
      return rest;
    });
    const [activeCalls] = await db
      .select({ value: count() })
      .from(calls)
      .where(sql`${calls.status} in ('ringing','answered')`);
    const recentLogs = await db
      .select({
        action: auditLogs.action,
        ipHint: auditLogs.ipHint,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(50);
    const [pg] = await db.execute(sql`select version() as v`).then((r) => r.rows);

    return NextResponse.json({
      metrics: {
        users: uCount?.value ?? 0,
        friends: fCount?.value ?? 0,
        messages: mCount?.value ?? 0,
        calls: cCount?.value ?? 0,
        signalingPackets: sCount?.value ?? 0,
        onlineUsers: onlineCount?.value ?? 0,
      },
      iceConfig: {
        stun: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
        ],
        turn: "turns:turn.oboud.app:5349?transport=tcp (Coturn TLS Fallback)",
        encryption: "DTLS-SRTP End-to-End Media",
        authHandshake: "JWT HS256 + bcryptjs (cost=10)",
      },
      recentCalls,
      webrtc: { activeCalls: activeCalls?.value ?? 0 },
      postgres: { version: (pg as { v?: string } | undefined)?.v ?? null },
      recentLogs,
      uptimeSec: Math.round(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1048576),
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("GET /api/architecture/stats error:", error);
    return NextResponse.json(
      { error: "تعذر قراءة مقاييس المعمارية" },
      { status: 500 }
    );
  }
}
