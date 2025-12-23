const oai = await fetch("https://api.openai.com/v1/images/generations", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${openaiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-image-1",         // or "gpt-image-1.5"
    prompt,
    size: "1024x1024",
    output_format: "png",
    quality: "high"
  }),
});

if (!oai.ok) {
  const errText = await oai.text();
  return json(res, 502, { error: `OpenAI error: ${errText.slice(0, 700)}` });
}

const out = await oai.json();
const b64 = out?.data?.[0]?.b64_json;  // GPT Image returns base64 here
if (!b64) return json(res, 502, { error: "OpenAI did not return b64_json image data" });

return json(res, 200, { image_b64: b64, mime: "image/png", type: pick });
