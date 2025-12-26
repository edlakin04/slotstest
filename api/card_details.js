import { j, requireEnv, sql } from "./_lib.js";

export default async function handler(req, res) {
  try {
    requireEnv("NEON_DATABASE_URL");

    if (req.method !== "GET") return j(res, 405, { error: "Method not allowed" });

    const id = String(req.query?.id || "").trim();
    if (!id) return j(res, 400, { error: "Missing id" });

    const cardRows = await sql`
      select id, owner_wallet, name, upvotes, downvotes, created_at
      from com_cards
      where id = ${id}
      limit 1
    `;
    const c = cardRows?.[0];
    if (!c) return j(res, 404, { error: "Card not found" });

    // Most recent 50 votes (DESC for list)
    const lastVotesRows = await sql`
      select voter_wallet, vote, created_at
      from votes
      where card_id = ${id}
      order by created_at desc
      limit 50
    `;

    // For the chart we want chronological order (ASC) using the same last 50 votes.
    // Easiest: query ASC with limit 50 by sorting DESC in a subquery then re-sorting ASC.
    const chartRows = await sql`
      select voter_wallet, vote, created_at
      from (
        select voter_wallet, vote, created_at
        from votes
        where card_id = ${id}
        order by created_at desc
        limit 50
      ) t
      order by created_at asc
    `;

    // Build voteSeries as “trading style” step-by-step cumulative points over the last 50 votes.
    let cum = 0;
    const voteSeries = (chartRows || []).map((r) => {
      cum += Number(r.vote || 0);
      return {
        t: r.created_at,        // keep time for spacing if you want later
        vote: Number(r.vote || 0),
        cum
      };
    });

    const up = Number(c.upvotes || 0);
    const down = Number(c.downvotes || 0);

    return j(res, 200, {
      ok: true,
      card: {
        id: c.id,
        owner_wallet: c.owner_wallet,
        name: c.name,
        upvotes: up,
        downvotes: down,
        score: up - down,
        created_at: c.created_at,
        imageUrl: `/api/image?id=${encodeURIComponent(c.id)}`
      },
      lastVotes: (lastVotesRows || []).map(v => ({
        voter_wallet: v.voter_wallet,
        vote: Number(v.vote || 0),
        created_at: v.created_at
      })),
      voteSeries
    });
  } catch (e) {
    return j(res, 500, { error: String(e?.message || e) });
  }
}
