import bs58 from "https://cdn.skypack.dev/bs58";

const tabGen = document.getElementById("tabGen");
const tabRank = document.getElementById("tabRank");
const viewGen = document.getElementById("viewGen");
const viewRank = document.getElementById("viewRank");

const btnConnect = document.getElementById("btnConnect");
const btnDisconnect = document.getElementById("btnDisconnect");
const btnGenerate = document.getElementById("btnGenerate");
const btnCopyTweet = document.getElementById("btnCopyTweet");
const btnDownload = document.getElementById("btnDownload");

const elWallet = document.getElementById("wallet");
const elBalance = document.getElementById("balance");
const elRank = document.getElementById("rank");
const elMsg = document.getElementById("msg");

const outWrap = document.getElementById("outWrap");
const outImg = document.getElementById("outImg");
const shillText = document.getElementById("shillText");
const typeChip = document.getElementById("typeChip");

const rankBig = document.getElementById("rankBig");
const rankCallout = document.getElementById("rankCallout");

let publicKeyBase58 = null;
let lastImageSrc = null;

const RANKS = [
  { name: "Dust", min: 0 },
  { name: "Hodler", min: 1 },
  { name: "Shiller", min: 1_000 },
  { name: "Chad", min: 10_000 },
  { name: "Whale", min: 100_000 },
];

function getRank(amount) {
  return [...RANKS].reverse().find(r => amount >= r.min) ?? RANKS[0];
}
function nextRank(amount) {
  return RANKS.find(r => r.min > amount) || null;
}

function setMsg(text, kind = "muted") {
  elMsg.classList.remove("ok", "bad");
  if (kind === "ok") elMsg.classList.add("ok");
  if (kind === "bad") elMsg.classList.add("bad");
  elMsg.textContent = text || "";
}

function requirePhantom() {
  const provider = window?.solana;
  if (!provider?.isPhantom) throw new Error("PHANTOM NOT FOUND. INSTALL PHANTOM AND REFRESH.");
  return provider;
}

function setConnectedUI(connected) {
  btnConnect.disabled = connected;
  btnDisconnect.disabled = !connected;
  if (!connected) {
    btnGenerate.disabled = true;
    btnCopyTweet.disabled = true;
    btnDownload.disabled = true;
  }
}

function showView(which) {
  const gen = which === "gen";
  viewGen.classList.toggle("hidden", !gen);
  viewRank.classList.toggle("hidden", gen);
  tabGen.classList.toggle("active", gen);
  tabRank.classList.toggle("active", !gen);
}

tabGen.onclick = () => showView("gen");
tabRank.onclick = () => showView("rank");

async function refreshBalanceAndRank({ quiet = false } = {}) {
  if (!publicKeyBase58) return;

  if (!quiet) setMsg("CHECKING $COMCOIN BALANCE…");

  const res = await fetch(`/api/balance?pubkey=${encodeURIComponent(publicKeyBase58)}`);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (!quiet) setMsg((data?.error || "BALANCE CHECK FAILED.").toUpperCase(), "bad");
    elBalance.textContent = "—";
    elRank.textContent = "—";
    rankBig.textContent = "—";
    rankCallout.textContent = "BALANCE CHECK FAILED.";
    btnGenerate.disabled = true;
    return;
  }

  const amt = Number(data.uiAmount || 0);
  elBalance.textContent = amt.toLocaleString("en-GB");

  const r = getRank(amt);
  elRank.textContent = r.name;
  rankBig.textContent = r.name;

  const n = nextRank(amt);
  if (amt <= 0) {
    rankCallout.innerHTML = `YOU OWN <b>NO $COMCOIN</b>. BUY SOME TO RANK UP.`;
  } else {
    rankCallout.innerHTML = `YOU ARE <b>${r.name}</b>. NEXT: <b>${n ? n.name : "MAXED"}</b>.`;
  }

  const eligible = amt > 0; // set to (amt >= 0) for testing
  btnGenerate.disabled = !eligible;

  // ✅ IMPORTANT: only set the “eligible” message if not quiet
  if (!quiet) {
    setMsg(
      eligible ? "ELIGIBLE. HIT GENERATE." : "HOLD $COMCOIN TO GENERATE (1/DAY).",
      eligible ? "ok" : "muted"
    );
  }
}

async function connectPhantom(opts) {
  const provider = requirePhantom();
  const resp = await provider.connect(opts);
  publicKeyBase58 = resp.publicKey.toBase58();
  elWallet.textContent = publicKeyBase58;
  setConnectedUI(true);
  await refreshBalanceAndRank();
}

btnConnect.onclick = async () => {
  try {
    await connectPhantom();
  } catch (e) {
    setMsg(String(e?.message || e).toUpperCase(), "bad");
  }
};

btnDisconnect.onclick = async () => {
  try { await requirePhantom().disconnect(); } catch {}
  publicKeyBase58 = null;

  elWallet.textContent = "NOT CONNECTED";
  elBalance.textContent = "—";
  elRank.textContent = "—";
  rankBig.textContent = "—";
  rankCallout.textContent = "CONNECT TO SEE YOUR HOLDER LEVEL.";

  setConnectedUI(false);

  outWrap.style.display = "none";
  outImg.removeAttribute("src");
  lastImageSrc = null;

  setMsg("");
};

btnGenerate.onclick = async () => {
  try {
    if (!publicKeyBase58) throw new Error("CONNECT PHANTOM FIRST.");

    // keep output visible if it already exists; otherwise hide until we have a result
    if (!lastImageSrc) outWrap.style.display = "none";

    btnGenerate.disabled = true;
    btnCopyTweet.disabled = true;
    btnDownload.disabled = true;

    setMsg("SIGNING…");
    const provider = requirePhantom();
    const today = new Date().toISOString().slice(0, 10);
    const message = `COM COIN daily meme | ${today} | I own this wallet`;

    const encoded = new TextEncoder().encode(message);
    const signed = await provider.signMessage(encoded, "utf8");
    const signatureB58 = bs58.encode(signed.signature);

    setMsg("GENERATING IMAGE…");

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pubkey: publicKeyBase58, message, signature: signatureB58 })
    });

    const data = await res.json().catch(() => ({}));

    // Debug: if it fails you will SEE it now (no overwrite)
    if (!res.ok) {
      console.error("GENERATE FAILED:", res.status, data);
      throw new Error((data?.error || `GENERATE FAILED (HTTP ${res.status})`).toString());
    }

    const b64 = data.image_b64;
    if (!b64) {
      console.error("NO image_b64 in response:", data);
      throw new Error("NO IMAGE DATA RETURNED FROM SERVER.");
    }

    const mime = data.mime || "image/png";
    lastImageSrc = `data:${mime};base64,${b64}`;

    // ✅ THIS IS THE DISPLAY: set src + show container
    outImg.src = lastImageSrc;
    outWrap.style.display = "block";

    typeChip.textContent = data.type ? `TYPE: ${String(data.type).toUpperCase()}` : "TYPE: ???";
    shillText.textContent = "POST IT • START SHILLING 🫡 • $COMCOIN";

    setMsg("GENERATED. SAVE IT + POST IT.", "ok");
    btnCopyTweet.disabled = false;
    btnDownload.disabled = false;

  } catch (e) {
    setMsg(String(e?.message || e).toUpperCase(), "bad");
  } finally {
    // ✅ IMPORTANT: update numbers/buttons without overwriting the “GENERATED/ERROR” message
    await refreshBalanceAndRank({ quiet: true });
  }
};

btnCopyTweet.onclick = async () => {
  const text = `MY COM COIN DAILY PULL IS IN. $COMCOIN START SHILLING 🫡`;
  await navigator.clipboard.writeText(text);
  setMsg("TWEET COPIED.", "ok");
};

btnDownload.onclick = async () => {
  if (!lastImageSrc) return;
  const a = document.createElement("a");
  a.href = lastImageSrc;
  a.download = `comcoin-${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setMsg("IF MOBILE OPENS IMAGE: SHARE → SAVE.", "ok");
};

// Auto-reconnect on load
(async function autoReconnect() {
  try {
    const provider = window?.solana;
    if (!provider?.isPhantom) return;
    await connectPhantom({ onlyIfTrusted: true });
  } catch {
    setConnectedUI(false);
  }
})();

showView("gen");
