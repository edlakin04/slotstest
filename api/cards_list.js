import {
  j,
  requireEnv,
  sql,
  supabase
} from "./_lib.js";

/**
 * GET /api/cards_list?sort=trending|top|newest&limit=100
 * Returns up to 100 cards with SIGNED URLs (private bucket).
 *
 * Uses Upstash cache to avoid re-signing every request.
 */

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 60;
const DEFAULT_SIGNED_TTL = 60 * 60; // 1h

export default async function handler(req, res) {
  try {
    requireEnv("NEON_DATABASE_URL");
    requireEnv("SUPABASE_URL");
    requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    requireEnv("SUPABASE_BUCKET");
    requireEnv("UPSTASH_REDIS_REST_URL");
    requireEnv("UPSTASH_REDIS_REST_TOKEN");

    if (req.method !== "GET") return j(res, 405, { error: "Method not allowed" });

    const url = new URL(req.url, `http://${req.headers.host}`);
    const sort = (url.searchParams.get("sort") || "trending").toLowerCase();
    const limitRaw = Number(url.searchParams.get("limit") || DEFAULT_LIMIT);
    const limit = clampInt(limitRaw, 1, MAX_LIMIT);

    // Pull from DB
    const rows = await fetchCards({ sort, limit });

    // Create / cache signed URLs for private bucket
    const bucket = process.env.SUPABASE_BUCKET;
    const ttl = Number(process.env.SIGNED_URL_TTL_SECONDS || DEFAULT_SIGNED_TTL);

    const paths = rows.map(r => r.image_url).filter(Boolean);
    const signedMap = await getSignedUrlsCached(bucket, paths, ttl);

    const items = rows.map(r => {
      const up = Number(r.upvotes ?? 0);
      const down = Number(r.downvotes ?? 0);
      const score = up - down;
      const signedUrl = signedMap.get(r.image_url) || null;

      return {
        id: r.id,
        owner_wallet: r.owner_wallet,
        name: r.name,
        created_at: r.created_at,
        upvotes: up,
        downvotes: down,
        score,
        imageUrl: signedUrl,
        imagePath: r.image_url
      };
    });

    return j(res, 200, { ok: true, sort, limit, items });
  } catch (e) {
    return j(res, 500, { error: String(e?.message || e) });
  }
}

/* ---------------- DB sorting ---------------- */

async function fetchCards({ sort, limit }) {
  if (sort === "newest") {
    return await sql`
      select id, owner_wallet, name, image_url, created_at, upvotes, downvotes
      from com_cards
      order by created_at desc
      limit ${limit}
    `;
  }

  if (sort === "top") {
    return await sql`
      select id, owner_wallet, name, image_url, created_at, upvotes, downvotes
      from com_cards
      order by (upvotes - downvotes) desc, created_at desc
      limit ${limit}
    `;
  }

  // trending (time-decay score)
  // score / (hours_since + 2)^1.5
  return await sql`
    select id, owner_wallet, name, image_url, created_at, upvotes, downvotes
    from com_cards
    order by
      (
        (upvotes - downvotes)::float
        / pow( (extract(epoch from (now() - created_at)) / 3600.0) + 2.0, 1.5 )
      ) desc,
      created_at desc
    limit ${limit}
  `;
}

/* ---------------- Signed URL caching (Upstash) ---------------- */

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

function cacheKeyForPath(path) {
  // Keep key short and safe: signed:<path>
  return `signed:${path}`;
}

async function getSignedUrlsCached(bucket, paths, ttlSeconds) {
  const unique = Array.from(new Set(paths));
  const out = new Map();

  if (!unique.length) return out;

  // 1) Bulk GET cached URLs
  const getCmds = unique.map(p => ["GET", cacheKeyForPath(p)]);
  const cached = await upstashPipeline(getCmds);

  const missing = [];
  for (let i = 0; i < unique.length; i++) {
    const path = unique[i];
    const val = cached?.[i]?.result ?? null;
    if (typeof val === "string" && val.startsWith("http")) {
      out.set(path, val);
    } else {
      missing.push(path);
    }
  }

  // 2) Sign missing (cap work to avoid huge compute in one call)
  // Your endpoint already limits to 100 cards, so this is fine.
  const newlySigned = [];
  for (const path of missing) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, ttlSeconds);
    if (error) continue;
    const signedUrl = data?.signedUrl;
    if (!signedUrl) continue;
    out.set(path, signedUrl);
    newlySigned.push({ path, signedUrl });
  }

  // 3) Cache newly signed URLs with a slightly shorter TTL (so they don't expire in cache)
  if (newlySigned.length) {
    const ttlCache = Math.max(60, ttlSeconds - 60); // keep 60s buffer
    const setCmds = newlySigned.map(x => ["SET", cacheKeyForPath(x.path), x.signedUrl, "EX", String(ttlCache)]);
    await upstashPipeline(setCmds);
  }

  return out;
}

/* ---------------- Utils ---------------- */

function clampInt(n, min, max) {
  const x = Number.isFinite(n) ? Math.floor(n) : min;
  return Math.max(min, Math.min(max, x));
}
