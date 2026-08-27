import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";

export type Role = "Admin" | "Tamu";
export type Session = { username: string; role: Role; expiresAt: number };

const COOKIE_NAME = "arsip_session";
const SESSION_TTL = 60 * 60 * 8;

function secret() {
  return process.env.AUTH_SECRET || "arsip-surat-development-secret";
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSession(username: string, role: Role) {
  const session: Session = { username, role, expiresAt: Date.now() + SESSION_TTL * 1000 };
  const payload = encode(JSON.stringify(session));
  return `${payload}.${sign(payload)}`;
}

export function readSession(value?: string): Session | null {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Session;
    return session.expiresAt > Date.now() && (session.role === "Admin" || session.role === "Tamu") ? session : null;
  } catch {
    return null;
  }
}

export function sessionCookie(value: string) {
  return { name: COOKIE_NAME, value, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: SESSION_TTL };
}

export const sessionCookieName = COOKIE_NAME;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, value] = storedHash.split(":");
  if (!salt || !value) return false;
  const expected = Buffer.from(value, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}