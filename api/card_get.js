import { j, sql, requireEnv, supabase } from "./_lib.js";

export default async function handler(req, res) {
  try {
    requireEnv("NEON_DATABASE_URL");
    requireEnv("SUPABASE_BUCKET");
    requireEnv("SUPABASE_URL");
    requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const url = new URL(req.url, `http://${req.headers.host}`);
    const id = url.searchParams.get("id");
    if (!id) return j(res, 400, { error: "Missing id" });

    const rows = await sql`
      select id, owner_wallet, name, image_url, created_at, upvotes, downvotes,
             (upvotes - downvotes) as score
      from com_cards
      where id = ${id}
      limit 1
    `;

    if (!rows?.length) return j(res, 404, { error: "Not found" });

    const bucket = process.env.SUPABASE_BUCKET;
    const path = rows[0].image_url;

    const { data: signed, error: signErr } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60);

    const item = { ...rows[0], imageUrl: signErr ? null : signed.signedUrl };

    return j(res, 200, { ok: true, item });
  } catch (e) {
    return j(res, 500, { error: String(e?.message || e) });
  }
}
