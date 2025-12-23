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
  if (!elMsg) return;
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

  const eligible = amt > 0;
  btnGenerate.disabled = !eligible;

  setMsg(
    eligible ? "Eligible. Pull your daily pixel meme." : "Not eligible yet. Hold COM COIN to unlock daily generation.",
    eligible ? "ok" : "muted"
  );
}

btnConnect?.addEventListener("click", async () => {
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

btnDisconnect?.addEventListener("click", async () => {
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
  outImg.removeAttribute("src");
  lastImageSrc = null;

  setMsg("");
});

btnGenerate?.addEventListener("click", async () => {
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

    setMsg("Generating image… (this can take a bit)");

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pubkey: publicKeyBase58, message, signature: signatureB58 })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Generate failed.");

    const mime = data.mime || "image/png";
    lastImageSrc = `data:${mime};base64,${data.image_b64}`;
    outImg.src = lastImageSrc;

    const lines = [
      "Post it on Twitter with #ComCoin.",
      "Start shilling 🫡",
      "(Bonus points if you pin it.)"
    ];
    if (shillText) shillText.textContent = lines.join(" ");

    outCard.style.display = "block";
    setMsg(`Done. You pulled: ${data.type}. Go farm the timeline.`, "ok");

    btnCopyTweet.disabled = false;
    btnDownload.disabled = false;

  } catch (e) {
    setMsg(e?.message || String(e), "bad");
  } finally {
    await refreshBalance();
  }
});

btnCopyTweet?.addEventListener("click", async () => {
  const text = `My COM COIN daily pull is in. #ComCoin start shilling 🫡`;
  await navigator.clipboard.writeText(text);
  setMsg("Tweet text copied.", "ok");
});

btnDownload?.addEventListener("click", async () => {
  if (!lastImageSrc) return;
  const a = document.createElement("a");
  a.href = lastImageSrc;
  a.download = `comcoin-${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
});
