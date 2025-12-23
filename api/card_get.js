import { j, sql, requireEnv } from "./_lib.js";

export default async function handler(req, res) {
  try {
    requireEnv("NEON_DATABASE_URL");

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
    return j(res, 200, { ok: true, item: rows[0] });
  } catch (e) {
    return j(res, 500, { error: String(e?.message || e) });
  }
}
