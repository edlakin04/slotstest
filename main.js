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
const typeChip = document.getElementById("typeChip");

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

function setMsg(text, kind = "muted") {
  elMsg.classList.remove("ok", "bad");
  if (kind === "ok") elMsg.classList.add("ok");
  if (kind === "bad") elMsg.classList.add("bad");
  elMsg.textContent = text || "";
  // also log for debugging
  if (kind === "bad") console.error(text);
}

function requirePhantom() {
  const provider = window?.solana;
  if (!provider?.isPhantom) throw new Error("Phantom not found. Install Phantom and refresh.");
  return provider;
}

async function refreshBalance() {
  if (!publicKeyBase58) return;

  setMsg("Checking COM COIN balance…");
  const res = await fetch(`/api/balance?pubkey=${encodeURIComponent(publicKeyBase58)}`);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    setMsg(data?.error || "Balance check failed.", "bad");
    elBalance.textContent = "—";
    elRank.textContent = "—";
    btnGenerate.disabled = true;
    return;
  }

  const amt = Number(data.uiAmount || 0);
  elBalance.textContent = amt.toLocaleString("en-GB");
  elRank.textContent = getRank(amt).name;

  const eligible = amt >= 0; // <-- minimum required to generate
  btnGenerate.disabled = !eligible;

  setMsg(
    eligible ? "Eligible. Hit GENERATE." : "Not eligible yet — hold COM COIN to unlock the daily pull.",
    eligible ? "ok" : "muted"
  );
}

btnConnect.addEventListener("click", async () => {
  try {
    const provider = requirePhantom();
    const resp = await provider.connect();
    publicKeyBase58 = resp.publicKey.toBase58();

    elWallet.textContent = publicKeyBase58;
    btnConnect.disabled = true;
    btnDisconnect.disabled = false;

    await refreshBalance();
  } catch (e) {
    setMsg(e?.message || String(e), "bad");
  }
});

btnDisconnect.addEventListener("click", async () => {
  try {
    await requirePhantom().disconnect();
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
  outImg.removeAttribute("src");
  lastImageSrc = null;

  setMsg("");
});

btnGenerate.addEventListener("click", async () => {
  try {
    if (!publicKeyBase58) throw new Error("Connect Phantom first.");

    btnGenerate.disabled = true;
    btnCopyTweet.disabled = true;
    btnDownload.disabled = true;

    setMsg("Signing message…");
    const provider = requirePhantom();
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
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
    if (!res.ok) {
      // show the real error
      throw new Error(data?.error || `Generate failed (HTTP ${res.status})`);
    }

    const mime = data.mime || "image/png";
    lastImageSrc = `data:${mime};base64,${data.image_b64}`;

    outImg.src = lastImageSrc;
    outCard.style.display = "block";

    if (typeChip) typeChip.textContent = data.type ? `TYPE: ${String(data.type).toUpperCase()}` : "";

    if (shillText) {
      shillText.innerHTML = `<b>Now:</b> post it with <span class="mono">#ComCoin</span> • start shilling 🫡`;
    }

    setMsg("Image ready. Save it + post it.", "ok");
    btnCopyTweet.disabled = false;
    btnDownload.disabled = false;

  } catch (e) {
    setMsg(e?.message || String(e), "bad");
  } finally {
    // re-check eligibility (and daily limit is enforced server-side)
    await refreshBalance();
  }
});

btnCopyTweet.addEventListener("click", async () => {
  const text = `My COM COIN daily pull is in. #ComCoin start shilling 🫡`;
  await navigator.clipboard.writeText(text);
  setMsg("Tweet copied.", "ok");
});

btnDownload.addEventListener("click", async () => {
  if (!lastImageSrc) return;

  // Best-effort "save" for both desktop and mobile:
  // - Desktop: anchor download works
  // - Some mobile browsers: opens image; user taps Save/Share
  const a = document.createElement("a");
  a.href = lastImageSrc;
  a.download = `comcoin-${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setMsg("If your phone opens the image, use Share/Save to Photos.", "ok");
});
