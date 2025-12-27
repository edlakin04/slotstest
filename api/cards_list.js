import { j, requireEnv, sql } from "./_lib.js";

export default async function handler(req, res) {
  try {
    requireEnv("NEON_DATABASE_URL");

    if (req.method !== "GET") return j(res, 405, { error: "Method not allowed" });

    const sort = String(req.query?.sort || "trending").toLowerCase();
    const limitRaw = Number(req.query?.limit || 100);
    const limit = Math.min(Math.max(limitRaw, 1), 100);

    let rows = [];

    if (sort === "top") {
      // ✅ TOP = ALL-TIME NET VOTES
      rows = await sql`
        select id, owner_wallet, name, upvotes, downvotes, created_at
        from com_cards
        order by (upvotes - downvotes) desc, upvotes desc, created_at desc
        limit ${limit}
      `;

      const items = (rows || []).map((r) => {
        const up = Number(r.upvotes || 0);
        const down = Number(r.downvotes || 0);
        return {
          id: r.id,
          owner_wallet: r.owner_wallet,
          name: r.name,
          upvotes: up,
          downvotes: down,
          score: up - down, // all-time
          created_at: r.created_at,
          imageUrl: `/api/image?id=${encodeURIComponent(r.id)}`
        };
      });

      return j(res, 200, { ok: true, items });
    }

    if (sort === "newest") {
      // ✅ NEWEST = RECENT MINTS
      rows = await sql`
        select id, owner_wallet, name, upvotes, downvotes, created_at
        from com_cards
        order by created_at desc
        limit ${limit}
      `;

      const items = (rows || []).map((r) => {
        const up = Number(r.upvotes || 0);
        const down = Number(r.downvotes || 0);
        return {
          id: r.id,
          owner_wallet: r.owner_wallet,
          name: r.name,
          upvotes: up,
          downvotes: down,
          score: up - down, // all-time (still fine for newest view)
          created_at: r.created_at,
          imageUrl: `/api/image?id=${encodeURIComponent(r.id)}`
        };
      });

      return j(res, 200, { ok: true, items });
    }

    // ✅ TRENDING = LAST 24H NET VOTES (votes table)
    //
    // We compute a 24h net score from votes:
    //   net24 = sum(vote) over last 24h (vote is -1 or +1)
    // and sort by that.
    //
    // Note:
    // - cards with 0 votes in last 24h still show (net24 = 0)
    // - tie-breaker: newest first (and then all-time net)
    rows = await sql`
      with net24 as (
        select
          card_id,
          coalesce(sum(vote), 0)::int as net_24h
        from votes
        where created_at >= (now() at time zone 'utc') - interval '24 hours'
        group by card_id
      )
      select
        c.id,
        c.owner_wallet,
        c.name,
        c.upvotes,
        c.downvotes,
        c.created_at,
        coalesce(n.net_24h, 0)::int as net_24h
      from com_cards c
      left join net24 n on n.card_id = c.id
      order by
        coalesce(n.net_24h, 0) desc,
        c.created_at desc,
        (c.upvotes - c.downvotes) desc
      limit ${limit}
    `;

    const items = (rows || []).map((r) => {
      const up = Number(r.upvotes || 0);
      const down = Number(r.downvotes || 0);
      const net24h = Number(r.net_24h || 0);

      return {
        id: r.id,
        owner_wallet: r.owner_wallet,
        name: r.name,
        upvotes: up,
        downvotes: down,
        score: net24h, // ✅ trending score = last 24h net
        created_at: r.created_at,
        imageUrl: `/api/image?id=${encodeURIComponent(r.id)}`
      };
    });

    return j(res, 200, { ok: true, items });
  } catch (e) {
    return j(res, 500, { error: String(e?.message || e) });
  }
}
