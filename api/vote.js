// api/vote.js

import {
  j,
  readJson,
  verifyPhantomSign,
  sql,
  requireEnv,
  isBase58Pubkey
} from "./_lib.js";

function utcDayString() {
  // UTC date in YYYY-MM-DD (matches frontend new Date().toISOString().slice(0,10))
  return new Date().toISOString().slice(0, 10);
}

function getIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0].trim();
  const xr = req.headers["x-real-ip"];
  if (typeof xr === "string" && xf.length) return xr.trim();
  return req.socket?.remoteAddress || "unknown";
}

// ✅ Tight card id validation (prevents weird payloads / log spam)
function isCardId(id) {
  return typeof id === "string" && /^CC_[A-Z0-9_]+$/.test(id);
}

// ✅ Same COMCOIN holding check logic as generate
async function getComcoinBalanceUiAmount(pubkey) {
  const RPC = process.env.HELIUS_RPC_URL;
  const MINT = process.env.COMCOIN_MINT;
  if (!RPC || !MINT) throw new Error("Server misconfigured");

  const r = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "comcoin_balance",
      method: "getTokenAccountsByOwner",
      params: [pubkey, { mint: MINT }, { encoding: "jsonParsed" }]
    })
  });

  const data = await r.json().catch(() => null);
  if (!r.ok || data?.error) throw new Error("RPC error");

  const accounts = data?.result?.value || [];
  let uiAmount = 0;
  for (const acc of accounts) {
    const amt = acc?.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0;
    uiAmount += Number(amt || 0);
  }
  return uiAmount;
}

// ✅ IP rate limit using your existing ip_rate_limits table
// We prefix the IP so vote limits don't collide with generate limits.
async function enforceIpRateLimitOrThrow(ip, { limitPerMinute = 30, prefix = "vote:" } = {}) {
  // Basic sanity
  if (typeof ip !== "string" || !ip.trim() || ip.length > 200) {
    const err = new Error("Bad request");
    err.statusCode = 400;
    throw err;
  }

  const scopedIp = `${prefix}${ip}`;

  const rows = await sql`
    insert into ip_rate_limits (ip, bucket_utc, hits)
    values (
      ${scopedIp},
      date_trunc('minute', (now() at time zone 'utc')),
      1
    )
    on conflict (ip, bucket_utc)
    do update set hits = ip_rate_limits.hits + 1
    returning hits
  `;

  const hits = Number(rows?.[0]?.hits ?? 0);
  if (hits > limitPerMinute) {
    const err = new Error("Rate limited");
    err.statusCode = 429;
    throw err;
  }
}

export default async function handler(req, res) {
  try {
    requireEnv("NEON_DATABASE_URL");
    requireEnv("HELIUS_RPC_URL");
    requireEnv("COMCOIN_MINT");

    if (req.method !== "POST") return j(res, 405, { error: "Method not allowed" });

    // ✅ IP rate limit (vote spam protection)
    const ip = getIp(req);
    await enforceIpRateLimitOrThrow(ip, { limitPerMinute: 30, prefix: "vote:" });

    const body = await readJson(req);
    const { cardId, vote, pubkey, message, signature } = body || {};
    if (!cardId || !pubkey || !message || !signature) {
      return j(res, 400, { error: "Missing fields" });
    }

    // ✅ pubkey sanity (same style as generate)
    if (!isBase58Pubkey(pubkey)) {
      return j(res, 400, { error: "Invalid pubkey" });
    }

    // ✅ cardId sanity
    const cardIdTrim = String(cardId).trim();
    if (!isCardId(cardIdTrim)) {
      return j(res, 400, { error: "Bad cardId" });
    }

    const v = Number(vote);
    if (v !== 1 && v !== -1) return j(res, 400, { error: "vote must be 1 or -1" });

    // ✅ Strict server-side message validation (prevents signing arbitrary text)
    const today = utcDayString();
    const expectedMessage = `COM COIN vote | ${cardIdTrim} | ${v} | ${today}`;
    if (message !== expectedMessage) {
      return j(res, 400, { error: "Invalid vote message" });
    }

    // ✅ Verify Phantom signature (authenticates pubkey owns signature for message)
    verifyPhantomSign({ pubkey, message, signature });

    // ✅ Same server-side holding check as generate
    const bal = await getComcoinBalanceUiAmount(pubkey);
    if (bal < 1) {
      return j(res, 403, { error: "Hold $COMCOIN to vote" });
    }

    // Ensure card exists (keeps your current 404 behavior)
    const cardRows = await sql`select id from com_cards where id = ${cardIdTrim} limit 1`;
    if (!cardRows?.length) return j(res, 404, { error: "Card not found" });

    // Optional fast pre-check (nice error before insert attempt)
    const already = await sql`
      select 1
      from votes
      where card_id = ${cardIdTrim}
        and voter_wallet = ${pubkey}
        and vote_day_utc = ((now() at time zone 'utc')::date)
      limit 1
    `;
    if (already?.length) {
      return j(res, 429, { error: "VOTE LIMIT FOR THIS CARD REACHED (TODAY)." });
    }

    // ✅ Atomic insert + counter update
    try {
      const rows = await sql`
        with ins as (
          insert into votes (card_id, voter_wallet, vote)
          values (${cardIdTrim}, ${pubkey}, ${v})
          returning vote
        ),
        upd as (
          update com_cards
          set upvotes = upvotes + (select case when vote = 1 then 1 else 0 end from ins),
              downvotes = downvotes + (select case when vote = -1 then 1 else 0 end from ins)
          where id = ${cardIdTrim}
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
    const status = Number(e?.statusCode || 500);

    // ✅ Don't leak internals
    const msg =
      status === 400 ? (e?.message || "Bad request") :
      status === 401 ? "Unauthorized" :
      status === 403 ? "Forbidden" :
      status === 413 ? "Request too large" :
      status === 429 ? "Rate limited" :
      "Server error";

    return j(res, status, { error: msg });
  }
}
