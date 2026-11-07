import {
  LOGIN_SUBJECT,
  REGISTER_SUBJECT,
  loginBody,
  registerBody,
  sendInboxEmail,
} from "./email.ts";
import { hashPassword, newSessionToken, sha256Hex, verifyPassword } from "./password.ts";

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX_ATTEMPTS = 10;
const BODY_LIMIT = 4096;
const DUMMY_SALT = "00000000000000000000000000000000";
const DUMMY_HASH = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

const ALLOWED_ORIGINS = new Set([
  "https://xxnoelw.github.io",
  "https://substop.net",
]);

const MESSAGES: Record<string, string> = {
  invalid_json: "A kérés nem érvényes JSON.",
  invalid_email: "Érvénytelen e-mail-cím.",
  password_too_short: "A jelszó legalább 8 karakter legyen.",
  password_too_long: "A jelszó legfeljebb 200 karakter lehet.",
  email_taken: "Ez az e-mail-cím már regisztrálva van.",
  invalid_credentials: "Hibás e-mail vagy jelszó.",
  rate_limited: "Túl sok próbálkozás. Próbáld újra később.",
  unauthorized: "Bejelentkezés szükséges.",
  method_not_allowed: "Ez a metódus nem engedélyezett.",
  not_found: "Nincs ilyen végpont.",
  body_too_large: "A kérés túl nagy.",
  internal_error: "Váratlan hiba történt.",
};

class ApiError extends Error {
  status: number;
  code: string;
  headers: Headers;

  constructor(status: number, code: string, headers?: Headers) {
    super(code);
    this.status = status;
    this.code = code;
    this.headers = headers ?? new Headers();
  }
}

type Credentials = { email: string; password: string };

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (request.method === "OPTIONS") return empty(204, request);
      const response = await route(request, env, ctx, path);
      return response;
    } catch (error) {
      if (error instanceof ApiError) {
        return json({ error: error.code, message: MESSAGES[error.code] ?? MESSAGES.internal_error }, error.status, request, error.headers);
      }
      console.error(JSON.stringify({
        message: "unhandled error",
        path,
        error: error instanceof Error ? error.message : String(error),
      }));
      return json({ error: "internal_error", message: MESSAGES.internal_error }, 500, request);
    }
  },
} satisfies ExportedHandler<Env>;

async function route(request: Request, env: Env, ctx: ExecutionContext, path: string): Promise<Response> {
  if (path === "/api/register") {
    if (request.method !== "POST") throw new ApiError(405, "method_not_allowed");
    return register(request, env, ctx);
  }
  if (path === "/api/login") {
    if (request.method !== "POST") throw new ApiError(405, "method_not_allowed");
    return login(request, env, ctx);
  }
  if (path === "/api/logout") {
    if (request.method !== "POST") throw new ApiError(405, "method_not_allowed");
    return logout(request, env);
  }
  if (path === "/api/me") {
    if (request.method !== "GET") throw new ApiError(405, "method_not_allowed");
    return me(request, env);
  }
  throw new ApiError(404, "not_found");
}

async function register(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const credentials = await readCredentials(request);
  await consumeRateLimit(env, "register", request, credentials.email);
  const existing = await env.DB.prepare("SELECT id FROM users WHERE email_normalized = ?")
    .bind(credentials.email)
    .first<{ id: string }>();
  if (existing) throw new ApiError(409, "email_taken");

  const { hashHex, saltHex } = await hashPassword(credentials.password);
  const now = Date.now();
  const userId = crypto.randomUUID();
  const token = newSessionToken();
  const tokenHash = await sha256Hex(token);
  try {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO users (id, email, email_normalized, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(userId, credentials.email, credentials.email, hashHex, saltHex, now),
      env.DB.prepare(
        "INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
      ).bind(crypto.randomUUID(), userId, tokenHash, now + SESSION_MS, now),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) throw new ApiError(409, "email_taken");
    throw error;
  }

  ctx.waitUntil(deliverEmail(env, {
    kind: "registration",
    to: credentials.email,
    subject: REGISTER_SUBJECT,
    text: registerBody(),
  }));
  console.log(JSON.stringify({ message: "register ok" }));
  return json({ token, email: credentials.email }, 201, request);
}

async function login(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const credentials = await readCredentials(request);
  await consumeRateLimit(env, "login", request, credentials.email);
  const user = await env.DB.prepare(
    "SELECT id, email, password_hash, password_salt FROM users WHERE email_normalized = ?",
  ).bind(credentials.email).first<UserRow>();

  const passwordOk = await verifyPassword(
    credentials.password,
    user ? user.password_salt : DUMMY_SALT,
    user ? user.password_hash : DUMMY_HASH,
  );
  if (!user || !passwordOk) throw new ApiError(401, "invalid_credentials");

  const now = Date.now();
  const token = newSessionToken();
  const tokenHash = await sha256Hex(token);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?").bind(user.id, now),
    env.DB.prepare(
      "INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), user.id, tokenHash, now + SESSION_MS, now),
  ]);

  const userAgent = request.headers.get("User-Agent");
  ctx.waitUntil(deliverEmail(env, {
    kind: "login",
    to: user.email,
    subject: LOGIN_SUBJECT,
    text: loginBody(new Date(now), userAgent),
  }));
  console.log(JSON.stringify({ message: "login ok" }));
  return json({ token, email: user.email }, 200, request);
}

async function logout(request: Request, env: Env): Promise<Response> {
  const token = bearerToken(request);
  if (!token) throw new ApiError(401, "unauthorized");
  const tokenHash = await sha256Hex(token);
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
  return empty(204, request);
}

async function me(request: Request, env: Env): Promise<Response> {
  const token = bearerToken(request);
  if (!token) throw new ApiError(401, "unauthorized");
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT users.email AS email, sessions.expires_at AS expires_at
     FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ?`,
  ).bind(tokenHash).first<{ email: string; expires_at: number }>();
  const now = Date.now();
  if (!row || row.expires_at <= now) {
    if (row) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    throw new ApiError(401, "unauthorized");
  }
  return json({ email: row.email }, 200, request);
}

async function deliverEmail(
  env: Env,
  message: { to: string; subject: string; text: string; kind: "registration" | "login" },
): Promise<void> {
  try {
    await sendInboxEmail(env.AGENTMAIL_API_KEY, message);
  } catch (error) {
    console.error(JSON.stringify({
      message: "email send failed",
      kind: message.kind,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

async function readCredentials(request: Request): Promise<Credentials> {
  const body = await readJson(request);
  if (!body || typeof body !== "object") throw new ApiError(400, "invalid_json");
  const record = body as Record<string, unknown>;
  const email = normalizeEmail(record.email);
  if (!email) throw new ApiError(400, "invalid_email");
  if (typeof record.password !== "string") throw new ApiError(400, "password_too_short");
  if (record.password.length < 8) throw new ApiError(400, "password_too_short");
  if (record.password.length > 200) throw new ApiError(400, "password_too_long");
  return { email, password: record.password };
}

async function readJson(request: Request): Promise<unknown> {
  const raw = await request.text();
  if (raw.length > BODY_LIMIT) throw new ApiError(413, "body_too_large");
  if (!raw.trim()) throw new ApiError(400, "invalid_json");
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ApiError(400, "invalid_json");
  }
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < 6 || trimmed.length > 120) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  if (/[<>]/.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+([A-Za-z0-9_-]{20,200})$/.exec(header);
  return match ? match[1] : null;
}

function clientIp(request: Request): string {
  const cf = request.headers.get("CF-Connecting-IP");
  if (cf && cf.trim()) return cf.trim().slice(0, 80);
  return "local";
}

async function consumeRateLimit(env: Env, action: "login" | "register", request: Request, email: string): Promise<void> {
  const now = Date.now();
  const bucket = await sha256Hex(`${action}|${clientIp(request)}|${email}`);
  const windowStartLimit = now - RATE_WINDOW_MS;
  await env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(windowStartLimit).run();
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (bucket, attempts, window_start) VALUES (?1, 1, ?2)
     ON CONFLICT(bucket) DO UPDATE SET
       attempts = CASE WHEN rate_limits.window_start <= ?3 THEN 1 ELSE rate_limits.attempts + 1 END,
       window_start = CASE WHEN rate_limits.window_start <= ?3 THEN ?2 ELSE rate_limits.window_start END
     RETURNING attempts, window_start`,
  ).bind(bucket, now, windowStartLimit).first<{ attempts: number; window_start: number }>();
  if (!row) throw new ApiError(500, "internal_error");
  if (row.attempts > RATE_MAX_ATTEMPTS) {
    const retryAfter = Math.max(1, Math.ceil((row.window_start + RATE_WINDOW_MS - now) / 1000));
    const headers = new Headers({ "Retry-After": String(retryAfter) });
    console.log(JSON.stringify({ message: "rate limited", action }));
    throw new ApiError(429, "rate_limited", headers);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}

function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}

function corsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = allowedOrigin(request.headers.get("Origin"));
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

function json(body: unknown, status: number, request: Request, extra?: Headers): Response {
  const headers = corsHeaders(request);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  extra?.forEach((value, key) => headers.set(key, value));
  return new Response(JSON.stringify(body), { status, headers });
}

function empty(status: number, request: Request): Response {
  const headers = corsHeaders(request);
  headers.set("Cache-Control", "no-store");
  return new Response(null, { status, headers });
}
