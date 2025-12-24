import { j, requireEnv, sql } from "./_lib.js";

export default async function handler(req, res) {
  try {
    requireEnv("NEON_DATABASE_URL");

    if (req.method !== "GET") return j(res, 405, { error: "Method not allowed" });

    const sort = String(req.query?.sort || "trending").toLowerCase();
    const limit = Math.min(Math.max(Number(req.query?.limit || 100), 1), 100);

    let orderBy = "created_at desc";
    if (sort === "top") orderBy = "(upvotes - downvotes) desc, upvotes desc, created_at desc";
    if (sort === "newest") orderBy = "created_at desc";
    if (sort === "trending") orderBy = "(upvotes - downvotes) desc, created_at desc";

    const rows = await sql.unsafe(`
      select id, owner_wallet, name, upvotes, downvotes, created_at
      from com_cards
      order by ${orderBy}
      limit ${limit}
    `);

    const items = (rows || []).map((r) => ({
      id: r.id,
      owner_wallet: r.owner_wallet,
      name: r.name,
      upvotes: Number(r.upvotes || 0),
      downvotes: Number(r.downvotes || 0),
      score: Number(r.upvotes || 0) - Number(r.downvotes || 0),
      created_at: r.created_at,
      imageUrl: `/api/image?id=${encodeURIComponent(r.id)}`,
    }));

    return j(res, 200, { ok: true, items });
  } catch (e) {
    return j(res, 500, { error: String(e?.message || e) });
  }
}
