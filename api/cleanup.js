import { j, requireEnv, sql } from "./_lib.js";

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET || "";
  const auth = String(req.headers.authorization || "");
  return secret.length > 0 && auth === `Bearer ${secret}`;
}

export default async function handler(req, res) {
  try {
    requireEnv("NEON_DATABASE_URL");
    requireEnv("CRON_SECRET");

    if (req.method !== "GET") return j(res, 405, { error: "Method not allowed" });
    if (!isAuthorized(req)) return j(res, 401, { error: "Unauthorized" });

    const ipDel = await sql`
      delete from ip_rate_limits
      where bucket_utc < (now() at time zone 'utc') - interval '2 days'
    `;

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
