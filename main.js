import bs58 from "https://cdn.skypack.dev/bs58";

const tabGen = document.getElementById("tabGen");
const tabRank = document.getElementById("tabRank");
const tabCards = document.getElementById("tabCards");
const tabMarket = document.getElementById("tabMarket");

const viewGen = document.getElementById("viewGen");
const viewRank = document.getElementById("viewRank");
const viewCards = document.getElementById("viewCards");
const viewWallet = document.getElementById("viewWallet");
const viewMarket = document.getElementById("viewMarket");

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

const btnRefreshCards = document.getElementById("btnRefreshCards");
const cardsMsg = document.getElementById("cardsMsg");
const cardsGrid = document.getElementById("cardsGrid");
const searchCardId = document.getElementById("searchCardId");
const btnSearchCard = document.getElementById("btnSearchCard");

const cardsBigTitle = document.getElementById("cardsBigTitle");

// Custom dropdown elements
const cardsSortDD = document.getElementById("cardsSortDD");
const cardsSortBtn = document.getElementById("cardsSortBtn");
const cardsSortMenu = document.getElementById("cardsSortMenu");
const cardsSortLabel = document.getElementById("cardsSortLabel");

const walletPageSub = document.getElementById("walletPageSub");
const walletRankBig = document.getElementById("walletRankBig");
const walletRankCallout = document.getElementById("walletRankCallout");
const walletCardsMsg = document.getElementById("walletCardsMsg");
const walletCardsGrid = document.getElementById("walletCardsGrid");
const btnBackToCards = document.getElementById("btnBackToCards");

let publicKeyBase58 = null;
let lastImageSrc = null;

// board sort state
let currentSort = "trending";

// ✅ VOTE RULE
const VOTE_RULE_TEXT = "RULE: 1 VOTE PER DAY PER WALLET PER CARD. (UP OR DOWN.)";

// ✅ SESSION CACHE (in-memory)
const CACHE_TTL_MS = 30_000; // 30s freshness window
const boardCache = new Map(); // key: sort -> { items, ts }
const walletCardsCache = new Map(); // key: wallet -> { items, ts }
let myRankCardsCache = { items: null, ts: 0 }; // for rank mini grid

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
  cardsBigTitle.textContent = (sort || "TRENDING").toUpperCase();
}

function getSortLabel(v){
  if (v === "top") return "TOP";
  if (v === "newest") return "NEWEST";
  return "TRENDING";
}

function setSort(v){
  currentSort = v || "trending";
  if (cardsSortLabel) cardsSortLabel.textContent = getSortLabel(currentSort);
  setCardsBigTitle(getSortLabel(currentSort));
}

function toggleSortMenu(force){
  if (!cardsSortMenu) return;
  const open = !cardsSortMenu.classList.contains("hidden");
  const next = (typeof force === "boolean") ? force : !open;
  cardsSortMenu.classList.toggle("hidden", !next);
}

function showView(which) {
  const gen = which === "gen";
  const rank = which === "rank";
  const cards = which === "cards";
  const wallet = which === "wallet";
  const market = which === "market";

  viewGen?.classList.toggle("hidden", !gen);
  viewRank?.classList.toggle("hidden", !rank);
  viewCards?.classList.toggle("hidden", !cards);
  viewWallet?.classList.toggle("hidden", !wallet);
  viewMarket?.classList.toggle("hidden", !market);

  tabGen?.classList.toggle("active", gen);
  tabRank?.classList.toggle("active", rank);
  tabCards?.classList.toggle("active", cards);
  tabMarket?.classList.toggle("active", market);
}

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

function cacheFresh(entry) {
  if (!entry) return false;
  return (Date.now() - entry.ts) < CACHE_TTL_MS;
}

/* ---------------- Inline “LOADING COM CARDS…” placeholders ---------------- */

function showGridPlaceholders(gridEl, count = 9, label = "LOADING COM CARDS…") {
  if (!gridEl) return;
  gridEl.innerHTML = "";

  for (let i = 0; i < count; i++) {
    const card = document.createElement("div");
    card.className = "card px-border-soft";
    card.style.opacity = "0.95";

    const box = document.createElement("div");
    box.style.border = "4px solid rgba(180,255,210,.18)";
    box.style.boxShadow = "0 10px 0 rgba(0,0,0,.35)";
    box.style.background = "rgba(0,0,0,.35)";
    box.style.height = "260px";
    box.style.position = "relative";
    box.style.display = "flex";
    box.style.alignItems = "center";
    box.style.justifyContent = "center";

    const txt = document.createElement("div");
    txt.textContent = label;
    txt.style.fontFamily = `"Press Start 2P", monospace`;
    txt.style.fontSize = "10px";
    txt.style.letterSpacing = ".12em";
    txt.style.textTransform = "uppercase";
    txt.style.color = "#C8FF00";
    txt.style.textShadow = "0 10px 0 rgba(0,0,0,.45)";
    txt.style.textAlign = "center";
    txt.style.padding = "0 10px";
    txt.style.lineHeight = "1.8";
    txt.style.animation = "pxPulse 0.9s ease-in-out infinite";

    box.appendChild(txt);
    card.appendChild(box);

    const meta = document.createElement("div");
    meta.className = "cardMeta";
    meta.textContent = "…";
    card.appendChild(meta);

    gridEl.appendChild(card);
  }

  injectPulseKeyframesOnce();
}

function showMiniPlaceholders(miniEl, count = 12, label = "LOADING") {
  if (!miniEl) return;
  miniEl.innerHTML = "";

  for (let i = 0; i < count; i++) {
    const tile = document.createElement("div");
    tile.style.border = "4px solid rgba(180,255,210,.18)";
    tile.style.boxShadow = "0 8px 0 rgba(0,0,0,.30)";
    tile.style.background = "rgba(0,0,0,.35)";
    tile.style.height = "70px";
    tile.style.display = "flex";
    tile.style.alignItems = "center";
    tile.style.justifyContent = "center";
    tile.style.cursor = "default";

    const txt = document.createElement("div");
    txt.textContent = label;
    txt.style.fontFamily = `"Press Start 2P", monospace`;
    txt.style.fontSize = "8px";
    txt.style.letterSpacing = ".12em";
    txt.style.textTransform = "uppercase";
    txt.style.color = "#C8FF00";
    txt.style.textShadow = "0 8px 0 rgba(0,0,0,.45)";
    txt.style.animation = "pxPulse 0.9s ease-in-out infinite";
    txt.style.textAlign = "center";

    tile.appendChild(txt);
    miniEl.appendChild(tile);
  }

  injectPulseKeyframesOnce();
}

function injectPulseKeyframesOnce() {
  if (document.getElementById("_pxPulseStyle")) return;
  const style = document.createElement("style");
  style.id = "_pxPulseStyle";
  style.textContent = `
    @keyframes pxPulse {
      0%,100% { transform: translateY(0); opacity: .65; }
      50% { transform: translateY(-1px); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

/* ---------------- Pixel dropdown wiring ---------------- */

cardsSortBtn && (cardsSortBtn.onclick = (e) => {
  e.preventDefault();
  toggleSortMenu();
});

cardsSortMenu && cardsSortMenu.addEventListener("click", async (e) => {
  const btn = e.target?.closest?.("[data-value]");
  if (!btn) return;
  const val = btn.getAttribute("data-value");
  setSort(val);
  toggleSortMenu(false);
  await showCardsFromCacheOrLoad();
});

document.addEventListener("click", (e) => {
  if (!cardsSortDD || !cardsSortMenu) return;
  if (!cardsSortDD.contains(e.target)) toggleSortMenu(false);
});

/* ---------------- Tabs ---------------- */

tabGen && (tabGen.onclick = () => showView("gen"));

tabRank && (tabRank.onclick = async () => {
  showView("rank");
  await loadRankCards({ preferCache: true });
});

tabCards && (tabCards.onclick = async () => {
  showView("cards");
  setSort(currentSort);
  setCardsMsg(VOTE_RULE_TEXT, "");
  await showCardsFromCacheOrLoad();
});

tabMarket && (tabMarket.onclick = () => {
  showView("market");
});

/* ---------------- Wallet ---------------- */

async function connectPhantom(opts) {
  const provider = requirePhantomOrDeepLink();
  const resp = await provider.connect(opts);
  publicKeyBase58 = resp.publicKey.toBase58();
  if (elWallet) elWallet.textContent = publicKeyBase58;
  setConnectedUI(true);
  await refreshBalanceAndRank();

  if (!viewRank?.classList.contains("hidden")) await loadRankCards({ preferCache: true });
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

  walletCardsCache.clear();
  myRankCardsCache = { items: null, ts: 0 };

  setCardsMsg(VOTE_RULE_TEXT, "");
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

  const eligible = amt >= 0; // set >=0 for testing if you want
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

    myRankCardsCache = { items: null, ts: 0 };
    if (publicKeyBase58) walletCardsCache.delete(publicKeyBase58);

    if (!viewCards?.classList.contains("hidden")) {
      boardCache.delete(currentSort);
      await showCardsFromCacheOrLoad();
    }
    if (!viewRank?.classList.contains("hidden")) {
      await loadRankCards({ preferCache: false });
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

/* ---------------- Com Cards: cache + inline loading that stays until images load ---------------- */

btnRefreshCards && (btnRefreshCards.onclick = async () => {
  boardCache.delete(currentSort);
  await showCardsFromCacheOrLoad({ forceNetwork: true });
});

btnSearchCard && (btnSearchCard.onclick = async () => {
  const id = (searchCardId?.value || "").trim();
  if (!id) return setCardsMsg("ENTER A CARD ID.", "bad");
  await searchById(id);
});

btnBackToCards && (btnBackToCards.onclick = async () => {
  showView("cards");
  setSort(currentSort);
  setCardsMsg(VOTE_RULE_TEXT, "");
  await showCardsFromCacheOrLoad();
});

async function showCardsFromCacheOrLoad({ forceNetwork = false } = {}) {
  const cached = boardCache.get(currentSort);

  if (!forceNetwork && cacheFresh(cached) && Array.isArray(cached.items)) {
    setCardsMsg(VOTE_RULE_TEXT, "");
    renderCards(cardsGrid, cached.items, { showWalletLink: true, withPerImageLoading: true });

    if ((Date.now() - cached.ts) > (CACHE_TTL_MS * 0.8)) {
      loadBoard(currentSort, { background: true }).catch(() => {});
    }
    return;
  }

  await loadBoard(currentSort, { background: false });
}

async function loadBoard(sort, { background = false } = {}) {
  try {
    if (!cardsGrid) return;

    if (!background) {
      setCardsMsg("LOADING COM CARDS…", "");
      showGridPlaceholders(cardsGrid, 9, "LOADING COM CARDS…");
    }

    const res = await fetch(`/api/cards_list?sort=${encodeURIComponent(sort)}&limit=100`);
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}

    if (!res.ok) throw new Error(data?.error || text || "FAILED TO LOAD CARDS");

    const items = data?.items || [];
    boardCache.set(sort, { items, ts: Date.now() });

    if (!items.length) {
      if (!background) {
        cardsGrid.innerHTML = "";
        setCardsMsg("NO COM CARDS YET. GO GENERATE ONE.", "");
      }
      return;
    }

    if (!viewCards.classList.contains("hidden")) {
      renderCards(cardsGrid, items, { showWalletLink: true, withPerImageLoading: true });

      // Keep “LOADING…” until ALL images finished, then put rule back
      await waitForImagesIn(cardsGrid);
      if (!viewCards.classList.contains("hidden")) setCardsMsg(VOTE_RULE_TEXT, "");
    }
  } catch (e) {
    if (!background) setCardsMsg(String(e.message || e), "bad");
  }
}

async function searchById(cardId) {
  try {
    setCardsMsg("LOADING COM CARDS…", "");
    showGridPlaceholders(cardsGrid, 3, "LOADING COM CARDS…");

    const res = await fetch(`/api/card_get?id=${encodeURIComponent(cardId)}`);
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}

    if (!res.ok) throw new Error(data?.error || text || "NOT FOUND");

    const item = data?.item;
    if (!item) throw new Error("NOT FOUND");

    renderCards(cardsGrid, [item], { showWalletLink: true, withPerImageLoading: true });
    await waitForImagesIn(cardsGrid);
    setCardsMsg(VOTE_RULE_TEXT, "");
  } catch (e) {
    setCardsMsg(String(e.message || e), "bad");
  }
}

/* ---------------- Voting ---------------- */

async function voteCard(cardId, vote, pillEl) {
  try {
    if (!publicKeyBase58) {
      setCardsMsg("CONNECT WALLET TO VOTE.", "bad");
      showView("gen");
      return;
    }

    setCardsMsg("SIGN TO VOTE…", "");

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

    // update cached board item
    const entry = boardCache.get(currentSort);
    if (entry?.items?.length) {
      for (const it of entry.items) {
        if (it.id === cardId || it.cardId === cardId) {
          it.upvotes = up;
          it.downvotes = down;
          it.score = score;
          break;
        }
      }
      entry.ts = Date.now();
      boardCache.set(currentSort, entry);
    }

    setCardsMsg(VOTE_RULE_TEXT, "ok");
  } catch (e) {
    setCardsMsg(String(e.message || e), "bad");
  }
}

/* ---------------- Rendering (per-image loading until loaded) ---------------- */

function renderCards(container, items, opts = {}) {
  if (!container) return;
  container.innerHTML = "";

  for (const it of items) {
    const card = document.createElement("div");
    card.className = "card px-border-soft";

    // wrapper so we can show “LOADING COM CARDS…” INSIDE the card until image loads
    const imgWrap = document.createElement("div");
    imgWrap.style.position = "relative";

    const loadingBadge = document.createElement("div");
    loadingBadge.textContent = "LOADING COM CARDS…";
    loadingBadge.style.position = "absolute";
    loadingBadge.style.inset = "0";
    loadingBadge.style.display = opts.withPerImageLoading ? "flex" : "none";
    loadingBadge.style.alignItems = "center";
    loadingBadge.style.justifyContent = "center";
    loadingBadge.style.textAlign = "center";
    loadingBadge.style.padding = "0 12px";
    loadingBadge.style.fontFamily = `"Press Start 2P", monospace`;
    loadingBadge.style.fontSize = "10px";
    loadingBadge.style.letterSpacing = ".12em";
    loadingBadge.style.textTransform = "uppercase";
    loadingBadge.style.color = "#C8FF00";
    loadingBadge.style.textShadow = "0 10px 0 rgba(0,0,0,.45)";
    loadingBadge.style.background = "rgba(0,0,0,.35)";
    loadingBadge.style.border = "4px solid rgba(180,255,210,.18)";
    loadingBadge.style.boxShadow = "0 10px 0 rgba(0,0,0,.35)";
    loadingBadge.style.animation = "pxPulse 0.9s ease-in-out infinite";

    const img = document.createElement("img");
    img.className = "cardImg";
    img.alt = it.name || "COM CARD";
    img.src = it.imageUrl || it.image_url || "";

    if (opts.withPerImageLoading) {
      img.style.opacity = "0";
      img.style.transition = "opacity 120ms linear";
      img.addEventListener("load", () => {
        loadingBadge.style.display = "none";
        img.style.opacity = "1";
      }, { once: true });
      img.addEventListener("error", () => {
        loadingBadge.textContent = "FAILED TO LOAD";
      }, { once: true });
    }

    imgWrap.appendChild(img);
    imgWrap.appendChild(loadingBadge);
    card.appendChild(imgWrap);

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

  injectPulseKeyframesOnce();
}

async function waitForImagesIn(container) {
  if (!container) return;
  const imgs = Array.from(container.querySelectorAll("img"));
  if (!imgs.length) return;

  await Promise.allSettled(imgs.map(img => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => resolve();
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    });
  }));
}

/* ---------------- Wallet profile + rank cards (inline loading) ---------------- */

async function openWalletPage(wallet) {
  showView("wallet");
  walletPageSub.textContent = `WALLET: ${wallet}`;
  walletCardsMsg.textContent = "LOADING COM CARDS…";
  walletCardsGrid.innerHTML = "";
  showGridPlaceholders(walletCardsGrid, 6, "LOADING COM CARDS…");

  const isMe = publicKeyBase58 && wallet === publicKeyBase58;

  if (isMe) {
    walletRankBig.textContent = rankBig?.textContent || "—";
    walletRankCallout.textContent = rankCallout?.textContent || "—";
  } else {
    walletRankBig.textContent = "HOLDER";
    walletRankCallout.textContent = "THIS IS A COM CARDS PROFILE. (BALANCE RANK IS PRIVATE)";
  }

  const cached = walletCardsCache.get(wallet);
  if (cacheFresh(cached) && Array.isArray(cached.items)) {
    renderCards(walletCardsGrid, cached.items, { showWalletLink: false, withPerImageLoading: true });
    await waitForImagesIn(walletCardsGrid);
    walletCardsMsg.textContent = cached.items.length ? `SHOWING ${cached.items.length} COM CARDS.` : "NO COM CARDS YET.";
    if ((Date.now() - cached.ts) > (CACHE_TTL_MS * 0.8)) {
      loadWalletCards(wallet, { background: true }).catch(() => {});
    }
    return;
  }

  await loadWalletCards(wallet, { background: false });
}

async function loadWalletCards(wallet, { background = false } = {}) {
  try {
    const res = await fetch(`/api/wallet_cards?wallet=${encodeURIComponent(wallet)}&limit=100`);
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}

    if (!res.ok) throw new Error(data?.error || text || "FAILED TO LOAD WALLET CARDS");

    const items = data?.items || [];
    walletCardsCache.set(wallet, { items, ts: Date.now() });

    if (!viewWallet.classList.contains("hidden")) {
      renderCards(walletCardsGrid, items, { showWalletLink: false, withPerImageLoading: true });
      await waitForImagesIn(walletCardsGrid);
      walletCardsMsg.textContent = items.length ? `SHOWING ${items.length} COM CARDS.` : "NO COM CARDS YET.";
    }
  } catch (e) {
    if (!background) {
      walletCardsGrid.innerHTML = "";
      walletCardsMsg.textContent = String(e.message || e);
    }
  }
}

async function loadRankCards({ preferCache = true } = {}) {
  try {
    if (!publicKeyBase58) {
      if (rankCardsMsg) rankCardsMsg.textContent = "CONNECT TO LOAD YOUR COM CARDS.";
      if (rankMiniGrid) rankMiniGrid.innerHTML = "";
      return;
    }

    if (preferCache && cacheFresh(myRankCardsCache) && Array.isArray(myRankCardsCache.items)) {
      renderRankMini(myRankCardsCache.items, { withLoading: false });
      if ((Date.now() - myRankCardsCache.ts) > (CACHE_TTL_MS * 0.8)) {
        loadRankCards({ preferCache: false }).catch(() => {});
      }
      return;
    }

    if (rankCardsMsg) rankCardsMsg.textContent = "LOADING COM CARDS…";
    showMiniPlaceholders(rankMiniGrid, 18, "LOADING");

    const res = await fetch(`/api/wallet_cards?wallet=${encodeURIComponent(publicKeyBase58)}&limit=100`);
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}

    if (!res.ok) throw new Error(data?.error || text || "FAILED TO LOAD");

    const items = data?.items || [];
    myRankCardsCache = { items, ts: Date.now() };

    renderRankMini(items, { withLoading: true });
    await waitForImagesIn(rankMiniGrid);
    if (rankCardsMsg) rankCardsMsg.textContent = items.length ? `YOU HAVE ${items.length} COM CARDS.` : "NO COM CARDS YET. GO GENERATE ONE.";
  } catch (e) {
    if (rankCardsMsg) rankCardsMsg.textContent = String(e.message || e);
  }
}

function renderRankMini(items, { withLoading = true } = {}) {
  if (!rankMiniGrid || !rankCardsMsg) return;

  if (!items?.length) {
    rankCardsMsg.textContent = "NO COM CARDS YET. GO GENERATE ONE.";
    rankMiniGrid.innerHTML = "";
    return;
  }

  rankMiniGrid.innerHTML = "";

  for (const it of items.slice(0, 24)) {
    const wrap = document.createElement("div");
    wrap.style.position = "relative";

    const img = document.createElement("img");
    img.className = "miniThumb";
    img.src = it.imageUrl || it.image_url || "";
    img.alt = it.name || "COM CARD";

    const badge = document.createElement("div");
    badge.textContent = "LOADING";
    badge.style.position = "absolute";
    badge.style.inset = "0";
    badge.style.display = withLoading ? "flex" : "none";
    badge.style.alignItems = "center";
    badge.style.justifyContent = "center";
    badge.style.textAlign = "center";
    badge.style.fontFamily = `"Press Start 2P", monospace`;
    badge.style.fontSize = "8px";
    badge.style.letterSpacing = ".12em";
    badge.style.textTransform = "uppercase";
    badge.style.color = "#C8FF00";
    badge.style.textShadow = "0 8px 0 rgba(0,0,0,.45)";
    badge.style.background = "rgba(0,0,0,.35)";
    badge.style.border = "4px solid rgba(180,255,210,.18)";
    badge.style.boxShadow = "0 8px 0 rgba(0,0,0,.30)";
    badge.style.animation = "pxPulse 0.9s ease-in-out infinite";

    if (withLoading) {
      img.style.opacity = "0";
      img.style.transition = "opacity 120ms linear";
      img.addEventListener("load", () => {
        badge.style.display = "none";
        img.style.opacity = "1";
      }, { once: true });
      img.addEventListener("error", () => {
        badge.textContent = "FAIL";
      }, { once: true });
    }

    img.onclick = async () => {
      showView("cards");
      if (searchCardId) searchCardId.value = it.id;
      setSort(currentSort);
      setCardsMsg("LOADING COM CARDS…", "");
      await searchById(it.id);
    };

    wrap.appendChild(img);
    wrap.appendChild(badge);
    rankMiniGrid.appendChild(wrap);
  }

  injectPulseKeyframesOnce();
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

// init
setSort(currentSort);
showView("gen");
setCardsMsg(VOTE_RULE_TEXT, "");

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
