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

    // ✅ last 50 votes for the "Recent votes" list
    const votes = await sql`
      select voter_wallet, vote, created_at
      from votes
      where card_id = ${id}
      order by created_at desc
      limit 50
    `;

    // ✅ graph series = sliding window of LAST 50 votes
    // we build a cumulative line from oldest->newest within that window
    const windowAsc = (votes || []).slice().reverse();

    let cum = 0;

    // baseline point so the line starts at 0 on the left
    let series = [{ t: (windowAsc[0]?.created_at || c.created_at), cum: 0 }];

    for (const r of windowAsc) {
      cum += Number(r.vote || 0); // +1 or -1
      series.push({ t: r.created_at, cum });
    }

    // if no votes at all, keep a single baseline
    if (!windowAsc.length) {
      series = [{ t: c.created_at, cum: 0 }];
    }

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
