import { j, sql, requireEnv } from "./_lib.js";

export default async function handler(req, res) {
  try {
    requireEnv("NEON_DATABASE_URL");

    const url = new URL(req.url, `http://${req.headers.host}`);
    const wallet = url.searchParams.get("wallet");
    if (!wallet) return j(res, 400, { error: "Missing wallet" });

    const limit = Math.min(Number(url.searchParams.get("limit") || 100), 100);

    const rows = await sql`
      select id, owner_wallet, name, image_url, created_at, upvotes, downvotes,
             (upvotes - downvotes) as score
      from com_cards
      where owner_wallet = ${wallet}
      order by created_at desc
      limit ${limit}
    `;

    return j(res, 200, { ok: true, wallet, items: rows });
  } catch (e) {
    return j(res, 500, { error: String(e?.message || e) });
  }
}
