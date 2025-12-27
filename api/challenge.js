import { j, requireEnv, issueNonce, isBase58Pubkey } from "./_lib.js";

export default async function handler(req, res) {
  try {
    requireEnv("UPSTASH_REDIS_REST_URL");
    requireEnv("UPSTASH_REDIS_REST_TOKEN");

    if (req.method !== "GET") return j(res, 405, { error: "Method not allowed" });

    const action = String(req.query?.action || "").trim(); // "generate" | "vote"
    const wallet = String(req.query?.wallet || "").trim();

    if (action !== "generate" && action !== "vote") {
      return j(res, 400, { error: "Bad action" });
    }
    if (!isBase58Pubkey(wallet)) return j(res, 400, { error: "Bad wallet" });

    const { nonce, ttl } = await issueNonce({ action, wallet });

    return j(res, 200, {
      ok: true,
      action,
      nonce,
      ttlSeconds: ttl
    });
  } catch (e) {
    const status = Number(e?.statusCode || 500);
    return j(res, status, { error: status === 400 ? (e?.message || "Bad request") : "Server error" });
  }
}
