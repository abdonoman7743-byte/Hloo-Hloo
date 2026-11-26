import { db } from "@/db";
import { users, type User } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { verifyJwtToken } from "./auth";
import { recordAuditLog } from "./privacy-search";

export type Role = "OWNER" | "SUBSCRIBER";

function list(name: string): string[] {
  return (process.env[name] || "")
    .split(",")
    .map((s) => s.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

// No schema change: the owner is whoever OWNER_EMAILS / OWNER_USERNAMES
// (comma separated, server-side env) names. Unset means nobody is an owner.
export function roleForUser(u: Pick<User, "email" | "username">): Role {
  const emails = list("OWNER_EMAILS");
  const names = list("OWNER_USERNAMES");
  return emails.includes(u.email.toLowerCase()) ||
    names.includes(u.username.toLowerCase())
    ? "OWNER"
    : "SUBSCRIBER";
}

function tokenFromHeaders(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (h?.startsWith("Bearer ")) return h.slice(7).trim() || null;
  const m = (req.headers.get("cookie") || "").match(
    /(?:^|;\s*)oboud_jwt=([^;]+)/
  );
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

async function ownerFromToken(token: string | null) {
  if (!token) return { status: 401 as const, user: null };
  const jwt = await verifyJwtToken(token);
  if (!jwt) return { status: 401 as const, user: null };
  // Role is re-read from the database record on every request.
  const [u] = await db.select().from(users).where(eq(users.id, jwt.sub)).limit(1);
  if (!u) return { status: 401 as const, user: null };
  if (roleForUser(u) !== "OWNER") return { status: 403 as const, user: u };
  return { status: 200 as const, user: u };
}

/** For API routes. Returns the owner, or a null owner plus the status to send. */
export async function requireOwner(req: Request) {
  const r = await ownerFromToken(tokenFromHeaders(req));
  if (r.status !== 200) {
    await recordAuditLog({
      actorId: r.user?.id ?? null,
      action: "unauthorized_owner_access",
      metadata: { path: new URL(req.url).pathname, status: r.status },
      req,
    });
  }
  return r;
}

/** For server-rendered owner pages (cookie only). */
export async function getOwnerForPage() {
  const store = await cookies();
  return ownerFromToken(store.get("oboud_jwt")?.value ?? null);
}

export const SESSION_COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};
