import { j, requireEnv, sql } from "./_lib.js";

function isVercelCron(req) {
  const ua = String(req.headers["user-agent"] || "").toLowerCase();
  // Vercel cron requests have a vercel-cron user agent
  return ua.includes("vercel-cron");
}

export default async function handler(req, res) {
  try {
    requireEnv("NEON_DATABASE_URL");

    if (req.method !== "GET") return j(res, 405, { error: "Method not allowed" });

    // Cron-only access
    if (!isVercelCron(req)) return j(res, 401, { error: "Unauthorized" });

    // Keep only last 2 days of per-minute IP buckets
    const ipDel = await sql`
      delete from ip_rate_limits
      where bucket_utc < (now() at time zone 'utc') - interval '2 days'
    `;

    // Keep only last 60 days of generate locks
    const genDel = await sql`
      delete from daily_generate_locks
      where gen_day_utc < ((now() at time zone 'utc')::date - 60)
    `;

    return j(res, 200, {
      ok: true,
      deleted: {
        ip_rate_limits: Number(ipDel?.count ?? 0),
        daily_generate_locks: Number(genDel?.count ?? 0)
      }
    });
  } catch (e) {
    return j(res, 500, { error: "Server error" });
  }
}
