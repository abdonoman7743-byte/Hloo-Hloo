import { db } from "@/db";
import { signalingEvents, users } from "@/db/schema";
import { authenticateRequest } from "@/lib/auth";
import { and, asc, eq, inArray } from "drizzle-orm";
import { onUserSignal } from "@/lib/signal-bus";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // EventSource cannot set Authorization headers in browsers; authenticate via secure same-site cookie only.
  const auth = await authenticateRequest(new Request(req.url, { headers: { cookie: req.headers.get("cookie") || "" } }));
  if (!auth) {
    return new Response(
      JSON.stringify({ error: "Unauthorized JWT handshake" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (eventName: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`
            )
          );
        } catch {
          closed = true;
        }
      };

      // Refresh lastSeenAt without overwriting user-chosen 'unavailable'/'offline' or active 'in_call'
      try {
        const [me] = await db
          .select({ presenceStatus: users.presenceStatus })
          .from(users)
          .where(eq(users.id, auth.sub))
          .limit(1);

        const keepManual =
          me?.presenceStatus === "unavailable" ||
          me?.presenceStatus === "busy" ||
          me?.presenceStatus === "in_call" ||
          me?.presenceStatus === "offline";

        await db
          .update(users)
          .set({
            ...(keepManual ? {} : { presenceStatus: "online" }),
            lastSeenAt: new Date(),
          })
          .where(eq(users.id, auth.sub));
      } catch {
        // ignore non-fatal update
      }

      // Fast reconnect if the stream is cut (browser default is ~3s).
      try {
        controller.enqueue(encoder.encode("retry: 300\n\n"));
      } catch {
        closed = true;
      }

      let wake: (() => void) | null = null;
      const offBus = onUserSignal(auth.sub, () => wake?.());
      let lastBeat = Date.now();

      sendEvent("connected", {
        userId: auth.sub,
        username: auth.username,
        handshake: "JWT HS256 Verified",
        stunServers: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
        ],
        turnFallbackConfigured: true,
        connectedAt: new Date().toISOString(),
      });

      const startedAt = Date.now();
      const maxDurationMs = 55000;

      const onAbort = () => {
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      req.signal.addEventListener("abort", onAbort);

      while (!closed && Date.now() - startedAt < maxDurationMs) {
        try {
          const pending = await db
            .select()
            .from(signalingEvents)
            .where(
              and(
                eq(signalingEvents.toUserId, auth.sub),
                eq(signalingEvents.delivered, false)
              )
            )
            .orderBy(asc(signalingEvents.createdAt))
            .limit(30);

          if (pending.length > 0) {
            await db
              .update(signalingEvents)
              .set({ delivered: true })
              .where(
                inArray(
                  signalingEvents.id,
                  pending.map((e) => e.id)
                )
              );

            for (const ev of pending) {
              sendEvent("signal", ev);
            }
          }
        } catch {
          // ignore transient poll error
        }

        if (Date.now() - lastBeat > 15000 && !closed) {
          lastBeat = Date.now();
          try {
            controller.enqueue(encoder.encode(": ping\n\n"));
          } catch {
            closed = true;
          }
        }

        // Sleep until a new signal is published or the fallback tick fires.
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, 700);
          wake = () => {
            clearTimeout(t);
            resolve();
          };
        });
        wake = null;
      }
      offBus();

      req.signal.removeEventListener("abort", onAbort);
      if (!closed) {
        closed = true;
        try {
          controller.close();
        } catch {
          // ignore
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
