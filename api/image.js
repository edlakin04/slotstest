import { j, requireEnv, sql, supabase } from "./_lib.js";

export default async function handler(req, res) {
  try {
    requireEnv("NEON_DATABASE_URL");
    requireEnv("SUPABASE_URL");
    requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    requireEnv("SUPABASE_BUCKET");

    if (req.method !== "GET") return j(res, 405, { error: "Method not allowed" });

    const id = String(req.query?.id || "").trim();
    if (!id) return j(res, 400, { error: "Missing id" });

    // Look up stored path in DB (we store path like `${pubkey}/${cardId}.png`)
    const rows = await sql`
      select image_url
      from com_cards
      where id = ${id}
      limit 1
    `;
    const path = rows?.[0]?.image_url;
    if (!path) return j(res, 404, { error: "Not found" });

    // Basic path hardening (only allow typical storage paths)
    if (!/^[A-Za-z0-9/_\-\.]+$/.test(path) || path.includes("..")) {
      return j(res, 400, { error: "Bad path" });
    }

    const bucket = process.env.SUPABASE_BUCKET;

    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error) throw new Error(`Supabase download failed: ${error.message}`);
    if (!data) throw new Error("No data from storage");

    const ab = await data.arrayBuffer();
    const buf = Buffer.from(ab);

    // Cache hard at edge + browser (fast refresh)
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800");

    // Simple ETag so browser can revalidate cheaply
    res.setHeader("ETag", `"${id}-${buf.length}"`);

    res.statusCode = 200;
    return res.end(buf);
  } catch (e) {
    return j(res, 500, { error: String(e?.message || e) });
  }
}
