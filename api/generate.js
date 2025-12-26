import {
  j,
  readJson,
  requireEnv,
  verifyPhantomSign,
  makeCardId,
  randomMemeName,
  pick,
  sql,
  supabase,
  isBase58Pubkey
} from "./_lib.js";

function utcDayString() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function getIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0].trim();
  const xr = req.headers["x-real-ip"];
  if (typeof xr === "string" && xr.length) return xr.trim();
  return req.socket?.remoteAddress || "unknown";
}

async function getComcoinBalanceUiAmount(pubkey) {
  const RPC = process.env.HELIUS_RPC_URL;
  const MINT = process.env.COMCOIN_MINT;
  if (!RPC || !MINT) throw new Error("Server misconfigured");

  const r = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "comcoin_balance",
      method: "getTokenAccountsByOwner",
      params: [
        pubkey,
        { mint: MINT },
        { encoding: "jsonParsed" }
      ]
    })
  });

  const data = await r.json().catch(() => null);
  if (!r.ok || data?.error) throw new Error("RPC error");

  const accounts = data?.result?.value || [];
  let uiAmount = 0;
  for (const acc of accounts) {
    const amt = acc?.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0;
    uiAmount += Number(amt || 0);
  }
  return uiAmount;
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
  if (!r.ok) throw new Error(data?.error?.message || `OpenAI HTTP ${r.status}`);

  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image");
  return b64;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return j(res, 405, { error: "Method not allowed" });

    requireEnv("OPENAI_API_KEY");
    requireEnv("NEON_DATABASE_URL");
    requireEnv("SUPABASE_URL");
    requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    requireEnv("SUPABASE_BUCKET");
    requireEnv("HELIUS_RPC_URL");
    requireEnv("COMCOIN_MINT");

    const body = await readJson(req, { maxBytes: 20_000 });
    const { pubkey, message, signature } = body || {};

    if (!pubkey || !message || !signature) {
      return j(res, 400, { error: "Missing pubkey/message/signature" });
    }
    if (!isBase58Pubkey(pubkey)) {
      return j(res, 400, { error: "Invalid pubkey" });
    }

    // ✅ Strict message validation
    const today = utcDayString();
    const expectedMessage = `COM COIN daily meme | ${today}`;
    if (message !== expectedMessage) {
      return j(res, 400, { error: "Invalid generate message" });
    }

    // ✅ Verify Phantom signature
    verifyPhantomSign({ pubkey, message, signature });

    // ✅ Server-side holding check (prevents bypassing frontend)
    const bal = await getComcoinBalanceUiAmount(pubkey);

    // Set your threshold here:
    // - if you truly want "any amount", use >= 0 (not recommended)
    // - typical is >= 1
    if (bal < 1) {
      return j(res, 403, { error: "Hold $COMCOIN to generate" });
    }

    // ✅ DB-backed daily lock BEFORE OpenAI (prevents spend races)
    // If a lock row already exists for this wallet+day, we return 429 immediately.
    try {
      await sql`
        insert into daily_generate_locks (owner_wallet, gen_day_utc)
        values (${pubkey}, ((now() at time zone 'utc')::date))
      `;
    } catch (e) {
      const code = e?.code;
      const msg = String(e?.message || e);
      if (code === "23505" || msg.toLowerCase().includes("duplicate")) {
        return j(res, 429, { error: "Daily generate limit reached" });
      }
      throw e;
    }

    // (Optional) best-effort ip sanity
    const ip = getIp(req);
    if (typeof ip === "string" && ip.length > 200) {
      return j(res, 400, { error: "Bad request" });
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

    if (upErr) throw new Error("Supabase upload failed");

    const name = randomMemeName();

    await sql`
      insert into com_cards (id, owner_wallet, name, image_url)
      values (${cardId}, ${pubkey}, ${name}, ${path})
    `;

    return j(res, 200, {
      ok: true,
      cardId,
      name,
      imageUrl: `/api/image?id=${encodeURIComponent(cardId)}`
    });
  } catch (e) {
    const status = Number(e?.statusCode || 500);

    const msg =
      status === 400 ? (e?.message || "Bad request") :
      status === 401 ? "Unauthorized" :
      status === 403 ? "Forbidden" :
      status === 413 ? "Request too large" :
      status === 429 ? "Rate limited" :
      "Server error";

    return j(res, status, { error: msg });
  }
}
