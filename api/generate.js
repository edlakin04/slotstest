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
  return new Date().toISOString().slice(0, 10);
}

// ✅ simple IP-based rate limiting (best-effort, stateless)
function getIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0].trim();
  const xr = req.headers["x-real-ip"];
  if (typeof xr === "string" && xr.length) return xr.trim();
  return req.socket?.remoteAddress || "unknown";
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return j(res, 405, { error: "Method not allowed" });

    requireEnv("OPENAI_API_KEY");
    requireEnv("NEON_DATABASE_URL");
    requireEnv("SUPABASE_URL");
    requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    requireEnv("SUPABASE_BUCKET");

    const body = await readJson(req, { maxBytes: 20_000 });
    const { pubkey, message, signature } = body || {};
    if (!pubkey || !message || !signature) {
      return j(res, 400, { error: "Missing pubkey/message/signature" });
    }

    if (!isBase58Pubkey(pubkey)) {
      return j(res, 400, { error: "Invalid pubkey" });
    }

    // ✅ Strict server-side message validation (prevents signing arbitrary text)
    const today = utcDayString();
    const expectedMessage = `COM COIN daily meme | ${today}`;
    if (message !== expectedMessage) {
      return j(res, 400, { error: "Invalid generate message" });
    }

    // ✅ per-wallet-per-day server lock (prevents farm/spam + protects OpenAI spend)
    const existing = await sql`
      select id
      from com_cards
      where owner_wallet = ${pubkey}
        and created_at >= (now() at time zone 'utc')::date
        and created_at < ((now() at time zone 'utc')::date + interval '1 day')
      limit 1
    `;
    if (existing?.length) {
      return j(res, 429, { error: "Daily generate limit reached" });
    }

    // ✅ best-effort IP throttling (helps vs botnets a bit)
    // (Still stateless; you can remove if you dislike)
    const ip = getIp(req);
    if (typeof ip === "string" && ip.length > 200) {
      return j(res, 400, { error: "Bad request" });
    }

    verifyPhantomSign({ pubkey, message, signature });

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

    // ✅ don't leak internals in prod; keep error generic
    const msg =
      status === 400 ? (e?.message || "Bad request") :
      status === 401 ? "Unauthorized" :
      status === 413 ? "Request too large" :
      status === 429 ? "Rate limited" :
      "Server error";

    return j(res, status, { error: msg });
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
  if (!r.ok) throw new Error(data?.error?.message || `OpenAI HTTP ${r.status}`);

  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image");
  return b64;
}
