// Vercel Serverless Function: GET /api/balance?pubkey=...
// Uses SOLANA_RPC_URL + COMCOIN_MINT (server-side) so you don't expose your Helius key.

function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

    const pubkey = (req.query.pubkey || "").toString().trim();
    if (!pubkey) return json(res, 400, { error: "Missing pubkey" });

    const rpc = process.env.SOLANA_RPC_URL;
    const mint = process.env.COMCOIN_MINT;
    if (!rpc || !mint) return json(res, 500, { error: "Server not configured (missing env vars)" });

    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "getTokenAccountsByOwner",
      params: [
        pubkey,
        { mint },
        { encoding: "jsonParsed" }
      ],
    };

    const r = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const j = await r.json();
    const accounts = j?.result?.value || [];

    let uiAmount = 0;

    for (const acc of accounts) {
      const info = acc?.account?.data?.parsed?.info;
      const tokenAmount = info?.tokenAmount;
      const amt = Number(tokenAmount?.uiAmount || tokenAmount?.uiAmountString || 0);
      uiAmount += isFinite(amt) ? amt : 0;
    }

    return json(res, 200, { uiAmount });
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
};
