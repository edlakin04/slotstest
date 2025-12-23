export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pubkey = url.searchParams.get("pubkey");
    if (!pubkey) return json(res, 400, { error: "Missing pubkey" });

    const RPC = process.env.HELIUS_RPC_URL;
    const MINT = process.env.COMCOIN_MINT;

    if (!RPC) return json(res, 500, { error: "Missing env var: HELIUS_RPC_URL" });
    if (!MINT) return json(res, 500, { error: "Missing env var: COMCOIN_MINT" });

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

    const data = await r.json();
    if (!r.ok) return json(res, 500, { error: `RPC HTTP ${r.status}` });
    if (data?.error) return json(res, 500, { error: data.error.message || "RPC error" });

    const accounts = data?.result?.value || [];
    let uiAmount = 0;

    for (const acc of accounts) {
      const amt = acc?.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0;
      uiAmount += Number(amt || 0);
    }

    return json(res, 200, { ok: true, uiAmount });
  } catch (e) {
    return json(res, 500, { error: String(e?.message || e) });
  }
}

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}
