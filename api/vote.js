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

    // Ensure card exists
    const cardRows = await sql`select id from com_cards where id = ${cardId} limit 1`;
    if (!cardRows?.length) return j(res, 404, { error: "Card not found" });

    // Optional fast pre-check (nice error before insert attempt)
    const already = await sql`
      select 1
      from votes
      where card_id = ${cardId}
        and voter_wallet = ${pubkey}
        and vote_day_utc = ((now() at time zone 'utc')::date)
      limit 1
    `;
    if (already?.length) {
      return j(res, 429, { error: "VOTE LIMIT FOR THIS CARD REACHED (TODAY)." });
    }

    // Insert vote event (unique index enforces 1/day even in race conditions)
    try {
      await sql`
        insert into votes (card_id, voter_wallet, vote)
        values (${cardId}, ${pubkey}, ${v})
      `;
    } catch (e) {
      // Handle unique constraint violation cleanly
      const msg = String(e?.message || e);
      const code = e?.code; // Postgres error code (23505 for unique violation)

      if (code === "23505" || msg.toLowerCase().includes("duplicate key")) {
        return j(res, 429, { error: "VOTE LIMIT FOR THIS CARD REACHED (TODAY)." });
      }
      throw e;
    }

    // Update card totals
    const upDelta = v === 1 ? 1 : 0;
    const downDelta = v === -1 ? 1 : 0;

    const updated = await sql`
      update com_cards
      set upvotes = upvotes + ${upDelta},
          downvotes = downvotes + ${downDelta}
      where id = ${cardId}
      returning upvotes, downvotes
    `;

    const upvotes = Number(updated?.[0]?.upvotes ?? 0);
    const downvotes = Number(updated?.[0]?.downvotes ?? 0);

    return j(res, 200, { ok: true, upvotes, downvotes, score: upvotes - downvotes });
  } catch (e) {
    return j(res, 500, { error: String(e?.message || e) });
  }
}
