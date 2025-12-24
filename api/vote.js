import { j, readJson, verifyPhantomSign, sql, requireEnv } from "./_lib.js";

export default async function handler(req, res) {
  try {
    requireEnv("NEON_DATABASE_URL");

    if (req.method !== "POST") return j(res, 405, { error: "Method not allowed" });

    const body = await readJson(req);
    const { cardId, vote, pubkey, message, signature } = body || {};
    if (!cardId || !pubkey || !message || !signature) return j(res, 400, { error: "Missing fields" });

    const v = Number(vote);
    if (v !== 1 && v !== -1) return j(res, 400, { error: "vote must be 1 or -1" });

    verifyPhantomSign({ pubkey, message, signature });

    // Use UTC day for the per-day vote rule
    const voteDay = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // Previous vote for this day (if any)
    const prevRows = await sql`
      select vote
      from votes
      where card_id = ${cardId}
        and voter_wallet = ${pubkey}
        and vote_day = ${voteDay}::date
      limit 1
    `;
    const prev = prevRows?.[0]?.vote ?? null;

    // Upsert daily vote
    await sql`
      insert into votes (card_id, voter_wallet, vote, vote_day)
      values (${cardId}, ${pubkey}, ${v}, ${voteDay}::date)
      on conflict (card_id, voter_wallet, vote_day)
      do update set vote = excluded.vote
    `;

    // Log vote event (for last 50 + graph)
    await sql`
      insert into vote_events (card_id, voter_wallet, vote)
      values (${cardId}, ${pubkey}, ${v})
    `;

    // Compute deltas for the card totals
    let upDelta = 0;
    let downDelta = 0;

    if (prev === null) {
      if (v === 1) upDelta = 1;
      else downDelta = 1;
    } else if (prev !== v) {
      if (prev === 1) upDelta -= 1;
      if (prev === -1) downDelta -= 1;
      if (v === 1) upDelta += 1;
      if (v === -1) downDelta += 1;
    } else {
      // Same vote again today: nothing changes totals, but we still logged the event.
      // You can optionally block here instead, but you asked for "vote per day" so it’s okay.
    }

    let upvotes, downvotes;

    if (upDelta !== 0 || downDelta !== 0) {
      const updated = await sql`
        update com_cards
        set upvotes = upvotes + ${upDelta},
            downvotes = downvotes + ${downDelta}
        where id = ${cardId}
        returning upvotes, downvotes
      `;
      if (!updated?.length) return j(res, 404, { error: "Card not found" });
      upvotes = Number(updated[0].upvotes || 0);
      downvotes = Number(updated[0].downvotes || 0);
    } else {
      const cur = await sql`
        select upvotes, downvotes from com_cards where id=${cardId} limit 1
      `;
      if (!cur?.length) return j(res, 404, { error: "Card not found" });
      upvotes = Number(cur[0].upvotes || 0);
      downvotes = Number(cur[0].downvotes || 0);
    }

    return j(res, 200, { ok: true, upvotes, downvotes, score: upvotes - downvotes });
  } catch (e) {
    return j(res, 500, { error: String(e?.message || e) });
  }
}
