import { neon } from "@neondatabase/serverless";
import { createClient } from "@supabase/supabase-js";
import nacl from "tweetnacl";
import bs58 from "bs58";

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
  // base58 signatures typically 64 bytes; string length varies, but this range is safe
  if (t.length < 64 || t.length > 128) return false;
  try {
    const b = bs58.decode(t);
    return b.length === 64;
  } catch {
    return false;
  }
}

export async function readJson(req, { maxBytes = 40_000 } = {}) {
  // If platform already parsed:
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
  if (typeof message !== "string" || message.length < 5 || message.length > 200) {
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

export function makeCardId() {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 10);
  return `CC_${t}_${r}`.toUpperCase();
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
