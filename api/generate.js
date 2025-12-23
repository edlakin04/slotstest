import { j, readJson, requireEnv, verifyPhantomSign, makeCardId, randomMemeName, pick, sql, supabase } from "./_lib.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return j(res, 405, { error: "Method not allowed" });

    requireEnv("OPENAI_API_KEY");
    requireEnv("NEON_DATABASE_URL");
    requireEnv("SUPABASE_URL");
    requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    requireEnv("SUPABASE_BUCKET");

    const body = await readJson(req);
    const { pubkey, message, signature } = body || {};
    if (!pubkey || !message || !signature) return j(res, 400, { error: "Missing pubkey/message/signature" });

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
    const filename = `${pubkey}/${cardId}.png`;

    const bytes = Buffer.from(pngB64, "base64");
    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(filename, bytes, { contentType: "image/png", upsert: true });

    if (upErr) throw new Error(`Supabase upload failed: ${upErr.message}`);

    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(filename);
    const imageUrl = pub?.publicUrl;
    if (!imageUrl) throw new Error("Failed to get public URL");

    const name = randomMemeName();

    await sql`
      insert into com_cards (id, owner_wallet, name, image_url)
      values (${cardId}, ${pubkey}, ${name}, ${imageUrl})
    `;

    return j(res, 200, { ok: true, cardId, name, imageUrl });
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
      size: "1024x1024",
    
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
