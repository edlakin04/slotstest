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

    // ✅ Pull last 50 votes from the REAL table: votes
    // We order DESC for the "recent votes" list, but we also build a chart series ASC.
    const votesDesc = await sql`
      select voter_wallet, vote, created_at
      from votes
      where card_id = ${id}
      order by created_at desc
      limit 50
    `;

    // Same votes but ASC for chart building (oldest → newest)
    const votesAsc = [...(votesDesc || [])].reverse();

    // Build a time-based step series:
    // points: [{ t: <ms>, cum: <net cumulative> }]
    let cum = 0;
    const voteSeries = (votesAsc || []).map((v) => {
      cum += Number(v.vote || 0);
      return {
        t: new Date(v.created_at).getTime(),
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
      lastVotes: (votesDesc || []).map(v => ({
        voter_wallet: v.voter_wallet,
        vote: Number(v.vote || 0),
        created_at: v.created_at
      })),
      // ✅ chart series (last 50 votes, time spaced)
      voteSeries
    });
  } catch (e) {
    return j(res, 500, { error: String(e?.message || e) });
  }
}
