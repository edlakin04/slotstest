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

const outCard = document.getElementById("outCard");
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
  if (!provider?.isPhantom) throw new Error("Phantom not found. Install Phantom and refresh.");
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

async function refreshBalanceAndRank() {
  if (!publicKeyBase58) return;

  setMsg("Checking COM COIN balance…");
  const res = await fetch(`/api/balance?pubkey=${encodeURIComponent(publicKeyBase58)}`);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    setMsg(data?.error || "Balance check failed.", "bad");
    elBalance.textContent = "—";
    elRank.textContent = "—";
    if (rankBig) rankBig.textContent = "—";
    if (rankCallout) rankCallout.textContent = "Balance check failed.";
    btnGenerate.disabled = true;
    return;
  }

  const amt = Number(data.uiAmount || 0);
  elBalance.textContent = amt.toLocaleString("en-GB");

  const r = getRank(amt);
  elRank.textContent = r.name;

  if (rankBig) rankBig.textContent = r.name;

  const n = nextRank(amt);
  if (rankCallout) {
    if (amt <= 0) {
      rankCallout.innerHTML = `You own <b>no COM COIN</b>. Buy some to rank up.`;
    } else {
      rankCallout.innerHTML = `You are <b>${r.name}</b>. Next: <b>${n ? n.name : "MAXED"}</b>.`;
    }
  }

  const eligible = amt >= 0; // set to (amt >= 0) for testing
  btnGenerate.disabled = !eligible;

  setMsg(
    eligible ? "Eligible. Hit GENERATE." : "Hold COM COIN to generate (1/day).",
    eligible ? "ok" : "muted"
  );
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
    setMsg(e?.message || String(e), "bad");
  }
};

btnDisconnect.onclick = async () => {
  try { await requirePhantom().disconnect(); } catch {}
  publicKeyBase58 = null;

  elWallet.textContent = "Not connected";
  elBalance.textContent = "—";
  elRank.textContent = "—";
  if (rankBig) rankBig.textContent = "—";
  if (rankCallout) rankCallout.textContent = "Connect to see your holder level.";

  setConnectedUI(false);

  outCard.style.display = "none";
  outImg.removeAttribute("src");
  lastImageSrc = null;

  setMsg("");
};

btnGenerate.onclick = async () => {
  try {
    if (!publicKeyBase58) throw new Error("Connect Phantom first.");

    btnGenerate.disabled = true;
    btnCopyTweet.disabled = true;
    btnDownload.disabled = true;

    setMsg("Signing…");
    const provider = requirePhantom();
    const today = new Date().toISOString().slice(0, 10);
    const message = `COM COIN daily meme | ${today} | I own this wallet`;

    const encoded = new TextEncoder().encode(message);
    const signed = await provider.signMessage(encoded, "utf8");
    const signatureB58 = bs58.encode(signed.signature);

    setMsg("Generating image…");
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pubkey: publicKeyBase58, message, signature: signatureB58 })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Generate failed (HTTP ${res.status})`);

    const b64 = data.image_b64;
    if (!b64) throw new Error("No image data returned from server.");

    const mime = data.mime || "image/png";
    lastImageSrc = `data:${mime};base64,${b64}`;

    // show output area before image loads so user sees it
    outCard.style.display = "block";
    outImg.src = lastImageSrc;

    typeChip.textContent = data.type ? `TYPE: ${String(data.type).toUpperCase()}` : "";
    shillText.innerHTML = `Post it with <b>#ComCoin</b> • start shilling 🫡`;

    setMsg("Image ready. Save it + post it.", "ok");
    btnCopyTweet.disabled = false;
    btnDownload.disabled = false;

  } catch (e) {
    setMsg(e?.message || String(e), "bad");
  } finally {
    await refreshBalanceAndRank();
  }
};

btnCopyTweet.onclick = async () => {
  const text = `My COM COIN daily pull is in. #ComCoin start shilling 🫡`;
  await navigator.clipboard.writeText(text);
  setMsg("Tweet copied.", "ok");
};

btnDownload.onclick = async () => {
  if (!lastImageSrc) return;
  const a = document.createElement("a");
  a.href = lastImageSrc;
  a.download = `comcoin-${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setMsg("If mobile opens the image, use Share → Save.", "ok");
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

// Default view
showView("gen");
