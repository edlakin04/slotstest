// api/generate.js
const nacl = require("tweetnacl");
const bs58 = require("bs58");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const openaiKey = process.env.OPENAI_API_KEY;
    const rpcUrl = process.env.SOLANA_RPC_URL;
    const mint = process.env.COMCOIN_MINT;
    const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
    const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!openaiKey) return json(res, 500, { error: "Missing OPENAI_API_KEY env var" });
    if (!rpcUrl) return json(res, 500, { error: "Missing SOLANA_RPC_URL env var" });
    if (!mint) return json(res, 500, { error: "Missing COMCOIN_MINT env var" });
    if (!upstashUrl || !upstashToken) return json(res, 500, { error: "Missing Upstash env vars" });

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { pubkey, message, signature } = body || {};
    if (!pubkey || !message || !signature) {
      return json(res, 400, { error: "Missing pubkey/message/signature" });
    }

    // 1) Verify Phantom signature (ed25519)
    if (!verifySolanaSignature({ pubkey, message, signature })) {
      return json(res, 401, { error: "Signature verification failed" });
    }

    // 2) Daily limit: 1/day per wallet (UTC)
    const today = new Date().toISOString().slice(0, 10);
    const limiterKey = `gen:${pubkey}:${today}`;

    const already = await upstashGet(upstashUrl, upstashToken, limiterKey);
    if (already) return json(res, 429, { error: "Daily limit reached: 1 generation per day" });

    await upstashSet(upstashUrl, upstashToken, limiterKey, "1", 26 * 60 * 60);

    // 3) Token gate (comment out for testing)

    }

    // 4) Random type
    const types = ["animal", "tech billionaire", "celebrity", "politician"];
    const pick = types[Math.floor(Math.random() * types.length)];

    // 5) Prompt
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

Overall vibe:
- Looks like a collectible retro game character card.
- Consistent layout, arcade-style presentation.
`.trim();

    // 6) OpenAI Images
    const oaiResp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        size: "1024x1024",
        output_format: "png"
      })
    });

    const rawText = await oaiResp.text();
    let out = null;
    try { out = JSON.parse(rawText); } catch {}

    if (!oaiResp.ok) {
      return json(res, 502, { error: `OpenAI error: ${rawText.slice(0, 900)}` });
    }

    const b64 = out?.data?.[0]?.b64_json;
    if (!b64) {
      return json(res, 502, { error: `OpenAI returned no b64_json. Raw: ${rawText.slice(0, 900)}` });
    }

    return json(res, 200, { image_b64: b64, mime: "image/png", type: pick });
  } catch (err) {
    return json(res, 500, {
      error: `Server error: ${err?.message || String(err)}`,
      stack: (err?.stack || "").slice(0, 1200)
    });
  }
};

function json(res, status, obj) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

function verifySolanaSignature({ pubkey, message, signature }) {
  // Phantom returns signature bytes for the message bytes.
  const sigBytes = bs58.decode(signature);
  const pubBytes = bs58.decode(pubkey);
  const msgBytes = new TextEncoder().encode(message);

  return nacl.sign.detached.verify(msgBytes, sigBytes, pubBytes);
}

async function upstashGet(url, token, key) {
  const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const j = await r.json().catch(() => null);
  return j?.result ?? null;
}

async function upstashSet(url, token, key, value, ttlSeconds) {
  const r = await fetch(
    `${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}?EX=${ttlSeconds}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Upstash SET failed: ${JSON.stringify(j)}`);
}

async function getUiTokenBalance({ rpcUrl, mint, owner }) {
  const payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "getTokenAccountsByOwner",
    params: [
      owner,
      { mint },
      { encoding: "jsonParsed" }
    ]
  };

  const r = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`RPC error HTTP ${r.status}`);
  if (j?.error) throw new Error(`RPC error: ${JSON.stringify(j.error)}`);

  const accounts = j?.result?.value || [];
  let total = 0;
  for (const acc of accounts) {
    const uiAmount = acc?.account?.data?.parsed?.info?.tokenAmount?.uiAmount;
    if (typeof uiAmount === "number") total += uiAmount;
  }
  return total;
}
