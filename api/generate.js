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
  isBase58Pubkey,
  consumeNonce
} from "./_lib.js";

function utcDayString() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function getOrigin() {
  // hard bind signatures to YOUR site
  return requireEnv("SITE_ORIGIN");
}

function getIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0].trim();
  const xr = req.headers["x-real-ip"];
  if (typeof xr === "string" && xr.length) return xr.trim();
  return req.socket?.remoteAddress || "unknown";
}

async function enforceIpRateLimitOrThrow(ip, { limitPerMinute = 5, prefix = "gen:" } = {}) {
  if (typeof ip !== "string" || !ip.trim() || ip.length > 200) {
    const err = new Error("Bad request");
    err.statusCode = 400;
    throw err;
  }

  const scopedIp = `${prefix}${ip}`;

  const rows = await sql`
    insert into ip_rate_limits (ip, bucket_utc, hits)
    values (
      ${scopedIp},
      date_trunc('minute', (now() at time zone 'utc')),
      1
    )
    on conflict (ip, bucket_utc)
    do update set hits = ip_rate_limits.hits + 1
    returning hits
  `;

  const hits = Number(rows?.[0]?.hits ?? 0);
  if (hits > limitPerMinute) {
    const err = new Error("Rate limited");
    err.statusCode = 429;
    throw err;
  }
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
      params: [pubkey, { mint: MINT }, { encoding: "jsonParsed" }]
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
      Authorization: `Bearer ${apiKey}`,
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
  let pubkeyForRollback = null;

  try {
    if (req.method !== "POST") return j(res, 405, { error: "Method not allowed" });

    requireEnv("OPENAI_API_KEY");
    requireEnv("NEON_DATABASE_URL");
    requireEnv("SUPABASE_URL");
    requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    requireEnv("SUPABASE_BUCKET");
    requireEnv("HELIUS_RPC_URL");
    requireEnv("COMCOIN_MINT");
    requireEnv("UPSTASH_REDIS_REST_URL");
    requireEnv("UPSTASH_REDIS_REST_TOKEN");
    requireEnv("SITE_ORIGIN");

    const ip = getIp(req);
    await enforceIpRateLimitOrThrow(ip, { limitPerMinute: 5, prefix: "gen:" });

    const body = await readJson(req, { maxBytes: 20_000 });
    const { pubkey, message, signature, nonce } = body || {};

    if (!pubkey || !message || !signature || !nonce) {
      return j(res, 400, { error: "Missing pubkey/message/signature/nonce" });
    }
    if (!isBase58Pubkey(pubkey)) {
      return j(res, 400, { error: "Invalid pubkey" });
    }

    const today = utcDayString();
    const origin = getOrigin();

    // ✅ New strict message format with nonce + origin binding
    const expectedMessage = `COM COIN|generate|${origin}|${today}|${nonce}`;
    if (message !== expectedMessage) {
      return j(res, 400, { error: "Invalid generate message" });
    }

    // ✅ Verify signature
    verifyPhantomSign({ pubkey, message, signature });

    // ✅ Consume nonce (one-time use, prevents replay)
    await consumeNonce({ action: "generate", wallet: pubkey, nonce });

    // ✅ Holding check
    const bal = await getComcoinBalanceUiAmount(pubkey);
    if (bal < 1) {
      return j(res, 403, { error: "Hold $COMCOIN to generate" });
    }

    // ✅ DB daily lock
    pubkeyForRollback = pubkey;
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

    // ✅ Generate + store + insert
    try {
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
      // rollback daily lock
      try {
        await sql`
          delete from daily_generate_locks
          where owner_wallet = ${pubkey}
            and gen_day_utc = ((now() at time zone 'utc')::date)
        `;
      } catch {}
      throw e;
    }
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
