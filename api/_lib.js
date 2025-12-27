import { neon } from "@neondatabase/serverless";
import { createClient } from "@supabase/supabase-js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import crypto from "crypto";

export const sql = neon(process.env.NEON_DATABASE_URL || "");

export const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  { auth: { persistSession: false } }
);

export function j(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

export function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

// ✅ small helpers for validation
export function isBase58Pubkey(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  if (t.length < 32 || t.length > 64) return false;
  try {
    const b = bs58.decode(t);
    return b.length === 32;
  } catch {
    return false;
  }
}

export function isBase58Signature(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  if (t.length < 64 || t.length > 128) return false;
  try {
    const b = bs58.decode(t);
    return b.length === 64;
  } catch {
    return false;
  }
}

export async function readJson(req, { maxBytes = 40_000 } = {}) {
  if (req.body && typeof req.body === "object") return req.body;

  const chunks = [];
  let total = 0;

  for await (const c of req) {
    const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
    total += buf.length;
    if (total > maxBytes) {
      const err = new Error("Request body too large");
      err.statusCode = 413;
      throw err;
    }
    chunks.push(buf);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    const err = new Error("Invalid JSON");
    err.statusCode = 400;
    throw err;
  }
}

export function verifyPhantomSign({ pubkey, message, signature }) {
  if (!isBase58Pubkey(pubkey)) {
    const err = new Error("Invalid pubkey");
    err.statusCode = 400;
    throw err;
  }
  if (!isBase58Signature(signature)) {
    const err = new Error("Invalid signature");
    err.statusCode = 400;
    throw err;
  }
  if (typeof message !== "string" || message.length < 5 || message.length > 400) {
    const err = new Error("Invalid message");
    err.statusCode = 400;
    throw err;
  }

  const sig = bs58.decode(signature);
  const pk = bs58.decode(pubkey);
  const msg = new TextEncoder().encode(message);

  const ok = nacl.sign.detached.verify(msg, sig, pk);
  if (!ok) {
    const err = new Error("Invalid signature");
    err.statusCode = 401;
    throw err;
  }
}

// ✅ crypto-strong card ID (matches your DB check: ^CC_[A-Z0-9_]+$)
export function makeCardId() {
  // 16 bytes -> 32 hex chars. Only [0-9A-F], safe.
  const hex = crypto.randomBytes(16).toString("hex").toUpperCase();
  return `CC_${hex}`;
}

const ADJ = ["SWEATY","DIAMOND","FERAL","COSMIC","GIGA","BASED","RUGPROOF","JUICED","PIXEL","NEON","CHAOTIC","HYPER"];
const NOUN = ["SHILLER","HODLER","WIZARD","DEGEN","CHAD","GOBLIN","RAIDER","WHALE","FROG","APEMAN","COINLORD","MOGGER"];

export function randomMemeName() {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)];
  const n = NOUN[Math.floor(Math.random() * NOUN.length)];
  const s = Math.floor(Math.random() * 9999).toString().padStart(4, "0");
  return `${a} ${n} #${s}`;
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* =========================
   ✅ Upstash nonce helpers
   ========================= */

function upstashUrl(path) {
  const base = requireEnv("UPSTASH_REDIS_REST_URL");
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

async function upstashFetch(path) {
  const token = requireEnv("UPSTASH_REDIS_REST_TOKEN");
  const r = await fetch(upstashUrl(path), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    const err = new Error("Upstash error");
    err.statusCode = 500;
    throw err;
  }
  return data;
}

function nonceKey({ action, wallet, nonce }) {
  // short + deterministic; keep it simple
  return `nonce:${action}:${wallet}:${nonce}`;
}

export function nonceTtlSeconds() {
  const raw = process.env.NONCE_TTL_SECONDS;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 60 && n <= 3600) return Math.floor(n);
  return 300; // default 5 min
}

export function makeNonce() {
  // URL-safe base64-ish
  return crypto.randomBytes(18).toString("base64url");
}

export async function issueNonce({ action, wallet }) {
  if (typeof action !== "string" || !action) throw new Error("Bad action");
  if (!isBase58Pubkey(wallet)) {
    const err = new Error("Invalid pubkey");
    err.statusCode = 400;
    throw err;
  }

  const nonce = makeNonce();
  const key = nonceKey({ action, wallet, nonce });
  const ttl = nonceTtlSeconds();

  // SET key=1 EX ttl NX
  const data = await upstashFetch(`set/${encodeURIComponent(key)}/1?EX=${ttl}&NX=1`);
  // Upstash returns { result: "OK" } or { result: null }
  if (!data || data.result !== "OK") {
    const err = new Error("Nonce issue failed");
    err.statusCode = 500;
    throw err;
  }

  return { nonce, ttl };
}

export async function consumeNonce({ action, wallet, nonce }) {
  if (typeof action !== "string" || !action) {
    const err = new Error("Bad action");
    err.statusCode = 400;
    throw err;
  }
  if (!isBase58Pubkey(wallet)) {
    const err = new Error("Invalid pubkey");
    err.statusCode = 400;
    throw err;
  }
  if (typeof nonce !== "string" || nonce.length < 8 || nonce.length > 120) {
    const err = new Error("Invalid nonce");
    err.statusCode = 400;
    throw err;
  }

  const key = nonceKey({ action, wallet, nonce });

  // Consume by deleting; DEL returns integer count
  const data = await upstashFetch(`del/${encodeURIComponent(key)}`);
  const deleted = Number(data?.result ?? 0);

  if (deleted !== 1) {
    const err = new Error("Nonce expired or already used");
    err.statusCode = 401;
    throw err;
  }
}
