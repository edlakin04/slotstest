import { j, requireEnv, sql } from "./_lib.js";

export default async function handler(req, res) {
  try {
    requireEnv("NEON_DATABASE_URL");

    if (req.method !== "GET") return j(res, 405, { error: "Method not allowed" });

    const wallet = String(req.query?.wallet || "").trim();
    const limit = Math.min(Math.max(Number(req.query?.limit || 100), 1), 100);

    if (!wallet) return j(res, 400, { error: "Missing wallet" });

    const rows = await sql`
      select id, owner_wallet, name, upvotes, downvotes, created_at
      from com_cards
      where owner_wallet = ${wallet}
      order by created_at desc
      limit ${limit}
    `;

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
