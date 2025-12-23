import crypto from "crypto";
import {
  j,
  readJson,
  requireEnv,
  verifyPhantomSign,
  makeCardId,
  randomMemeName,
  pick,
  sql,
  supabase
} from "./_lib.js";

const GEN_MSG_PREFIX = "COM COIN daily meme | "; // must match frontend
const DEFAULT_SIGNED_TTL = 60 * 60; // 1h

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return j(res, 405, { error: "Method not allowed" });

    requireEnv("OPENAI_API_KEY");
    requireEnv("NEON_DATABASE_URL");
    requireEnv("SUPABASE_URL");
    requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    requireEnv("SUPABASE_BUCKET");
    requireEnv("UPSTASH_REDIS_REST_URL");
    requireEnv("UPSTASH_REDIS_REST_TOKEN");

    const body = await readJson(req);
    const { pubkey, message, signature } = body || {};
    if (!pubkey || !message || !signature) return j(res, 400, { error: "Missing pubkey/message/signature" });

    // 1) Strict message validation (prevents “sign anything”)
    const today = new Date().toISOString().slice(0, 10);
    const expectedMsg = `${GEN_MSG_PREFIX}${today}`;
    if (message !== expectedMsg) {
      return j(res, 400, { error: "Invalid message format" });
    }

    // 2) Verify signature
    verifyPhantomSign({ pubkey, message, signature });

    const ip = getClientIp(req);

    // 3) Rate limits (can be disabled for testing)
    if (process.env.DISABLE_RATE_LIMIT !== "1") {
      // per IP: 10 generate attempts / 10 minutes
      await rateLimitOrThrow(`rl:gen:ip:${ip}`, 10, 600);
      // per wallet: 5 generate attempts / 10 minutes
      await rateLimitOrThrow(`rl:gen:wallet:${pubkey}`, 5, 600);
    }

    // 4) Daily limit (server-side)
    if (process.env.DISABLE_DAILY_LIMIT !== "1") {
      const dayKey = `gen:day:${pubkey}:${today}`;
      const ok = await setIfNotExists(dayKey, "1", 2 * 24 * 60 * 60); // keep 2 days
      if (!ok) return j(res, 429, { error: "Daily generation limit reached" });
    }

    // 5) Replay protection (signature reused)
    {
      const sigHash = sha256Hex(`${pubkey}|${message}|${signature}`);
      const replayKey = `gen:replay:${sigHash}`;
      const ok = await setIfNotExists(replayKey, "1", 2 * 24 * 60 * 60);
      if (!ok) return j(res, 429, { error: "Replay blocked" });
    }

    const category = pick(["animal", "tech billionaire", "celebrity", "politician"]);
    const prompt = [
      "Create a pixel art meme image, 1:1 square, crisp pixelated style.",
      `Subject category: ${category}.`,
      "Make it funny and memecoin-coded. Keep it PG.",
      "IMPORTANT: overlay pixelated text 'COM COIN' at the bottom of the image, same position every time, centered, no dark strip, just text overlay.",
      "No watermarks, no extra text besides the 'COM COIN' stamp.",
      "High contrast, punchy, vibrant meme vibe."
    ].join(" ");

    const pngB64 = await generateOpenAiPngBase64(process.env.OPENAI_API_KEY, prompt);

    const bucket = process.env.SUPABASE_BUCKET;
    const cardId = makeCardId();
    const path = `${pubkey}/${cardId}.png`;

    const bytes = Buffer.from(pngB64, "base64");

    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(path, bytes, { contentType: "image/png", upsert: true });

    if (upErr) throw new Error(`Supabase upload failed: ${upErr.message}`);

    const ttl = Number(process.env.SIGNED_URL_TTL_SECONDS || DEFAULT_SIGNED_TTL);

    const { data: signed, error: signErr } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, ttl);

    if (signErr) throw new Error(`Signed URL failed: ${signErr.message}`);

    const signedUrl = signed?.signedUrl;
    if (!signedUrl) throw new Error("No signed URL returned");

    const name = randomMemeName();

    await sql`
      insert into com_cards (id, owner_wallet, name, image_url)
      values (${cardId}, ${pubkey}, ${name}, ${path})
    `;

    return j(res, 200, {
      ok: true,
      cardId,
      name,
      imageUrl: signedUrl,
      imagePath: path
    });
  } catch (e) {
    return j(res, 500, { error: String(e?.message || e) });
  }
}

async function generateOpenAiPngBase64(apiKey, prompt) {
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024"
    })
  });

  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  if (!r.ok) throw new Error(data?.error?.message || text || `OpenAI HTTP ${r.status}`);

  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image");
  return b64;
}

/* ---------------- Upstash helpers ---------------- */

function upstashHeaders() {
  return {
    Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
    "Content-Type": "application/json"
  };
}

async function upstashPipeline(cmds) {
  const url = `${process.env.UPSTASH_REDIS_REST_URL}/pipeline`;
  const r = await fetch(url, { method: "POST", headers: upstashHeaders(), body: JSON.stringify(cmds) });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  if (!r.ok) throw new Error(data?.error || text || "Upstash error");
  return data;
}

// SET key value NX EX ttlSeconds
async function setIfNotExists(key, value, ttlSeconds) {
  const out = await upstashPipeline([
    ["SET", key, value, "NX", "EX", String(ttlSeconds)]
  ]);
  // Upstash returns array of results; SET returns "OK" or null
  const res = out?.[0]?.result ?? null;
  return res === "OK";
}

async function rateLimitOrThrow(key, limit, windowSeconds) {
  const out = await upstashPipeline([
    ["INCR", key],
    ["EXPIRE", key, String(windowSeconds)]
  ]);
  const count = Number(out?.[0]?.result ?? 0);
  if (count > limit) throw new Error("Rate limit exceeded");
}

function sha256Hex(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

function getClientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0].trim();
  const xr = req.headers["x-real-ip"];
  if (typeof xr === "string" && xr.length) return xr.trim();
  return "unknown";
}
