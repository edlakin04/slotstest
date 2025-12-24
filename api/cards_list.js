import { j, requireEnv, sql } from "./_lib.js";

export default async function handler(req, res) {
  try {
    requireEnv("NEON_DATABASE_URL");

    if (req.method !== "GET") return j(res, 405, { error: "Method not allowed" });

    const sort = String(req.query?.sort || "trending").toLowerCase();
    const limitRaw = Number(req.query?.limit || 100);
    const limit = Math.min(Math.max(limitRaw, 1), 100);

    let rows = [];

    // Whitelist the ORDER BY cases (no sql injection, no unsafe needed)
    if (sort === "top") {
      rows = await sql`
        select id, owner_wallet, name, upvotes, downvotes, created_at
        from com_cards
        order by (upvotes - downvotes) desc, upvotes desc, created_at desc
        limit ${limit}
      `;
    } else if (sort === "newest") {
      rows = await sql`
        select id, owner_wallet, name, upvotes, downvotes, created_at
        from com_cards
        order by created_at desc
        limit ${limit}
      `;
    } else {
      // trending default
      rows = await sql`
        select id, owner_wallet, name, upvotes, downvotes, created_at
        from com_cards
        order by (upvotes - downvotes) desc, created_at desc
        limit ${limit}
      `;
    }

    const items = (rows || []).map((r) => {
      const up = Number(r.upvotes || 0);
      const down = Number(r.downvotes || 0);
      return {
        id: r.id,
        owner_wallet: r.owner_wallet,
        name: r.name,
        upvotes: up,
        downvotes: down,
        score: up - down,
        created_at: r.created_at,
        imageUrl: `/api/image?id=${encodeURIComponent(r.id)}`
      };
    });

    return j(res, 200, { ok: true, items });
  } catch (e) {
    return j(res, 500, { error: String(e?.message || e) });
  }
}
