import { j, readJson, verifyPhantomSign, sql, requireEnv } from "./_lib.js";

function utcDayString() {
  // UTC date in YYYY-MM-DD (matches frontend new Date().toISOString().slice(0,10))
  return new Date().toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  try {
    requireEnv("NEON_DATABASE_URL");

    if (req.method !== "POST") return j(res, 405, { error: "Method not allowed" });

    const body = await readJson(req);
    const { cardId, vote, pubkey, message, signature } = body || {};
    if (!cardId || !pubkey || !message || !signature) {
      return j(res, 400, { error: "Missing fields" });
    }

    const v = Number(vote);
    if (v !== 1 && v !== -1) return j(res, 400, { error: "vote must be 1 or -1" });

    // ✅ Strict server-side message validation (prevents signing arbitrary text)
    const today = utcDayString();
    const expectedMessage = `COM COIN vote | ${cardId} | ${v} | ${today}`;
    if (message !== expectedMessage) {
      return j(res, 400, { error: "Invalid vote message" });
    }

    // Verify Phantom signature (authenticates pubkey owns signature for message)
    verifyPhantomSign({ pubkey, message, signature });

    // Ensure card exists (keeps your current 404 behavior)
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

    // ✅ Atomic insert + counter update:
    // - If insert succeeds, update happens in the same statement.
    // - If insert fails (unique violation), nothing is updated.
    // - Prevents drift between votes event log and com_cards totals.
    try {
      const rows = await sql`
        with ins as (
          insert into votes (card_id, voter_wallet, vote)
          values (${cardId}, ${pubkey}, ${v})
          returning vote
        ),
        upd as (
          update com_cards
          set upvotes = upvotes + (select case when vote = 1 then 1 else 0 end from ins),
              downvotes = downvotes + (select case when vote = -1 then 1 else 0 end from ins)
          where id = ${cardId}
          returning upvotes, downvotes
        )
        select upvotes, downvotes from upd
      `;

      const upvotes = Number(rows?.[0]?.upvotes ?? 0);
      const downvotes = Number(rows?.[0]?.downvotes ?? 0);

      return j(res, 200, { ok: true, upvotes, downvotes, score: upvotes - downvotes });
    } catch (e) {
      const msg = String(e?.message || e);
      const code = e?.code; // Postgres error code

      // Unique constraint (1 vote per UTC day per wallet per card)
      if (code === "23505" || msg.toLowerCase().includes("duplicate key")) {
        return j(res, 429, { error: "VOTE LIMIT FOR THIS CARD REACHED (TODAY)." });
      }

      // FK violation (card missing) - should be rare due to pre-check, but safe
      if (code === "23503") {
        return j(res, 404, { error: "Card not found" });
      }

      throw e;
    }
  } catch (e) {
    return j(res, 500, { error: String(e?.message || e) });
  }
}
