import bs58 from "https://cdn.skypack.dev/bs58";

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

let publicKeyBase58 = null;
let lastImageB64 = null;

const RANKS = [
  { name: "Dust", min: 0 },
  { name: "Hodler", min: 1 },
  { name: "Shiller", min: 1000 },
  { name: "Chad", min: 10000 },
  { name: "Whale", min: 100000 },
];

function getRank(amount) {
  return [...RANKS].reverse().find(r => amount >= r.min) ?? RANKS[0];
}

function setMsg(s) { elMsg.textContent = s || ""; }

function requirePhantom() {
  const provider = window?.solana;
  if (!provider?.isPhantom) throw new Error("Phantom not found. Install Phantom and refresh.");
  return provider;
}

async function refreshBalance() {
  if (!publicKeyBase58) return;

  setMsg("Checking Com Coin balance…");
  const res = await fetch(`/api/balance?pubkey=${encodeURIComponent(publicKeyBase58)}`);
  const data = await res.json();

  if (!res.ok) {
    setMsg(data?.error || "Balance check failed.");
    elBalance.textContent = "—";
    elRank.textContent = "—";
    btnGenerate.disabled = true;
    return;
  }

  const amt = Number(data.uiAmount || 0);
  elBalance.textContent = amt.toLocaleString("en-GB");
  elRank.textContent = getRank(amt).name;

  // Gate: must hold > 0
  btnGenerate.disabled = !(amt > 0);
  setMsg(amt > 0 ? "Eligible. You can generate your daily pull." : "Buy Com Coin to unlock daily generation.");
}

btnConnect.onclick = async () => {
  try {
    const provider = requirePhantom();
    const resp = await provider.connect();
    publicKeyBase58 = resp.publicKey.toBase58();

    elWallet.textContent = publicKeyBase58;
    btnConnect.disabled = true;
    btnDisconnect.disabled = false;

    await refreshBalance();
  } catch (e) {
    setMsg(e?.message || String(e));
  }
};

btnDisconnect.onclick = async () => {
  try {
    const provider = requirePhantom();
    await provider.disconnect();
  } catch {}
  publicKeyBase58 = null;
  elWallet.textContent = "Not connected";
  elBalance.textContent = "—";
  elRank.textContent = "—";
  btnConnect.disabled = false;
  btnDisconnect.disabled = true;
  btnGenerate.disabled = true;
  btnCopyTweet.disabled = true;
  btnDownload.disabled = true;
  outCard.style.display = "none";
  setMsg("");
};

btnGenerate.onclick = async () => {
  try {
    if (!publicKeyBase58) throw new Error("Connect Phantom first.");

    btnGenerate.disabled = true;
    btnCopyTweet.disabled = true;
    btnDownload.disabled = true;
    setMsg("Signing message…");

    const provider = requirePhantom();
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const message = `Com Coin daily meme | ${today} | I own this wallet`;

    const encoded = new TextEncoder().encode(message);
    const signed = await provider.signMessage(encoded, "utf8");
    const signatureB58 = bs58.encode(signed.signature);

    setMsg("Generating image (can take a bit)…");

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pubkey: publicKeyBase58,
        message,
        signature: signatureB58,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Generate failed.");

    lastImageB64 = data.image_b64;
    const mime = data.mime || "image/png";
    outImg.src = `data:${mime};base64,${lastImageB64}`;

    const lines = [
      "Your Com Coin daily pull is ready.",
      "Post it on Twitter with #ComCoin",
      "start shilling 🫡",
    ];
    shillText.textContent = lines.join(" ");

    outCard.style.display = "block";
    setMsg("Done. Go farm the timeline.");

    btnCopyTweet.disabled = false;
    btnDownload.disabled = false;
  } catch (e) {
    setMsg(e?.message || String(e));
  } finally {
    // Re-enable only if they still qualify
    await refreshBalance();
  }
};

btnCopyTweet.onclick = async () => {
  const text = `My Com Coin daily pull is in. #ComCoin start shilling 🫡`;
  await navigator.clipboard.writeText(text);
  setMsg("Tweet text copied.");
};

btnDownload.onclick = async () => {
  if (!lastImageB64) return;
  const a = document.createElement("a");
  a.href = outImg.src;
  a.download = `comcoin-${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
};
