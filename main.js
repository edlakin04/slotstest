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
  { name: "Whale", min: 100_000 }
];

/* ---------------- UI helpers ---------------- */

function setMsg(text = "", kind = "") {
  elMsg.classList.remove("ok", "bad");
  if (kind === "ok") elMsg.classList.add("ok");
  if (kind === "bad") elMsg.classList.add("bad");
  elMsg.textContent = text;
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

function isMobile() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "");
}

// Opens your current site inside Phantom mobile browser
function openInPhantom() {
  const url = window.location.href;
  const deepLink = `https://phantom.app/ul/browse/${encodeURIComponent(url)}`;
  window.location.href = deepLink;
}

function requirePhantomOrDeepLink() {
  const p = window?.solana;
  if (p?.isPhantom) return p;

  // If on mobile Safari/Chrome, Phantom provider usually doesn't exist.
  if (isMobile()) {
    setMsg("OPENING IN PHANTOM…", "ok");
    openInPhantom();
    throw new Error("Open in Phantom to connect.");
  }

  throw new Error("PHANTOM WALLET NOT FOUND");
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

function getRank(amount) {
  return [...RANKS].reverse().find(r => amount >= r.min) || RANKS[0];
}

function nextRank(amount) {
  return RANKS.find(r => r.min > amount) || null;
}

/* ---------------- Wallet ---------------- */

async function connectPhantom(opts) {
  const provider = requirePhantomOrDeepLink();
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
    setMsg(e.message, "bad");
  }
};

btnDisconnect.onclick = async () => {
  try { await window?.solana?.disconnect(); } catch {}
  publicKeyBase58 = null;

  elWallet.textContent = "Not connected";
  elBalance.textContent = "—";
  elRank.textContent = "—";
  rankBig.textContent = "—";
  rankCallout.textContent = "CONNECT TO SEE YOUR HOLDER LEVEL.";

  outWrap.style.display = "none";
  outImg.removeAttribute("src");
  lastImageSrc = null;

  setConnectedUI(false);
  setMsg("");
};

/* ---------------- Balance + Rank ---------------- */

async function refreshBalanceAndRank({ quiet = false } = {}) {
  if (!publicKeyBase58) return;

  if (!quiet) setMsg("CHECKING $COMCOIN BALANCE…");

  const res = await fetch(`/api/balance?pubkey=${encodeURIComponent(publicKeyBase58)}`);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}

  if (!res.ok) {
    if (!quiet) setMsg(data?.error || text || "BALANCE CHECK FAILED", "bad");
    btnGenerate.disabled = true;
    return;
  }

  const amt = Number(data.uiAmount || 0);
  elBalance.textContent = amt.toLocaleString("en-GB");

  const r = getRank(amt);
  elRank.textContent = r.name;
  rankBig.textContent = r.name;

  const n = nextRank(amt);
  rankCallout.textContent =
    amt <= 0
      ? "YOU OWN NO $COMCOIN. BUY SOME TO RANK UP."
      : `YOU ARE ${r.name}. NEXT: ${n ? n.name : "MAXED"}`;

  const eligible = amt >= 0; // set >=0 for testing if you want
  btnGenerate.disabled = !eligible;

  if (!quiet) {
    setMsg(
      eligible ? "ELIGIBLE. HIT GENERATE." : "HOLD $COMCOIN TO GENERATE.",
      eligible ? "ok" : ""
    );
  }
}

/* ---------------- Generate ---------------- */

btnGenerate.onclick = async () => {
  try {
    if (!publicKeyBase58) throw new Error("CONNECT WALLET FIRST");

    btnGenerate.disabled = true;
    btnCopyTweet.disabled = true;
    btnDownload.disabled = true;

    setMsg("SIGN MESSAGE…");

    const provider = requirePhantomOrDeepLink();
    const today = new Date().toISOString().slice(0, 10);
    const message = `COM COIN daily meme | ${today}`;

    const encoded = new TextEncoder().encode(message);
    const signed = await provider.signMessage(encoded, "utf8");
    const signature = bs58.encode(signed.signature);

    setMsg("GENERATING IMAGE…");

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pubkey: publicKeyBase58,
        message,
        signature
      })
    });

    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}

    if (!res.ok) throw new Error(data?.error || text || `HTTP ${res.status}`);
    if (!data?.image_b64) throw new Error("NO IMAGE DATA RETURNED");

    lastImageSrc = `data:${data.mime || "image/png"};base64,${data.image_b64}`;

    outImg.src = lastImageSrc;
    outWrap.style.display = "block";

    typeChip.textContent = `TYPE: ${String(data.type || "").toUpperCase()}`;
    shillText.textContent = "START SHILLING TODAY • $COMCOIN";

    btnCopyTweet.disabled = false;
    btnDownload.disabled = false;

    setMsg("GENERATED. SAVE IT + POST IT.", "ok");
  } catch (e) {
    setMsg(String(e.message || e), "bad");
  } finally {
    await refreshBalanceAndRank({ quiet: true });
  }
};

/* ---------------- Extras ---------------- */

btnCopyTweet.onclick = async () => {
  await navigator.clipboard.writeText("MY COM COIN DAILY PULL IS IN. $COMCOIN START SHILLING 🫡");
  setMsg("TWEET COPIED.", "ok");
};

btnDownload.onclick = () => {
  if (!lastImageSrc) return;
  const a = document.createElement("a");
  a.href = lastImageSrc;
  a.download = `comcoin-${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
};

/* ---------------- Auto reconnect ---------------- */

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
