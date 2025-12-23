export const config = {
  runtime: "nodejs"
};

function j(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

export default async function handler(req, res) {
  // CORS for testing
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method !== "POST") return j(res, 405, { error: "Method not allowed" });

    // Load deps safely (won't crash at module load time)
    const naclMod = await import("tweetnacl");
    const bs58Mod = await import("bs58");
    const nacl = naclMod.default ?? naclMod;
    const bs58 = bs58Mod.default ?? bs58Mod;

    const openaiKey = process.env.OPENAI_API_KEY;
    const rpcUrl = process.env.SOLANA_RPC_URL;
    const mint = process.env.COMCOIN_MINT;
    const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
    const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!openaiKey) return j(res, 500, { stage: "env", error: "Missing OPENAI_API_KEY" });
    if (!rpcUrl) return j(res, 500, { stage: "env", error: "Missing SOLANA_RPC_URL" });
    if (!mint) return j(res, 500, { stage: "env", error: "Missing COMCOIN_MINT" });
    if (!upstashUrl || !upstashToken) return j(res, 500, { stage: "env", error: "Missing UPSTASH env vars" });

    const body = typeof req.body === "string" ? safeJson(req.body) : req.body;
    const { pubkey, message, signature } = body || {};
    if (!pubkey || !message || !signature) {
      return j(res, 400, { stage: "input", error: "Missing pubkey/message/signature" });
    }

    // Verify signature
    const sigBytes = bs58.decode(signature);
    const pubBytes = bs58.decode(pubkey);
    const msgBytes = new TextEncoder().encode(message);

    const ok = nacl.sign.detached.verify(msgBytes, sigBytes, pubBytes);
    if (!ok) return j(res, 401, { stage: "sig", error: "Signature verification failed" });

    

    // Token gate (comment out for testing)
    // const uiAmount = await getUiTokenBalance({ rpcUrl, mint, owner: pubkey });
    // if (!(uiAmount > 0)) return j(res, 403, { stage: "gate", error: "Not eligible: hold $COMCOIN" });

    const types = ["animal", "tech billionaire", "celebrity", "politician"];
    const pick = types[Math.floor(Math.random() * types.length)];

    const prompt = `
Create a single square image in crisp 16-bit pixel art (retro SNES / Game Boy Color style).

Subject:
- TYPE: ${pick}
- Choose a single well-known representative that fits this type and depict them as a stylized pixel-art character or creature.
- The depiction must be recognizable but NOT photorealistic.

Style rules:
- Limited color palette (12–20 colors)
- Sharp pixel edges, subtle dithering
- High contrast, clean silhouette
- Simple, uncluttered background

Text rules (VERY IMPORTANT):
- Overlay pixelated retro video-game text at the very bottom of the image that reads EXACTLY:
  "COM COIN"
- Text must be all caps, blocky pixel font, clearly readable.
- The text should slightly overlap the background but NOT cover the subject’s face.
- No other text anywhere in the image.
- No logos, no watermarks.
`.trim();

    const oaiResp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        size: "1024x1024",
        output_format: "png"
      })
    });

    const raw = await oaiResp.text();
    const out = safeJson(raw);

    if (!oaiResp.ok) return j(res, 502, { stage: "openai", error: raw.slice(0, 900) });

    const b64 = out?.data?.[0]?.b64_json;
    if (!b64) return j(res, 502, { stage: "openai", error: "No b64_json returned", raw: raw.slice(0, 500) });

    return j(res, 200, { image_b64: b64, mime: "image/png", type: pick });

  } catch (err) {
    return j(res, 500, {
      stage: "catch",
      error: err?.message || String(err),
      stack: (err?.stack || "").slice(0, 1200)
    });
  }
}

async function upstashGet(url, token, key) {
  const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const t = await r.text();
  const j = safeJson(t);
  if (!r.ok) throw new Error(`Upstash GET HTTP ${r.status}: ${t.slice(0, 200)}`);
  return j?.result ?? null;
}

async function upstashSet(url, token, key, value, ttlSeconds) {
  const r = await fetch(`${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}?EX=${ttlSeconds}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`Upstash SET HTTP ${r.status}: ${t.slice(0, 200)}`);
}
