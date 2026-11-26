import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";

// A hard-coded fallback would let anyone forge login tokens, so production
// requires JWT_SECRET. The fallback exists only for local development.
const rawSecret =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV === "production" &&
  process.env.NEXT_PHASE !== "phase-production-build"
    ? ""
    : "dev-only-insecure-jwt-secret-do-not-use-in-production");
if (!rawSecret) {
  throw new Error("JWT_SECRET is required in production");
}
const secretKey = new TextEncoder().encode(rawSecret);

export interface JwtPayloadData {
  sub: string;
  username: string;
  email: string;
  displayName: string;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function signJwtToken(payload: JwtPayloadData): Promise<string> {
  return new SignJWT({
    username: payload.username,
    email: payload.email,
    displayName: payload.displayName,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey);
}

export async function verifyJwtToken(
  token: string
): Promise<JwtPayloadData | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ["HS256"],
    });
    if (!payload.sub || typeof payload.username !== "string") {
      return null;
    }
    return {
      sub: payload.sub,
      username: payload.username,
      email: String(payload.email ?? ""),
      displayName: String(payload.displayName ?? payload.username),
    };
  } catch {
    return null;
  }
}

export function getTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }

  // Query-string JWTs are intentionally rejected to avoid leaking credentials via URLs/logs.

  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(/(?:^|;\s*)oboud_jwt=([^;]+)/);
  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  }

  return null;
}

export async function authenticateRequest(
  req: Request
): Promise<JwtPayloadData | null> {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  return verifyJwtToken(token);
}
