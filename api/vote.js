import {
  j,
  readJson,
  verifyPhantomSign,
  sql,
  requireEnv,
  consumeNonce
} from "./_lib.js";

function utcDayString() {
  return new Date().toISOString().slice(0, 10);
}

function getOrigin() {
  return requireEnv("SITE_ORIGIN");
}

function getIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0].trim();
  const xr = req.headers["x-real-ip"];
  if (typeof xr === "string" && xr.length) return xr.trim();
  return req.socket?.remoteAddress || "unknown";
}

function isCardId(id) {
  return typeof id === "string" && /^CC_[A-Z0-9_]+$/.test(id);
}

async function enforceIpRateLimitOrThrow(ip, { limitPerMinute = 30, prefix = "vote:" } = {}) {
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
    requireEnv("UPSTASH_REDIS_REST_URL");
    requireEnv("UPSTASH_REDIS_REST_TOKEN");
    requireEnv("SITE_ORIGIN");

    if (req.method !== "POST") return j(res, 405, { error: "Method not allowed" });

    const ip = getIp(req);
    await enforceIpRateLimitOrThrow(ip, { limitPerMinute: 30, prefix: "vote:" });

    const body = await readJson(req);
    const { cardId, vote, pubkey, message, signature, nonce } = body || {};

    if (!cardId || !pubkey || !message || !signature || !nonce) {
      return j(res, 400, { error: "Missing fields" });
    }

    if (!isCardId(String(cardId).trim())) {
      return j(res, 400, { error: "Bad cardId" });
    }

    const v = Number(vote);
    if (v !== 1 && v !== -1) return j(res, 400, { error: "vote must be 1 or -1" });

    const today = utcDayString();
    const origin = getOrigin();

    // ✅ New strict message format with nonce + origin binding
    const expectedMessage = `COM COIN|vote|${origin}|${cardId}|${v}|${today}|${nonce}`;
    if (message !== expectedMessage) {
      return j(res, 400, { error: "Invalid vote message" });
    }

    verifyPhantomSign({ pubkey, message, signature });

    // ✅ Consume nonce (one-time use)
    await consumeNonce({ action: "vote", wallet: pubkey, nonce });

    const cardRows = await sql`select id from com_cards where id = ${cardId} limit 1`;
    if (!cardRows?.length) return j(res, 404, { error: "Card not found" });

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
      const code = e?.code;

      if (code === "23505" || msg.toLowerCase().includes("duplicate key")) {
        return j(res, 429, { error: "VOTE LIMIT FOR THIS CARD REACHED (TODAY)." });
      }
      if (code === "23503") {
        return j(res, 404, { error: "Card not found" });
      }
      throw e;
    }
  } catch (e) {
    const status = Number(e?.statusCode || 500);
    const msg =
      status === 400 ? (e?.message || "Bad request") :
      status === 401 ? "Unauthorized" :
      status === 413 ? "Request too large" :
      status === 429 ? "Rate limited" :
      "Server error";

    return j(res, status, { error: msg });
  }
}
