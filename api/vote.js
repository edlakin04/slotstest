import crypto from "crypto";
import { j, readJson, verifyPhantomSign, sql, requireEnv } from "./_lib.js";

const VOTE_MSG_PREFIX = "COM COIN vote | "; // must match frontend

export default async function handler(req, res) {
  try {
    requireEnv("NEON_DATABASE_URL");
    requireEnv("UPSTASH_REDIS_REST_URL");
    requireEnv("UPSTASH_REDIS_REST_TOKEN");

    if (req.method !== "POST") return j(res, 405, { error: "Method not allowed" });

    const body = await readJson(req);
    const { cardId, vote, pubkey, message, signature } = body || {};
    if (!cardId || !pubkey || !message || !signature) return j(res, 400, { error: "Missing fields" });

    const v = Number(vote);
    if (v !== 1 && v !== -1) return j(res, 400, { error: "vote must be 1 or -1" });

    // Strict message validation: "COM COIN vote | <cardId> | <vote> | YYYY-MM-DD"
    const today = new Date().toISOString().slice(0, 10);
    const expectedMsg = `${VOTE_MSG_PREFIX}${cardId} | ${v} | ${today}`;
    if (message !== expectedMsg) return j(res, 400, { error: "Invalid message format" });

    // Verify signature
    verifyPhantomSign({ pubkey, message, signature });

    const ip = getClientIp(req);

    // Rate limits (disable for testing)
    if (process.env.DISABLE_RATE_LIMIT !== "1") {
      // per IP: 120 votes / 10 minutes
      await rateLimitOrThrow(`rl:vote:ip:${ip}`, 120, 600);
      // per wallet: 60 votes / 10 minutes
      await rateLimitOrThrow(`rl:vote:wallet:${pubkey}`, 60, 600);
    }

    // ✅ One vote PER DAY per wallet per card
    // If they try again same day (even opposite direction), block.
    {
      const dayKey = `vote:day:${pubkey}:${cardId}:${today}`;
      const ok = await setIfNotExists(dayKey, String(v), 2 * 24 * 60 * 60); // keep 2 days
      if (!ok) {
        return j(res, 429, { error: "VOTE LIMIT FOR THIS CARD REACHED (1 VOTE PER DAY)." });
      }
    }

    // Replay protection (same signature spam)
    // Friendly message if hit (rare now, because dayKey blocks most repeats)
    {
      const sigHash = sha256Hex(`${pubkey}|${message}|${signature}`);
      const replayKey = `vote:replay:${sigHash}`;
      const ok = await setIfNotExists(replayKey, "1", 24 * 60 * 60);
      if (!ok) {
        return j(res, 429, { error: "VOTE LIMIT FOR THIS CARD REACHED (1 VOTE PER DAY)." });
      }
    }

    // Optional: require hold to vote
    if (process.env.VOTE_REQUIRE_HOLD === "1") {
      const r = await fetch(`${originFromReq(req)}/api/balance?pubkey=${encodeURIComponent(pubkey)}`);
      const t = await r.text();
      let b = null;
      try { b = JSON.parse(t); } catch {}
      const amt = Number(b?.uiAmount || 0);
      if (!(amt > 0)) return j(res, 403, { error: "Hold $COMCOIN to vote" });
    }

    // Since we enforce "one vote/day", we do NOT allow updating the same row as a “switch”.
    // We still store the latest vote in DB (unique constraint handles repeats historically),
    // but the dayKey ensures only 1 action/day reaches here.

    // Check previous vote for totals delta
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
      // This can only happen on a later day (since we block multiple per day).
      if (prev === 1) upDelta -= 1;
      if (prev === -1) downDelta -= 1;
      if (v === 1) upDelta += 1;
      if (v === -1) downDelta += 1;
    } else {
      // Same vote as before (likely another day) — no delta
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
    return j(res, 200, {
      ok: true,
      upvotes: cur[0].upvotes,
      downvotes: cur[0].downvotes,
      score: cur[0].upvotes - cur[0].downvotes
    });
  } catch (e) {
    return j(res, 500, { error: String(e?.message || e) });
  }
}

/* ---------------- Upstash helpers ---------------- */

function upstashHeaders() {
  return {
    Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
    "Content-Type": "application/json"
  };
}

async function upstashPipeline(cmds) {
  const url = `${process.env.UPSTASH_REDIS_REST_URL}/pipeline`;
  const r = await fetch(url, { method: "POST", headers: upstashHeaders(), body: JSON.stringify(cmds) });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  if (!r.ok) throw new Error(data?.error || text || "Upstash error");
  return data;
}

async function setIfNotExists(key, value, ttlSeconds) {
  const out = await upstashPipeline([
    ["SET", key, value, "NX", "EX", String(ttlSeconds)]
  ]);
  const res = out?.[0]?.result ?? null;
  return res === "OK";
}

async function rateLimitOrThrow(key, limit, windowSeconds) {
  const out = await upstashPipeline([
    ["INCR", key],
    ["EXPIRE", key, String(windowSeconds)]
  ]);
  const count = Number(out?.[0]?.result ?? 0);
  if (count > limit) throw new Error("Rate limit exceeded");
}

function sha256Hex(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

function getClientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0].trim();
  const xr = req.headers["x-real-ip"];
  if (typeof xr === "string" && xr.length) return xr.trim();
  return "unknown";
}

function originFromReq(req) {
  const proto = (req.headers["x-forwarded-proto"] || "https").toString();
  const host = req.headers.host;
  return `${proto}://${host}`;
}
