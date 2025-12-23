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

    const prevRows = await sql`
      select vote from votes where card_id = ${cardId} and voter_wallet = ${pubkey} limit 1
    `;
    const prev = prevRows?.[0]?.vote ?? null;

    await sql`
      insert into votes (card_id, voter_wallet, vote)
      values (${cardId}, ${pubkey}, ${v})
      on conflict (card_id, voter_wallet) do update set vote = excluded.vote
    `;

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
    }

    if (upDelta !== 0 || downDelta !== 0) {
      const updated = await sql`
        update com_cards
        set upvotes = upvotes + ${upDelta},
            downvotes = downvotes + ${downDelta}
        where id = ${cardId}
        returning upvotes, downvotes
      `;
      if (!updated?.length) return j(res, 404, { error: "Card not found" });
      const { upvotes, downvotes } = updated[0];
      return j(res, 200, { ok: true, upvotes, downvotes, score: upvotes - downvotes });
    }

    const cur = await sql`select upvotes, downvotes from com_cards where id=${cardId} limit 1`;
    if (!cur?.length) return j(res, 404, { error: "Card not found" });
    return j(res, 200, { ok: true, upvotes: cur[0].upvotes, downvotes: cur[0].downvotes, score: cur[0].upvotes - cur[0].downvotes });
  } catch (e) {
    return j(res, 500, { error: String(e?.message || e) });
  }
}
