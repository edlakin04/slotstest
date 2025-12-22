// Vercel Serverless Function: POST /api/generate
// Verifies Phantom signature, enforces 1/day via Upstash, checks holder balance,
// randomly chooses type, then calls OpenAI Images API.

const nacl = require("tweetnacl");
const bs58 = require("bs58");
const { Redis } = require("@upstash/redis");

function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

async function getUiBalance(rpc, mint, pubkey) {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "getTokenAccountsByOwner",
    params: [pubkey, { mint }, { encoding: "jsonParsed" }],
  };

  const r = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  const accounts = j?.result?.value || [];

  let uiAmount = 0;
  for (const acc of accounts) {
    const info = acc?.account?.data?.parsed?.info;
    const tokenAmount = info?.tokenAmount;
    const amt = Number(tokenAmount?.uiAmount || tokenAmount?.uiAmountString || 0);
    uiAmount += isFinite(amt) ? amt : 0;
  }
  return uiAmount;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const { pubkey, message, signature } = req.body || {};
    if (!pubkey || !message || !signature) return json(res, 400, { error: "Missing pubkey/message/signature" });

    const rpc = process.env.SOLANA_RPC_URL;
    const mint = process.env.COMCOIN_MINT;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!rpc || !mint || !openaiKey) return json(res, 500, { error: "Server not configured (missing env vars)" });

    // 1) Verify Phantom signature (Ed25519)
    const msgBytes = new TextEncoder().encode(message);
    const sigBytes = bs58.decode(signature);
    const pubBytes = bs58.decode(pubkey);
    const ok = nacl.sign.detached.verify(msgBytes, sigBytes, pubBytes);
    if (!ok) return json(res, 401, { error: "Signature verification failed" });

    // 2) Enforce holder gate server-side too
    const bal = await getUiBalance(rpc, mint, pubkey);
    if (!(bal > 0)) return json(res, 403, { error: "Not eligible: you do not hold Com Coin" });

    // 3) Upstash 1/day limit
    const redis = Redis.fromEnv();
    const key = `comcoin:gen:${pubkey}:${todayUTC()}`;

    const already = await redis.get(key);
    if (already) return json(res, 429, { error: "Daily limit reached. Come back tomorrow." });

    // set with TTL ~ 25h (covers timezone drift)
    await redis.set(key, 1, { ex: 60 * 60 * 25 });

    // 4) Random type
    const TYPES = ["animal", "tech billionaire", "celebrity", "politician"];
    const pick = TYPES[Math.floor(Math.random() * TYPES.length)];

    // 5) Your final prompt (as requested)
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

    // 6) Call OpenAI Image API (base64)
    // Official endpoints include /v1/images/generations. :contentReference[oaicite:0]{index=0}
    const oai = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-1.5",
        prompt,
        size: "1024x1024",
        quality: "high"
      }),
    });

    if (!oai.ok) {
      const errText = await oai.text();
      return json(res, 502, { error: `OpenAI error: ${errText.slice(0, 500)}` });
    }

    const out = await oai.json();
    const b64 = out?.data?.[0]?.b64_json;
    if (!b64) return json(res, 502, { error: "OpenAI did not return image data" });

    return json(res, 200, { image_b64: b64, mime: "image/png", type: pick });
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
};
