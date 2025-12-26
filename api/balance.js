import { isBase58Pubkey } from "./_lib.js";

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pubkey = url.searchParams.get("pubkey");

    if (!pubkey) return json(res, 400, { error: "Missing pubkey" });
    if (!isBase58Pubkey(pubkey)) return json(res, 400, { error: "Invalid pubkey" });

    const RPC = process.env.HELIUS_RPC_URL;
    const MINT = process.env.COMCOIN_MINT;

    if (!RPC) return json(res, 500, { error: "Server error" });
    if (!MINT) return json(res, 500, { error: "Server error" });

    const r = await fetch(RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "comcoin_balance",
        method: "getTokenAccountsByOwner",
        params: [
          pubkey,
          { mint: MINT },
          { encoding: "jsonParsed" }
        ]
      })
    });

    const data = await r.json().catch(() => null);
    if (!r.ok) return json(res, 502, { error: "RPC error" });
    if (data?.error) return json(res, 502, { error: "RPC error" });

    const accounts = data?.result?.value || [];
    let uiAmount = 0;

    for (const acc of accounts) {
      const amt = acc?.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0;
      uiAmount += Number(amt || 0);
    }

    return json(res, 200, { ok: true, uiAmount });
  } catch (e) {
    return json(res, 500, { error: "Server error" });
  }
}

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}
