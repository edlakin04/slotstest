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

    // Last 50 vote events
    const votes = await sql`
      select voter_wallet, vote, created_at
      from vote_events
      where card_id = ${id}
      order by created_at desc
      limit 50
    `;

    // Net line graph: daily net votes (last 30 days) => cumulative
    const seriesRows = await sql`
      select (created_at at time zone 'utc')::date as day, sum(vote)::int as net
      from vote_events
      where card_id = ${id}
        and created_at >= (now() at time zone 'utc') - interval '30 days'
      group by 1
      order by 1 asc
    `;

    let cum = 0;
    const series = (seriesRows || []).map(r => {
      cum += Number(r.net || 0);
      return { day: String(r.day), net: Number(r.net || 0), cum };
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
      lastVotes: (votes || []).map(v => ({
        voter_wallet: v.voter_wallet,
        vote: Number(v.vote || 0),
        created_at: v.created_at
      })),
      netSeries: series
    });
  } catch (e) {
    return j(res, 500, { error: String(e?.message || e) });
  }
}
