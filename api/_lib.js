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

export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export function verifyPhantomSign({ pubkey, message, signature }) {
  const sig = bs58.decode(signature);
  const pk = bs58.decode(pubkey);
  const msg = new TextEncoder().encode(message);
  const ok = nacl.sign.detached.verify(msg, sig, pk);
  if (!ok) throw new Error("Invalid signature");
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
