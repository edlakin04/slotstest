import { j, requireEnv, sql } from "./_lib.js";

export default async function handler(req, res) {
  try {
    requireEnv("NEON_DATABASE_URL");

    if (req.method !== "GET") return j(res, 405, { error: "Method not allowed" });

    const id = String(req.query?.id || "").trim();
    if (!id) return j(res, 400, { error: "Missing id" });

    const rows = await sql`
      select id, owner_wallet, name, upvotes, downvotes, created_at
      from com_cards
      where id = ${id}
      limit 1
    `;
    const r = rows?.[0];
    if (!r) return j(res, 404, { error: "Not found" });

    const item = {
      id: r.id,
      owner_wallet: r.owner_wallet,
      name: r.name,
      upvotes: Number(r.upvotes || 0),
      downvotes: Number(r.downvotes || 0),
      score: Number(r.upvotes || 0) - Number(r.downvotes || 0),
      created_at: r.created_at,
      imageUrl: `/api/image?id=${encodeURIComponent(r.id)}`,
    };

    return j(res, 200, { ok: true, item });
  } catch (e) {
    return j(res, 500, { error: String(e?.message || e) });
  }
}
