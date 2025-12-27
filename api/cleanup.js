import { j, requireEnv, sql } from "./_lib.js";

export default async function handler(req, res) {
  try {
    requireEnv("NEON_DATABASE_URL");

    if (req.method !== "GET") return j(res, 405, { error: "Method not allowed" });

    // ✅ Token is provided by Vercel Cron (via vercel.json secret substitution)
    const expected = process.env.CLEANUP_TOKEN || "";
    const got = String(req.query?.token || "").trim();

    // If you don't want an env var too, you can remove CLEANUP_TOKEN entirely,
    // but having both is fine and keeps local testing easy.
    if (!expected || got !== expected) {
      return j(res, 401, { error: "Unauthorized" });
    }

    // ✅ Keep only last 2 days of IP buckets
    await sql`
      delete from ip_rate_limits
      where bucket_utc < (now() at time zone 'utc') - interval '2 days'
    `;

    // ✅ Keep only last 60 days of generate locks
    await sql`
      delete from daily_generate_locks
      where gen_day_utc < ((now() at time zone 'utc')::date - 60)
    `;

    return j(res, 200, { ok: true });
  } catch (e) {
    return j(res, 500, { error: "Server error" });
  }
}
