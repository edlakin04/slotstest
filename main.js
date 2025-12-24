import bs58 from "https://cdn.skypack.dev/bs58";

/* ---------- existing elements ---------- */
const tabGen = document.getElementById("tabGen");
const tabRank = document.getElementById("tabRank");
const tabCards = document.getElementById("tabCards");
const tabMarket = document.getElementById("tabMarket");

const viewGen = document.getElementById("viewGen");
const viewRank = document.getElementById("viewRank");
const viewCards = document.getElementById("viewCards");
const viewWallet = document.getElementById("viewWallet");
const viewMarket = document.getElementById("viewMarket");
const viewCard = document.getElementById("viewCard");

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

const btnRefreshCards = document.getElementById("btnRefreshCards");
const cardsMsg = document.getElementById("cardsMsg");
const cardsGrid = document.getElementById("cardsGrid");
const searchCardId = document.getElementById("searchCardId");
const btnSearchCard = document.getElementById("btnSearchCard");
const cardsBigTitle = document.getElementById("cardsBigTitle");

const cardsSortDD = document.getElementById("cardsSortDD");
const cardsSortBtn = document.getElementById("cardsSortBtn");
const cardsSortMenu = document.getElementById("cardsSortMenu");
const cardsSortLabel = document.getElementById("cardsSortLabel");

const btnCardsBoard = document.getElementById("btnCardsBoard");
const btnCardsMine = document.getElementById("btnCardsMine");
const cardsBoardWrap = document.getElementById("cardsBoardWrap");
const cardsMineWrap = document.getElementById("cardsMineWrap");
const myCardsMsg = document.getElementById("myCardsMsg");
const myCardsGrid = document.getElementById("myCardsGrid");
const btnRefreshMine = document.getElementById("btnRefreshMine");

const walletPageSub = document.getElementById("walletPageSub");
const walletRankBig = document.getElementById("walletRankBig");
const walletRankCallout = document.getElementById("walletRankCallout");
const walletCardsMsg = document.getElementById("walletCardsMsg");
const walletCardsGrid = document.getElementById("walletCardsGrid");
const btnBackToCards = document.getElementById("btnBackToCards");

/* ---------- card details elements ---------- */
const cardTitle = document.getElementById("cardTitle");
const btnCardBack = document.getElementById("btnCardBack");
const btnCardRefresh = document.getElementById("btnCardRefresh");
const cardImg = document.getElementById("cardImg");
const cardMeta = document.getElementById("cardMeta");
const cardScorePill = document.getElementById("cardScorePill");
const cardCreatedPill = document.getElementById("cardCreatedPill");
const cardVotesList = document.getElementById("cardVotesList");
const cardChart = document.getElementById("cardChart");
const cardMsg = document.getElementById("cardMsg");

/* ---------- detail page voting elements (safe if missing) ---------- */
const btnCardVoteUp = document.getElementById("btnCardVoteUp");
const btnCardVoteDown = document.getElementById("btnCardVoteDown");
const cardVoteStatusPill = document.getElementById("cardVoteStatusPill");

/* ---------- state ---------- */
let publicKeyBase58 = null;
let lastImageSrc = null;

let currentSort = "trending";
let lastCardsView = "board";

const CACHE_TTL_MS = 45_000;
const boardCache = new Map();       // sort -> { items, ts }
const walletCardsCache = new Map(); // wallet -> { items, ts }
const inflight = new Map();

const VOTE_RULE_TEXT = "RULE: 1 VOTE PER DAY PER WALLET PER CARD. (UP OR DOWN.)";

/* Card details live polling */
let currentCardId = null;
let cardPollTimer = null;

/* prevent stale details overwriting */
let cardDetailsReqToken = 0;

/* prevent image refresh on details updates */
let currentCardImageBase = null;

/* ---------- ranks ---------- */
const RANKS = [
  { name: "Dust", min: 0 },
  { name: "Hodler", min: 1 },
  { name: "Shiller", min: 1_000 },
  { name: "Chad", min: 10_000 },
  { name: "Whale", min: 100_000 }
];

/* ---------- helpers ---------- */
function cacheFresh(entry) {
  return !!entry && (Date.now() - entry.ts) < CACHE_TTL_MS;
}

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

function setMyCardsMsg(text = "", kind = "") {
  if (!myCardsMsg) return;
  myCardsMsg.classList.remove("ok", "bad");
  if (kind === "ok") myCardsMsg.classList.add("ok");
  if (kind === "bad") myCardsMsg.classList.add("bad");
  myCardsMsg.textContent = text;
}

function setActiveCardsMessage(text = "", kind = "") {
  const inCardsView = viewCards && !viewCards.classList.contains("hidden");
  const mineVisible = cardsMineWrap && !cardsMineWrap.classList.contains("hidden");
  if (inCardsView && mineVisible) setMyCardsMsg(text, kind);
  else setCardsMsg(text, kind);
}

function setCardMsg(text = "", kind = "") {
  if (!cardMsg) return;
  cardMsg.classList.remove("ok", "bad");
  if (kind === "ok") cardMsg.classList.add("ok");
  if (kind === "bad") cardMsg.classList.add("bad");
  cardMsg.textContent = text;
}

function setCardsBigTitleText(t) {
  if (!cardsBigTitle) return;
  cardsBigTitle.textContent = String(t || "").toUpperCase();
}

function getSortLabel(v){
  if (v === "top") return "TOP";
  if (v === "newest") return "NEWEST";
  return "TRENDING";
}

function setSort(v){
  currentSort = v || "trending";
  if (cardsSortLabel) cardsSortLabel.textContent = getSortLabel(currentSort);
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
  const card = which === "card";

  viewGen?.classList.toggle("hidden", !gen);
  viewRank?.classList.toggle("hidden", !rank);
  viewCards?.classList.toggle("hidden", !cards);
  viewWallet?.classList.toggle("hidden", !wallet);
  viewMarket?.classList.toggle("hidden", !market);
  viewCard?.classList.toggle("hidden", !card);

  tabGen?.classList.toggle("active", gen);
  tabRank?.classList.toggle("active", rank);
  tabCards?.classList.toggle("active", cards);
  tabMarket?.classList.toggle("active", market);

  if (!card) stopCardPolling();
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

function fmtDate(ts) {
  try { return new Date(ts).toISOString().slice(0, 10); } catch { return ""; }
}
function fmtTime(ts) {
  try { return new Date(ts).toISOString().replace("T"," ").slice(0, 19) + " UTC"; } catch { return ""; }
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

async function waitForImagesIn(container) {
  if (!container) return;
  const imgs = Array.from(container.querySelectorAll("img"));
  if (!imgs.length) return;

  await Promise.allSettled(imgs.map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => resolve();
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    });
  }));
}

function waitForImage(imgEl) {
  if (!imgEl) return Promise.resolve();
  if (imgEl.complete && imgEl.naturalWidth > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => resolve();
    imgEl.addEventListener("load", done, { once: true });
    imgEl.addEventListener("error", done, { once: true });
  });
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* NEW: accept different backend keys safely */
function pickFirstArray(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

/* NEW: normalize series items into { cum:number } */
function normalizeNetSeries(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((p, i) => {
    if (p && typeof p === "object") {
      if (p.cum != null) return { cum: Number(p.cum) || 0 };
      if (p.net != null) return { cum: Number(p.net) || 0 };
      if (p.value != null) return { cum: Number(p.value) || 0 };
      if (p.y != null) return { cum: Number(p.y) || 0 };
      if (p.score != null) return { cum: Number(p.score) || 0 };
    }
    // number or unknown
    return { cum: Number(p) || 0 };
  });
}

/* ---------- tabs ---------- */
tabGen && (tabGen.onclick = () => showView("gen"));
tabRank && (tabRank.onclick = () => showView("rank"));

tabCards && (tabCards.onclick = async () => {
  showView("cards");
  openCardsSection(lastCardsView || "board");
  prefetchMyCards();
  if (lastCardsView === "mine") await showMyCardsFromCacheOrLoad();
  else await showBoardFromCacheOrLoad();
});

tabMarket && (tabMarket.onclick = () => showView("market"));

/* ---------- dropdown ---------- */
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

  setCardsBigTitleText("COM CARDS");
  openCardsSection("board");
  await showBoardFromCacheOrLoad({ forceNetwork: true });
});

document.addEventListener("click", (e) => {
  if (!cardsSortDD || !cardsSortMenu) return;
  if (!cardsSortDD.contains(e.target)) toggleSortMenu(false);
});

/* ---------- Cards section toggle ---------- */
function openCardsSection(which) {
  const isBoard = which === "board";
  lastCardsView = which;
  cardsBoardWrap?.classList.toggle("hidden", !isBoard);
  cardsMineWrap?.classList.toggle("hidden", isBoard);

  btnCardsBoard?.classList.toggle("active", isBoard);
  btnCardsMine?.classList.toggle("active", !isBoard);

  if (isBoard) {
    setCardsBigTitleText("COM CARDS");
    setCardsMsg(VOTE_RULE_TEXT, "");
  } else {
    setCardsBigTitleText("MY COM CARDS");
    setMyCardsMsg("", "");
  }
}

btnCardsBoard && (btnCardsBoard.onclick = async () => {
  openCardsSection("board");
  prefetchMyCards();
  await showBoardFromCacheOrLoad();
});

btnCardsMine && (btnCardsMine.onclick = async () => {
  openCardsSection("mine");
  await showMyCardsFromCacheOrLoad();
});

btnRefreshMine && (btnRefreshMine.onclick = async () => {
  if (publicKeyBase58) walletCardsCache.delete(publicKeyBase58);
  await showMyCardsFromCacheOrLoad({ forceNetwork: true });
});

/* ---------- connect ---------- */
async function connectPhantom(opts) {
  const provider = requirePhantomOrDeepLink();
  const resp = await provider.connect(opts);
  publicKeyBase58 = resp.publicKey.toBase58();

  if (elWallet) elWallet.textContent = publicKeyBase58;

  setConnectedUI(true);
  await refreshBalanceAndRank();
  prefetchMyCards();
}

btnConnect && (btnConnect.onclick = async () => {
  try { await connectPhantom(); }
  catch (e) { setMsg(e.message, "bad"); }
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

  walletCardsCache.clear();
  inflight.clear();

  if (myCardsGrid) myCardsGrid.innerHTML = "";
  setMyCardsMsg("CONNECT WALLET TO SEE YOUR COM CARDS.", "");

  setConnectedUI(false);
  setMsg("");
  setCardsMsg(VOTE_RULE_TEXT, "");
});

/* ---------- balance & rank ---------- */
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

  const eligible = amt >= 0;
  if (btnGenerate) btnGenerate.disabled = !eligible;

  if (!quiet) {
    setMsg(
      eligible ? "ELIGIBLE. HIT GENERATE." : "HOLD $COMCOIN TO GENERATE.",
      eligible ? "ok" : ""
    );
  }
}

/* ---------- generate ---------- */
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
    if (urlFromApi) imgSrc = `${urlFromApi}${urlFromApi.includes("?") ? "&" : "?"}v=${Date.now()}`;
    else if (data?.image_b64) imgSrc = `data:${data.mime || "image/png"};base64,${data.image_b64}`;
    else if (data?.b64_json) imgSrc = `data:image/png;base64,${data.b64_json}`;

    if (!imgSrc) throw new Error("NO IMAGE DATA RETURNED");

    lastImageSrc = imgSrc;

    if (outImg) outImg.src = lastImageSrc;
    if (outWrap) outWrap.style.display = "block";

    if (shillText) shillText.textContent = "START SHILLING TODAY • $COMCOIN";

    if (cardMetaMini) {
      if (data?.cardId || data?.name) {
        const parts = [];
        if (data?.name) parts.push(String(data.name).toUpperCase());
        if (data?.cardId) parts.push(String(data.cardId).toUpperCase());
        cardMetaMini.textContent = parts.join(" • ");
        cardMetaMini.style.display = "inline-block";
      } else {
        cardMetaMini.style.display = "none";
      }
    }

    if (btnCopyTweet) btnCopyTweet.disabled = false;
    if (btnDownload) btnDownload.disabled = false;

    setMsg("GENERATED. SAVE IT + POST IT.", "ok");

    if (publicKeyBase58) walletCardsCache.delete(publicKeyBase58);
    prefetchMyCards();
  } catch (e) {
    setMsg(String(e.message || e), "bad");
  } finally {
    await refreshBalanceAndRank({ quiet: true });
  }
});

/* ---------- generator extras ---------- */
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

/* ---------- COM CARDS BOARD ---------- */
btnRefreshCards && (btnRefreshCards.onclick = async () => {
  boardCache.delete(currentSort);
  openCardsSection("board");
  prefetchMyCards();
  await showBoardFromCacheOrLoad({ forceNetwork: true });
});

btnSearchCard && (btnSearchCard.onclick = async () => {
  const id = (searchCardId?.value || "").trim();
  if (!id) return setCardsMsg("ENTER A CARD ID.", "bad");
  openCardsSection("board");
  await searchById(id);
});

async function showBoardFromCacheOrLoad({ forceNetwork = false } = {}) {
  const cached = boardCache.get(currentSort);
  if (!forceNetwork && cacheFresh(cached) && Array.isArray(cached.items)) {
    setCardsMsg(VOTE_RULE_TEXT, "");
    renderCards(cardsGrid, cached.items, { showWalletLink: true });
    return;
  }
  await loadBoard(currentSort);
}

async function loadBoard(sort) {
  try {
    if (!cardsGrid) return;
    setCardsMsg("LOADING COM CARDS…", "");
    cardsGrid.innerHTML = "";

    const res = await fetch(`/api/cards_list?sort=${encodeURIComponent(sort)}&limit=100`);
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    if (!res.ok) throw new Error(data?.error || text || "FAILED TO LOAD CARDS");

    const items = data?.items || [];
    boardCache.set(sort, { items, ts: Date.now() });

    if (!items.length) {
      setCardsMsg("NO COM CARDS YET. GO GENERATE ONE.", "");
      return;
    }

    renderCards(cardsGrid, items, { showWalletLink: true });
    await waitForImagesIn(cardsGrid);
    setCardsMsg(VOTE_RULE_TEXT, "");
  } catch (e) {
    setCardsMsg(String(e.message || e), "bad");
  }
}

async function searchById(cardId) {
  try {
    setCardsMsg("LOADING COM CARDS…", "");
    if (cardsGrid) cardsGrid.innerHTML = "";

    const res = await fetch(`/api/card_get?id=${encodeURIComponent(cardId)}`);
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    if (!res.ok) throw new Error(data?.error || text || "NOT FOUND");

    const item = data?.item;
    if (!item) throw new Error("NOT FOUND");

    renderCards(cardsGrid, [item], { showWalletLink: true });
    await waitForImagesIn(cardsGrid);
    setCardsMsg(VOTE_RULE_TEXT, "");
  } catch (e) {
    setCardsMsg(String(e.message || e), "bad");
  }
}

/* ---------- MY COM CARDS ---------- */
function inflightKeyMy(wallet){ return `my:${wallet}`; }

function prefetchMyCards() {
  if (!publicKeyBase58) return;
  const wallet = publicKeyBase58;

  const cached = walletCardsCache.get(wallet);
  if (cacheFresh(cached) && Array.isArray(cached.items)) return;

  const key = inflightKeyMy(wallet);
  if (inflight.has(key)) return;

  const p = (async () => {
    try {
      const res = await fetch(`/api/wallet_cards?wallet=${encodeURIComponent(wallet)}&limit=100`);
      const text = await res.text();
      let data = null;
      try { data = JSON.parse(text); } catch {}
      if (!res.ok) return;

      const items = data?.items || [];
      walletCardsCache.set(wallet, { items, ts: Date.now() });
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
}

async function showMyCardsFromCacheOrLoad({ forceNetwork = false } = {}) {
  if (!myCardsGrid) return;

  if (!publicKeyBase58) {
    setMyCardsMsg("CONNECT WALLET TO SEE YOUR COM CARDS.", "");
    myCardsGrid.innerHTML = "";
    return;
  }

  setCardsBigTitleText("MY COM CARDS");

  const cached = walletCardsCache.get(publicKeyBase58);
  if (!forceNetwork && cacheFresh(cached) && Array.isArray(cached.items)) {
    setMyCardsMsg(`${VOTE_RULE_TEXT}  •  MY COM CARDS: ${cached.items.length}`, "ok");
    renderCards(myCardsGrid, cached.items, { showWalletLink: false });
    return;
  }

  await loadMyCards(publicKeyBase58);
}

async function loadMyCards(wallet) {
  try {
    setMyCardsMsg("LOADING COM CARDS…", "");
    myCardsGrid.innerHTML = "";

    const res = await fetch(`/api/wallet_cards?wallet=${encodeURIComponent(wallet)}&limit=100`);
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    if (!res.ok) throw new Error(data?.error || text || "FAILED TO LOAD MY CARDS");

    const items = data?.items || [];
    walletCardsCache.set(wallet, { items, ts: Date.now() });

    if (!items.length) {
      setMyCardsMsg("YOU HAVE NO COM CARDS YET. GO GENERATE ONE.", "");
      return;
    }

    renderCards(myCardsGrid, items, { showWalletLink: false });
    await waitForImagesIn(myCardsGrid);

    setMyCardsMsg(`${VOTE_RULE_TEXT}  •  MY COM CARDS: ${items.length}`, "ok");
  } catch (e) {
    setMyCardsMsg(String(e.message || e), "bad");
  }
}

/* ---------- Voting ---------- */
function updateCachesAfterVote(cardId, up, down) {
  const score = up - down;

  const entry = boardCache.get(currentSort);
  if (entry?.items?.length) {
    for (const it of entry.items) {
      const id = it.id || it.cardId;
      if (id === cardId) {
        it.upvotes = up; it.downvotes = down; it.score = score;
        break;
      }
    }
    entry.ts = Date.now();
    boardCache.set(currentSort, entry);
  }

  if (publicKeyBase58) {
    const mine = walletCardsCache.get(publicKeyBase58);
    if (mine?.items?.length) {
      for (const it of mine.items) {
        const id = it.id || it.cardId;
        if (id === cardId) {
          it.upvotes = up; it.downvotes = down; it.score = score;
          break;
        }
      }
      mine.ts = Date.now();
      walletCardsCache.set(publicKeyBase58, mine);
    }
  }
}

async function voteCard(cardId, vote, pillEl) {
  const onDetails = viewCard && !viewCard.classList.contains("hidden");

  try {
    if (!publicKeyBase58) {
      if (onDetails) setCardMsg("CONNECT WALLET TO VOTE.", "bad");
      else setActiveCardsMessage("CONNECT WALLET TO VOTE.", "bad");
      showView("gen");
      return;
    }

    if (onDetails) {
      setCardMsg("SIGN TO VOTE…", "");
      if (cardVoteStatusPill) cardVoteStatusPill.textContent = "SIGNING…";
    } else {
      setActiveCardsMessage("SIGN TO VOTE…", "");
    }

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

    updateCachesAfterVote(cardId, up, down);

    if (onDetails) {
      if (cardVoteStatusPill) cardVoteStatusPill.textContent = "VOTE USED (TODAY)";
      setCardMsg("VOTE LOCKED FOR TODAY.", "ok");

      if (currentCardId && currentCardId === cardId) {
        setTimeout(() => loadCardDetails(cardId, { silent: true, forceImage: false }), 450);
      }
    } else {
      setActiveCardsMessage(VOTE_RULE_TEXT, "ok");
    }
  } catch (e) {
    const raw = String(e.message || e);
    const nicer =
      raw.toLowerCase().includes("already voted") ? "VOTE LIMIT FOR THIS CARD REACHED (TODAY)." :
      raw.toLowerCase().includes("duplicate") ? "VOTE LIMIT FOR THIS CARD REACHED (TODAY)." :
      raw.toLowerCase().includes("replay") ? "VOTE LIMIT FOR THIS CARD REACHED (TODAY)." :
      raw.toLowerCase().includes("limit") ? "VOTE LIMIT FOR THIS CARD REACHED (TODAY)." :
      raw;

    if (onDetails) {
      if (cardVoteStatusPill) cardVoteStatusPill.textContent = "1 VOTE / DAY";
      setCardMsg(nicer, "bad");
    } else {
      setActiveCardsMessage(nicer, "bad");
    }
  }
}

/* ---------- render cards ---------- */
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

    img.addEventListener("click", async () => {
      if (!id) return;
      await openCardDetails(id);
    });

    const ownerSpan = document.createElement("span");
    ownerSpan.className = opts.showWalletLink ? "linkLike" : "";
    ownerSpan.textContent = shortWallet(owner);
    if (opts.showWalletLink) ownerSpan.onclick = async () => { await openWalletPage(owner); };

    meta.innerHTML = `
      ID: <span class="linkLike" data-card="${escapeHtml(id)}">${escapeHtml(id)}</span><br/>
      OWNER: <span id="owner-holder"></span><br/>
      DATE: ${escapeHtml(fmtDate(it.created_at || it.createdAt))}<br/>
    `;

    meta.querySelector('[data-card]')?.addEventListener("click", async () => {
      if (!id) return;
      await openCardDetails(id);
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

/* ---------- wallet profile page ---------- */
btnBackToCards && (btnBackToCards.onclick = async () => {
  showView("cards");
  openCardsSection("board");
  prefetchMyCards();
  await showBoardFromCacheOrLoad();
});

async function openWalletPage(wallet) {
  showView("wallet");
  if (walletPageSub) walletPageSub.textContent = `WALLET: ${wallet}`;
  if (walletCardsMsg) walletCardsMsg.textContent = "LOADING COM CARDS…";
  if (walletCardsGrid) walletCardsGrid.innerHTML = "";

  const isMe = publicKeyBase58 && wallet === publicKeyBase58;
  if (isMe) {
    if (walletRankBig) walletRankBig.textContent = rankBig?.textContent || "—";
    if (walletRankCallout) walletRankCallout.textContent = rankCallout?.textContent || "—";
  } else {
    if (walletRankBig) walletRankBig.textContent = "HOLDER";
    if (walletRankCallout) walletRankCallout.textContent = "THIS IS A COM CARDS PROFILE.";
  }

  const cached = walletCardsCache.get(wallet);
  if (cacheFresh(cached) && Array.isArray(cached.items)) {
    renderCards(walletCardsGrid, cached.items, { showWalletLink: false });
    await waitForImagesIn(walletCardsGrid);
    walletCardsMsg.textContent = cached.items.length ? `SHOWING ${cached.items.length} COM CARDS.` : "NO COM CARDS YET.";
    return;
  }

  try {
    const res = await fetch(`/api/wallet_cards?wallet=${encodeURIComponent(wallet)}&limit=100`);
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    if (!res.ok) throw new Error(data?.error || text || "FAILED TO LOAD WALLET CARDS");

    const items = data?.items || [];
    walletCardsCache.set(wallet, { items, ts: Date.now() });

    renderCards(walletCardsGrid, items, { showWalletLink: false });
    await waitForImagesIn(walletCardsGrid);
    walletCardsMsg.textContent = items.length ? `SHOWING ${items.length} COM CARDS.` : "NO COM CARDS YET.";
  } catch (e) {
    walletCardsMsg.textContent = String(e.message || e);
  }
}

/* ---------- Card Details ---------- */
btnCardBack && (btnCardBack.onclick = async () => {
  showView("cards");
  openCardsSection(lastCardsView || "board");
  if (lastCardsView === "mine") await showMyCardsFromCacheOrLoad();
  else await showBoardFromCacheOrLoad();
});

btnCardRefresh && (btnCardRefresh.onclick = async () => {
  if (!currentCardId) return;
  await loadCardDetails(currentCardId, { silent: false, forceImage: false });
});

function stopCardPolling() {
  if (cardPollTimer) clearInterval(cardPollTimer);
  cardPollTimer = null;
}

function startCardPolling(cardId) {
  stopCardPolling();
  cardPollTimer = setInterval(() => {
    if (!currentCardId) return;
    loadCardDetails(currentCardId, { silent: true, forceImage: false });
  }, 10_000);
}

async function openCardDetails(cardId) {
  const myToken = ++cardDetailsReqToken;
  currentCardId = cardId;

  currentCardImageBase = null;

  showView("card");

  if (cardTitle) cardTitle.textContent = "LOADING…";
  if (cardMeta) cardMeta.innerHTML = "—";
  if (cardScorePill) cardScorePill.textContent = "SCORE: —";
  if (cardCreatedPill) cardCreatedPill.textContent = "CREATED: —";
  if (cardVotesList) cardVotesList.innerHTML = "";
  if (cardImg) {
    cardImg.removeAttribute("src");
    cardImg.style.visibility = "hidden";
  }

  if (cardVoteStatusPill) {
    cardVoteStatusPill.textContent = publicKeyBase58 ? "1 VOTE / DAY" : "CONNECT TO VOTE";
  }

  setCardMsg("LOADING COM CARD…", "");

  await loadCardDetails(cardId, { silent: true, token: myToken, forceImage: true });
  startCardPolling(cardId);
}

/* detail page vote buttons */
btnCardVoteUp && (btnCardVoteUp.onclick = async () => {
  if (!currentCardId) return;
  await voteCard(currentCardId, +1, cardScorePill);
});
btnCardVoteDown && (btnCardVoteDown.onclick = async () => {
  if (!currentCardId) return;
  await voteCard(currentCardId, -1, cardScorePill);
});

/* NEW: make canvas match CSS size so line spans properly */
function ensureCanvasSize(canvas, desiredHeight = 140) {
  if (!canvas) return;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const cssW = Math.max(10, Math.floor(canvas.clientWidth || 640));
  const cssH = Math.max(80, Math.floor(canvas.clientHeight || desiredHeight));
  const w = Math.floor(cssW * dpr);
  const h = Math.floor(cssH * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

function drawNetChart(canvas, series) {
  if (!canvas) return;

  ensureCanvasSize(canvas, 140);

  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  const vals = (series || []).map(p => Number(p?.cum ?? 0));
  if (!vals.length) {
    ctx.fillStyle = "rgba(233,255,241,.80)";
    ctx.font = `${Math.max(10, Math.floor(h/10))}px 'Press Start 2P'`;
    ctx.fillText("NO VOTES YET", Math.floor(w*0.08), Math.floor(h*0.55));
    return;
  }

  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const range = (maxV - minV) || 1;

  const padX = Math.floor(w * 0.07);
  const padY = Math.floor(h * 0.18);

  // Midline (0) if it exists in range, else midline of chart
  const zeroY = (minV <= 0 && maxV >= 0)
    ? (h - padY) - ((0 - minV) / range) * (h - 2*padY)
    : Math.floor(h / 2);

  // subtle midline
  ctx.strokeStyle = "rgba(180,255,210,.18)";
  ctx.lineWidth = Math.max(1, Math.floor(h * 0.01));
  ctx.beginPath();
  ctx.moveTo(padX, zeroY);
  ctx.lineTo(w - padX, zeroY);
  ctx.stroke();

  // line
  ctx.strokeStyle = "rgba(200,255,0,.95)";
  ctx.lineWidth = Math.max(2, Math.floor(h * 0.02));
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();

  for (let i = 0; i < vals.length; i++) {
    const t = (vals.length === 1) ? 1 : (i / (vals.length - 1));
    const x = padX + t * (w - 2*padX);
    const y = (h - padY) - ((vals[i] - minV) / range) * (h - 2*padY);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // last point dot
  const lastT = 1;
  const lx = padX + lastT * (w - 2*padX);
  const ly = (h - padY) - ((vals[vals.length - 1] - minV) / range) * (h - 2*padY);
  ctx.fillStyle = "rgba(46,229,157,.95)";
  const dot = Math.max(4, Math.floor(h * 0.03));
  ctx.fillRect(lx - dot/2, ly - dot/2, dot, dot);
}

async function loadCardDetails(cardId, { silent = true, token = null, forceImage = false } = {}) {
  const myToken = token ?? cardDetailsReqToken;

  try {
    if (!silent) setCardMsg("LOADING COM CARD…", "");

    const res = await fetch(`/api/card_details?id=${encodeURIComponent(cardId)}`);
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}

    if (!res.ok) throw new Error(data?.error || text || "FAILED TO LOAD DETAILS");
    if (myToken !== cardDetailsReqToken || cardId !== currentCardId) return;

    const c = data.card || data.item || data.comCard || data.com_card || null;

    // votes + series: accept multiple backend key names
    const votesRaw = pickFirstArray(data, ["lastVotes", "recentVotes", "votes", "items", "recent_votes"]);
    const seriesRaw = pickFirstArray(data, ["netSeries", "series", "net", "net_series", "chart", "chartSeries", "points"]);
    const votes = votesRaw || [];
    const series = normalizeNetSeries(seriesRaw || []);

    if (cardTitle) cardTitle.textContent = (c?.name ? String(c.name).toUpperCase() : "COM CARD");

    // do NOT refresh image on polling updates
    if (cardImg && c?.imageUrl) {
      const base = c.imageUrl;
      const shouldSet = forceImage || !currentCardImageBase || (currentCardImageBase !== base);
      if (shouldSet) {
        currentCardImageBase = base;
        cardImg.style.visibility = "hidden";
        cardImg.src = base;
        await waitForImage(cardImg);
        if (myToken !== cardDetailsReqToken || cardId !== currentCardId) return;
        cardImg.style.visibility = "visible";
      }
    }

    const up = Number(c?.upvotes ?? 0);
    const down = Number(c?.downvotes ?? 0);
    const score = Number(c?.score ?? (up - down));

    if (cardScorePill) cardScorePill.textContent = `SCORE: ${score}  (▲${up} ▼${down})`;
    if (cardCreatedPill) cardCreatedPill.textContent = `CREATED: ${fmtDate(c?.created_at || c?.createdAt)}`;

    const ownerFull = c?.owner_wallet || c?.ownerWallet || "";
    const ownerShort = shortWallet(ownerFull);
    const cid = c?.id || c?.cardId || cardId;

    // IMPORTANT TEXT CHANGES:
    // - remove "VIEW: LAST 50..." line
    // - no "LAST 50 VOTES" wording anywhere
    if (cardMeta) {
      cardMeta.innerHTML =
        `ID: <span class="linkLike" id="cdId">${escapeHtml(cid)}</span><br/>` +
        `OWNER: <span class="linkLike" id="cdOwner">${escapeHtml(ownerShort)}</span><br/>` +
        `CREATED: ${escapeHtml(fmtTime(c?.created_at || c?.createdAt))}`;
      cardMeta.querySelector("#cdOwner")?.addEventListener("click", async () => {
        if (ownerFull) await openWalletPage(ownerFull);
      });
      cardMeta.querySelector("#cdId")?.addEventListener("click", async () => {
        await navigator.clipboard.writeText(String(cid));
        setCardMsg("CARD ID COPIED.", "ok");
      });
    }

    // votes list: now says RECENT VOTES behavior, but no header text forced here
    if (cardVotesList) {
      if (!votes.length) {
        cardVotesList.innerHTML = `<div class="voteRowLine">NO VOTES YET</div>`;
      } else {
        cardVotesList.innerHTML = votes.map(v => {
          const vv = Number(v.vote ?? v.direction ?? v.value ?? 0);
          const dir = vv === 1 ? "UP" : "DOWN";
          const cls = vv === 1 ? "voteDirUp" : "voteDirDown";
          const wallet = v.voter_wallet || v.voterWallet || v.wallet || "";
          const ts = v.created_at || v.createdAt || v.ts || v.time || null;
          return `
            <div class="voteRowLine">
              <span class="${cls}">${dir}</span>
              <span class="linkLike" data-w="${escapeHtml(wallet)}">${escapeHtml(shortWallet(wallet))}</span>
              <span>${escapeHtml(fmtTime(ts))}</span>
            </div>
          `;
        }).join("");

        cardVotesList.querySelectorAll("[data-w]").forEach(el => {
          el.addEventListener("click", async () => {
            const w = el.getAttribute("data-w");
            if (w) await openWalletPage(w);
          });
        });
      }
    }

    // graph updates live now (series key-flexible + canvas resize)
    drawNetChart(cardChart, series);

    if (cardVoteStatusPill) cardVoteStatusPill.textContent = publicKeyBase58 ? "1 VOTE / DAY" : "CONNECT TO VOTE";

    // CHANGED: no "LAST 50 VOTES" wording
    setCardMsg("RECENT VOTES • LIVE GRAPH", "ok");
  } catch (e) {
    if (myToken !== cardDetailsReqToken) return;
    setCardMsg(String(e.message || e), "bad");
  }
}

/* ---------- init ---------- */
(async function autoReconnect() {
  try {
    const provider = window?.solana;
    if (!provider?.isPhantom) return;
    await connectPhantom({ onlyIfTrusted: true });
  } catch {
    setConnectedUI(false);
  }
})();

setSort(currentSort);
showView("gen");
setCardsBigTitleText("COM CARDS");
setCardsMsg(VOTE_RULE_TEXT, "");
setMyCardsMsg("CONNECT WALLET TO SEE YOUR COM CARDS.", "");

/* NEW: keep details chart width correct if user resizes */
window.addEventListener("resize", () => {
  if (viewCard && !viewCard.classList.contains("hidden") && currentCardId) {
    // redraw without reloading
    try { ensureCanvasSize(cardChart, 140); } catch {}
  }
}, { passive: true });
