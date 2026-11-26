import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { authenticateRequest } from "@/lib/auth";
import { broadcastGlobalRealtimeEvent } from "@/lib/privacy-search";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if (auth) {
      const now = new Date();
      await db
        .update(users)
        .set({ presenceStatus: "offline", lastSeenAt: now })
        .where(eq(users.id, auth.sub));

      await broadcastGlobalRealtimeEvent({
        fromUserId: auth.sub,
        eventType: "presence-changed",
        payload: {
          userId: auth.sub,
          presenceStatus: "offline",
          lastSeenAt: now.toISOString(),
        },
      });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set("oboud_jwt", "", { path: "/", maxAge: 0 });
    return res;
  } catch {
    return NextResponse.json({ ok: true });
  }
}
