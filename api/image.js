import { j, requireEnv, sql, supabase } from "./_lib.js";
import crypto from "crypto";

function getIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0].trim();
  const xr = req.headers["x-real-ip"];
  if (typeof xr === "string" && xr.length) return xr.trim();
  return req.socket?.remoteAddress || "unknown";
}

// reuse same table, different prefix
async function enforceIpRateLimitOrThrow(ip, { limitPerMinute = 120, prefix = "img:" } = {}) {
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
    requireEnv("SUPABASE_URL");
    requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    requireEnv("SUPABASE_BUCKET");

    if (req.method !== "GET") return j(res, 405, { error: "Method not allowed" });

    const id = String(req.query?.id || "").trim();
    if (!id) return j(res, 400, { error: "Missing id" });
    if (!/^CC_[A-Z0-9_]+$/.test(id)) return j(res, 400, { error: "Bad id" });

    // ✅ basic rate limit to protect proxy costs
    const ip = getIp(req);
    await enforceIpRateLimitOrThrow(ip, { limitPerMinute: 120, prefix: "img:" });

    const rows = await sql`
      select image_url
      from com_cards
      where id = ${id}
      limit 1
    `;
    const path = rows?.[0]?.image_url;
    if (!path) return j(res, 404, { error: "Not found" });

    if (!/^[A-Za-z0-9/_\-\.]+$/.test(path) || path.includes("..")) {
      return j(res, 400, { error: "Bad path" });
    }

    const bucket = process.env.SUPABASE_BUCKET;
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error) throw new Error("Supabase download failed");
    if (!data) throw new Error("No data from storage");

    const ab = await data.arrayBuffer();
    const buf = Buffer.from(ab);

    // ✅ strong ETag (content hash) + 304 support
    const etag = `"${crypto.createHash("sha256").update(buf).digest("hex")}"`;
    const inm = String(req.headers["if-none-match"] || "");
    if (inm && inm === etag) {
      res.statusCode = 304;
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
      return res.end();
    }

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
    res.setHeader("ETag", etag);

    res.statusCode = 200;
    return res.end(buf);
  } catch (e) {
    const status = Number(e?.statusCode || 500);
    const msg =
      status === 429 ? "Rate limited" :
      "Server error";
    return j(res, status, { error: msg });
  }
}
