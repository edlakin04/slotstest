import bs58 from "https://cdn.skypack.dev/bs58";

const tabGen = document.getElementById("tabGen");
const tabRank = document.getElementById("tabRank");
const tabCards = document.getElementById("tabCards");

const viewGen = document.getElementById("viewGen");
const viewRank = document.getElementById("viewRank");
const viewCards = document.getElementById("viewCards");
const viewWallet = document.getElementById("viewWallet");

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
const cardMetaMini = document.getElementById("cardMetaMini");

const rankBig = document.getElementById("rankBig");
const rankCallout = document.getElementById("rankCallout");
const rankCardsMsg = document.getElementById("rankCardsMsg");
const rankMiniGrid = document.getElementById("rankMiniGrid");

const cardsSort = document.getElementById("cardsSort");
const btnRefreshCards = document.getElementById("btnRefreshCards");
const cardsMsg = document.getElementById("cardsMsg");
const cardsGrid = document.getElementById("cardsGrid");
const searchCardId = document.getElementById("searchCardId");
const btnSearchCard = document.getElementById("btnSearchCard");

const cardsBigTitle = document.getElementById("cardsBigTitle");

const walletPageSub = document.getElementById("walletPageSub");
const walletRankBig = document.getElementById("walletRankBig");
const walletRankCallout = document.getElementById("walletRankCallout");
const walletCardsMsg = document.getElementById("walletCardsMsg");
const walletCardsGrid = document.getElementById("walletCardsGrid");
const btnBackToCards = document.getElementById("btnBackToCards");

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
  if (!elMsg) return;
  elMsg.classList.remove("ok", "bad");
  if (kind === "ok") elMsg.classList.add("ok");
  if (kind === "bad") elMsg.classList.add("bad");
  elMsg.textContent = text;
}

function setCardsMsg(text = "", kind = "") {
  if (!cardsMsg) return;
  cardsMsg.classList.remove("ok", "bad");
  if (kind === "ok") cardsMsg.classList.add("ok");
  if (kind === "bad") cardsMsg.classList.add("bad");
  cardsMsg.textContent = text;
}

function setCardsBigTitle(sort) {
  if (!cardsBigTitle) return;
  const s = (sort || "trending").toUpperCase();
  cardsBigTitle.textContent = s;
}

function showView(which) {
  const gen = which === "gen";
  const rank = which === "rank";
  const cards = which === "cards";
  const wallet = which === "wallet";

  viewGen?.classList.toggle("hidden", !gen);
  viewRank?.classList.toggle("hidden", !rank);
  viewCards?.classList.toggle("hidden", !cards);
  viewWallet?.classList.toggle("hidden", !wallet);

  tabGen?.classList.toggle("active", gen);
  tabRank?.classList.toggle("active", rank);
  tabCards?.classList.toggle("active", cards);
}

tabGen && (tabGen.onclick = () => showView("gen"));
tabRank && (tabRank.onclick = async () => {
  showView("rank");
  await loadRankCards();
});
tabCards && (tabCards.onclick = async () => {
  showView("cards");
  const sort = cardsSort?.value || "trending";
  setCardsBigTitle(sort);
  await loadBoard(sort);
});

function isMobile() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "");
}

function openInPhantom() {
  const url = window.location.href;
  const deepLink = `https://phantom.app/ul/browse/${encodeURIComponent(url)}`;
  window.location.href = deepLink;
}

function requirePhantomOrDeepLink() {
  const p = window?.solana;
  if (p?.isPhantom) return p;

  if (isMobile()) {
    setMsg("OPENING IN PHANTOM…", "ok");
    openInPhantom();
    throw new Error("Open in Phantom to connect.");
  }

  throw new Error("PHANTOM WALLET NOT FOUND");
}

function setConnectedUI(connected) {
  if (btnConnect) btnConnect.disabled = connected;
  if (btnDisconnect) btnDisconnect.disabled = !connected;
  if (!connected) {
    if (btnGenerate) btnGenerate.disabled = true;
    if (btnCopyTweet) btnCopyTweet.disabled = true;
    if (btnDownload) btnDownload.disabled = true;
  }
}

function getRank(amount) {
  return [...RANKS].reverse().find(r => amount >= r.min) || RANKS[0];
}

function nextRank(amount) {
  return RANKS.find(r => r.min > amount) || null;
}

function shortWallet(w) {
  if (!w || w.length < 10) return w || "";
  return `${w.slice(0, 4)}…${w.slice(-4)}`;
}

function fmtTime(ts) {
  try {
    const d = new Date(ts);
    return d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

/* ---------------- Wallet ---------------- */

async function connectPhantom(opts) {
  const provider = requirePhantomOrDeepLink();
  const resp = await provider.connect(opts);
  publicKeyBase58 = resp.publicKey.toBase58();
  if (elWallet) elWallet.textContent = publicKeyBase58;
  setConnectedUI(true);
  await refreshBalanceAndRank();
  if (!viewRank?.classList.contains("hidden")) await loadRankCards();
}

btnConnect && (btnConnect.onclick = async () => {
  try {
    await connectPhantom();
  } catch (e) {
    setMsg(e.message, "bad");
  }
});

btnDisconnect && (btnDisconnect.onclick = async () => {
  try { await window?.solana?.disconnect(); } catch {}
  publicKeyBase58 = null;

  if (elWallet) elWallet.textContent = "Not connected";
  if (elBalance) elBalance.textContent = "—";
  if (elRank) elRank.textContent = "—";
  if (rankBig) rankBig.textContent = "—";
  if (rankCallout) rankCallout.textContent = "CONNECT TO SEE YOUR HOLDER LEVEL.";

  if (outWrap) outWrap.style.display = "none";
  if (outImg) outImg.removeAttribute("src");
  lastImageSrc = null;

  if (cardMetaMini) cardMetaMini.style.display = "none";

  setConnectedUI(false);
  setMsg("");

  if (rankCardsMsg) rankCardsMsg.textContent = "CONNECT TO LOAD YOUR COM CARDS.";
  if (rankMiniGrid) rankMiniGrid.innerHTML = "";
});

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
    if (btnGenerate) btnGenerate.disabled = true;
    return;
  }

  const amt = Number(data.uiAmount || 0);
  if (elBalance) elBalance.textContent = amt.toLocaleString("en-GB");

  const r = getRank(amt);
  if (elRank) elRank.textContent = r.name;
  if (rankBig) rankBig.textContent = r.name;

  const n = nextRank(amt);
  if (rankCallout) {
    rankCallout.textContent =
      amt <= 0
        ? "YOU OWN NO $COMCOIN. BUY SOME TO RANK UP."
        : `YOU ARE ${r.name}. NEXT: ${n ? n.name : "MAXED"}`;
  }

  const eligible = amt > 0; // set >=0 for testing if you want
  if (btnGenerate) btnGenerate.disabled = !eligible;

  if (!quiet) {
    setMsg(
      eligible ? "ELIGIBLE. HIT GENERATE." : "HOLD $COMCOIN TO GENERATE.",
      eligible ? "ok" : ""
    );
  }
}

/* ---------------- Generate ---------------- */

btnGenerate && (btnGenerate.onclick = async () => {
  try {
    if (!publicKeyBase58) throw new Error("CONNECT WALLET FIRST");

    btnGenerate.disabled = true;
    if (btnCopyTweet) btnCopyTweet.disabled = true;
    if (btnDownload) btnDownload.disabled = true;

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
      body: JSON.stringify({ pubkey: publicKeyBase58, message, signature })
    });

    const rawText = await res.text();
    let data = null;
    try { data = JSON.parse(rawText); } catch {}

    if (!res.ok) throw new Error(data?.error || rawText || `HTTP ${res.status}`);

    const urlFromApi = data?.imageUrl || data?.image_url || null;

    let imgSrc = null;
    if (urlFromApi) {
      imgSrc = `${urlFromApi}${urlFromApi.includes("?") ? "&" : "?"}v=${Date.now()}`;
    } else if (data?.image_b64) {
      imgSrc = `data:${data.mime || "image/png"};base64,${data.image_b64}`;
    } else if (data?.b64_json) {
      imgSrc = `data:image/png;base64,${data.b64_json}`;
    }

    if (!imgSrc) throw new Error("NO IMAGE DATA RETURNED");

    lastImageSrc = imgSrc;

    if (outImg) {
      outImg.onerror = () => {
        setMsg("IMAGE SAVED BUT CAN’T LOAD IT. SIGNED URL FAILED.", "bad");
      };
      outImg.src = lastImageSrc;
    }
    if (outWrap) outWrap.style.display = "block";

    if (shillText) shillText.textContent = "START SHILLING TODAY • $COMCOIN";

    if (cardMetaMini) {
      if (data?.cardId || data?.name) {
        const parts = [];
        if (data?.name) parts.push(data.name.toString().toUpperCase());
        if (data?.cardId) parts.push(data.cardId.toString().toUpperCase());
        cardMetaMini.textContent = parts.join(" • ");
        cardMetaMini.style.display = "inline-block";
      } else {
        cardMetaMini.style.display = "none";
      }
    }

    if (btnCopyTweet) btnCopyTweet.disabled = false;
    if (btnDownload) btnDownload.disabled = false;

    setMsg("GENERATED. SAVE IT + POST IT.", "ok");

    if (!viewCards?.classList.contains("hidden")) {
      const sort = cardsSort?.value || "trending";
      setCardsBigTitle(sort);
      await loadBoard(sort);
    }
    if (!viewRank?.classList.contains("hidden")) {
      await loadRankCards();
    }
  } catch (e) {
    setMsg(String(e.message || e), "bad");
  } finally {
    await refreshBalanceAndRank({ quiet: true });
  }
});

/* ---------------- Extras ---------------- */

btnCopyTweet && (btnCopyTweet.onclick = async () => {
  await navigator.clipboard.writeText("MY COM COIN DAILY PULL IS IN. $COMCOIN START SHILLING 🫡");
  setMsg("TWEET COPIED.", "ok");
});

btnDownload && (btnDownload.onclick = () => {
  if (!lastImageSrc) return;
  const a = document.createElement("a");
  a.href = lastImageSrc;
  a.download = `comcoin-${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
});

/* ---------------- COM CARDS BOARD ---------------- */

btnRefreshCards && (btnRefreshCards.onclick = async () => {
  const sort = cardsSort?.value || "trending";
  setCardsBigTitle(sort);
  await loadBoard(sort);
});

cardsSort && (cardsSort.onchange = async () => {
  const sort = cardsSort.value || "trending";
  setCardsBigTitle(sort);
  await loadBoard(sort);
});

btnSearchCard && (btnSearchCard.onclick = async () => {
  const id = (searchCardId?.value || "").trim();
  if (!id) return setCardsMsg("ENTER A CARD ID.", "bad");
  await searchById(id);
});

btnBackToCards && (btnBackToCards.onclick = async () => {
  showView("cards");
  const sort = cardsSort?.value || "trending";
  setCardsBigTitle(sort);
  await loadBoard(sort);
});

async function loadBoard(sort) {
  try {
    setCardsMsg("LOADING COM CARDS…");
    if (cardsGrid) cardsGrid.innerHTML = "";

    const res = await fetch(`/api/cards_list?sort=${encodeURIComponent(sort)}&limit=100`);
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}

    if (!res.ok) throw new Error(data?.error || text || "FAILED TO LOAD CARDS");

    const items = data?.items || [];
    if (!items.length) {
      setCardsMsg("NO COM CARDS YET. GO GENERATE ONE.", "");
      return;
    }

    setCardsMsg(`SHOWING ${items.length}`, "ok");
    renderCards(cardsGrid, items, { showWalletLink: true });
  } catch (e) {
    setCardsMsg(String(e.message || e), "bad");
  }
}

async function searchById(cardId) {
  try {
    setCardsMsg("SEARCHING…");
    if (cardsGrid) cardsGrid.innerHTML = "";

    const res = await fetch(`/api/card_get?id=${encodeURIComponent(cardId)}`);
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}

    if (!res.ok) throw new Error(data?.error || text || "NOT FOUND");

    const item = data?.item;
    if (!item) throw new Error("NOT FOUND");

    setCardsMsg(`FOUND ${item.id}`, "ok");
    renderCards(cardsGrid, [item], { showWalletLink: true });
  } catch (e) {
    setCardsMsg(String(e.message || e), "bad");
  }
}

function renderCards(container, items, opts = {}) {
  if (!container) return;
  container.innerHTML = "";

  for (const it of items) {
    const card = document.createElement("div");
    card.className = "card px-border-soft";

    const img = document.createElement("img");
    img.className = "cardImg";
    img.alt = it.name || "COM CARD";
    img.src = it.imageUrl || it.image_url || "";
    card.appendChild(img);

    const name = document.createElement("div");
    name.className = "cardName";
    name.textContent = (it.name || "COM CARD").toString().toUpperCase();
    card.appendChild(name);

    const meta = document.createElement("div");
    meta.className = "cardMeta";

    const owner = it.owner_wallet || it.ownerWallet || "";
    const id = it.id || it.cardId || "";
    const up = Number(it.upvotes ?? 0);
    const down = Number(it.downvotes ?? 0);
    const score = (typeof it.score === "number") ? it.score : (up - down);

    const ownerSpan = document.createElement("span");
    ownerSpan.className = opts.showWalletLink ? "linkLike" : "";
    ownerSpan.textContent = shortWallet(owner);
    if (opts.showWalletLink) {
      ownerSpan.onclick = async () => {
        await openWalletPage(owner);
      };
    }

    meta.innerHTML = `
      ID: <span class="linkLike" data-card="${escapeHtml(id)}">${escapeHtml(id)}</span><br/>
      OWNER: <span id="owner-holder"></span><br/>
      DATE: ${escapeHtml(fmtTime(it.created_at || it.createdAt))}<br/>
    `;
    meta.querySelector('[data-card]')?.addEventListener("click", async () => {
      if (!id) return;
      showView("cards");
      if (searchCardId) searchCardId.value = id;
      await searchById(id);
    });
    meta.querySelector("#owner-holder")?.replaceWith(ownerSpan);

    card.appendChild(meta);

    const voteRow = document.createElement("div");
    voteRow.className = "voteRow";

    const pill = document.createElement("div");
    pill.className = "pill";
    pill.textContent = `SCORE: ${score}  (▲${up} ▼${down})`;

    const btns = document.createElement("div");
    btns.className = "voteBtns";

    const upBtn = document.createElement("button");
    upBtn.className = "btn";
    upBtn.textContent = "UP";

    const downBtn = document.createElement("button");
    downBtn.className = "btn";
    downBtn.textContent = "DOWN";

    upBtn.onclick = async () => { await voteCard(id, +1, pill); };
    downBtn.onclick = async () => { await voteCard(id, -1, pill); };

    btns.appendChild(upBtn);
    btns.appendChild(downBtn);

    voteRow.appendChild(pill);
    voteRow.appendChild(btns);

    card.appendChild(voteRow);
    container.appendChild(card);
  }
}

async function voteCard(cardId, vote, pillEl) {
  try {
    if (!publicKeyBase58) {
      setCardsMsg("CONNECT WALLET TO VOTE.", "bad");
      showView("gen");
      return;
    }

    setCardsMsg("SIGN TO VOTE…");

    const provider = requirePhantomOrDeepLink();
    const today = new Date().toISOString().slice(0, 10);
    const message = `COM COIN vote | ${cardId} | ${vote} | ${today}`;

    const encoded = new TextEncoder().encode(message);
    const signed = await provider.signMessage(encoded, "utf8");
    const signature = bs58.encode(signed.signature);

    const res = await fetch("/api/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId, vote, pubkey: publicKeyBase58, message, signature })
    });

    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}

    if (!res.ok) throw new Error(data?.error || text || "VOTE FAILED");

    const up = Number(data?.upvotes ?? 0);
    const down = Number(data?.downvotes ?? 0);
    const score = Number(data?.score ?? (up - down));

    if (pillEl) pillEl.textContent = `SCORE: ${score}  (▲${up} ▼${down})`;
    setCardsMsg("VOTED.", "ok");
  } catch (e) {
    setCardsMsg(String(e.message || e), "bad");
  }
}

async function openWalletPage(wallet) {
  showView("wallet");
  walletPageSub.textContent = `WALLET: ${wallet}`;
  walletCardsMsg.textContent = "LOADING WALLET CARDS…";
  walletCardsGrid.innerHTML = "";

  const isMe = publicKeyBase58 && wallet === publicKeyBase58;

  if (isMe) {
    walletRankBig.textContent = rankBig?.textContent || "—";
    walletRankCallout.textContent = rankCallout?.textContent || "—";
  } else {
    walletRankBig.textContent = "HOLDER";
    walletRankCallout.textContent = "THIS IS A COM CARDS PROFILE. (BALANCE RANK IS PRIVATE)";
  }

  try {
    const res = await fetch(`/api/wallet_cards?wallet=${encodeURIComponent(wallet)}&limit=100`);
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}

    if (!res.ok) throw new Error(data?.error || text || "FAILED TO LOAD WALLET CARDS");

    const items = data?.items || [];
    if (!items.length) {
      walletCardsMsg.textContent = "NO COM CARDS YET.";
      return;
    }

    walletCardsMsg.textContent = `SHOWING ${items.length} COM CARDS.`;
    renderCards(walletCardsGrid, items, { showWalletLink: false });
  } catch (e) {
    walletCardsMsg.textContent = String(e.message || e);
  }
}

async function loadRankCards() {
  try {
    if (!publicKeyBase58) {
      if (rankCardsMsg) rankCardsMsg.textContent = "CONNECT TO LOAD YOUR COM CARDS.";
      if (rankMiniGrid) rankMiniGrid.innerHTML = "";
      return;
    }

    if (rankCardsMsg) rankCardsMsg.textContent = "LOADING YOUR COM CARDS…";
    if (rankMiniGrid) rankMiniGrid.innerHTML = "";

    const res = await fetch(`/api/wallet_cards?wallet=${encodeURIComponent(publicKeyBase58)}&limit=100`);
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}

    if (!res.ok) throw new Error(data?.error || text || "FAILED TO LOAD");

    const items = data?.items || [];
    if (!items.length) {
      if (rankCardsMsg) rankCardsMsg.textContent = "NO COM CARDS YET. GO GENERATE ONE.";
      return;
    }

    if (rankCardsMsg) rankCardsMsg.textContent = `YOU HAVE ${items.length} COM CARDS.`;

    for (const it of items.slice(0, 24)) {
      const img = document.createElement("img");
      img.className = "miniThumb";
      img.src = it.imageUrl || it.image_url || "";
      img.alt = it.name || "COM CARD";
      img.onclick = async () => {
        showView("cards");
        const sort = cardsSort?.value || "trending";
        setCardsBigTitle(sort);
        if (searchCardId) searchCardId.value = it.id;
        await searchById(it.id);
      };
      rankMiniGrid.appendChild(img);
    }
  } catch (e) {
    if (rankCardsMsg) rankCardsMsg.textContent = String(e.message || e);
  }
}

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

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
