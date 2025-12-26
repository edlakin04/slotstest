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

/* ✅ NEW: local “voted today” memory so details page doesn’t revert status */
const votedTodayLocal = new Set(); // key = `${wallet}|${cardId}|${UTC_DAY}`
function utcDayStr(){ return new Date().toISOString().slice(0,10); }
function voteKey(wallet, cardId){ return `${wallet}|${cardId}|${utcDayStr()}`; }
function markVotedToday(wallet, cardId){ if (wallet && cardId) votedTodayLocal.add(voteKey(wallet, cardId)); }
function hasVotedToday(wallet, cardId){ return !!wallet && !!cardId && votedTodayLocal.has(voteKey(wallet, cardId)); }
function setDetailsVotePill(cardId){
  if (!cardVoteStatusPill) return;
  if (!publicKeyBase58) cardVoteStatusPill.textContent = "CONNECT TO VOTE";
  else if (hasVotedToday(publicKeyBase58, cardId)) cardVoteStatusPill.textContent = "VOTE USED (TODAY)";
  else cardVoteStatusPill.textContent = "1 VOTE / DAY";
}

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

function shortWallet(w) {
  if (!w) return "";
  return `${w.slice(0, 4)}…${w.slice(-4)}`;
}

function fmtNum(n){
  const x = Number(n || 0);
  return x.toLocaleString();
}

function escapeHtml(s=""){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function fmtDate(ts){
  if (!ts) return "";
  try {
    const d = new Date(ts);
    return d.toISOString().slice(0,10);
  } catch { return ""; }
}

function rankFor(balance) {
  const b = Number(balance || 0);
  let r = RANKS[0];
  for (const it of RANKS) if (b >= it.min) r = it;
  return r;
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error(data?.error || text || `HTTP ${res.status}`);
  return data;
}

async function inflightOnce(key, fn) {
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try { return await fn(); }
    finally { inflight.delete(key); }
  })();
  inflight.set(key, p);
  return p;
}

/* ---------- phantom ---------- */
function requirePhantomOrDeepLink(){
  const provider = window?.solana;
  if (!provider?.isPhantom) {
    // Deep link fallback for mobile
    window.open("https://phantom.app/", "_blank");
    throw new Error("PHANTOM NOT FOUND.");
  }
  return provider;
}

async function connectWallet() {
  try {
    const provider = requirePhantomOrDeepLink();
    const resp = await provider.connect();
    publicKeyBase58 = resp.publicKey.toString();

    if (elWallet) elWallet.textContent = shortWallet(publicKeyBase58);
    setConnectedUI(true);
    if (btnGenerate) btnGenerate.disabled = false;

    await refreshBalanceAndRank();

    setMsg("WALLET CONNECTED.", "ok");

    // refresh visible views
    if (viewCards && !viewCards.classList.contains("hidden")) {
      if (lastCardsView === "mine") await loadMyCards(true);
      else await loadCards(true);
    }
    if (viewWallet && !viewWallet.classList.contains("hidden")) {
      // wallet page might not be your own wallet; leave
    }
    if (viewCard && !viewCard.classList.contains("hidden")) {
      setDetailsVotePill(currentCardId);
    }
  } catch (e) {
    setMsg(String(e.message || e), "bad");
  }
}

async function disconnectWallet() {
  try {
    const provider = window?.solana;
    if (provider?.isPhantom) await provider.disconnect();
  } catch {}
  publicKeyBase58 = null;
  if (elWallet) elWallet.textContent = "";
  if (elBalance) elBalance.textContent = "0";
  if (elRank) elRank.textContent = "";
  setConnectedUI(false);
  setMsg("DISCONNECTED.", "");
  setDetailsVotePill(currentCardId);
}

async function refreshBalanceAndRank() {
  if (!publicKeyBase58) return;
  const data = await fetchJson(`/api/balance?wallet=${encodeURIComponent(publicKeyBase58)}`);
  const bal = Number(data?.balance ?? 0);

  if (elBalance) elBalance.textContent = fmtNum(bal);

  const rk = rankFor(bal);
  if (elRank) elRank.textContent = rk.name.toUpperCase();

  if (rankBig) rankBig.textContent = rk.name.toUpperCase();
  if (rankCallout) rankCallout.textContent = `${fmtNum(bal)} COMCOIN`;

  if (walletRankBig && viewWallet && !viewWallet.classList.contains("hidden")) {
    walletRankBig.textContent = rk.name.toUpperCase();
    walletRankCallout.textContent = `${fmtNum(bal)} COMCOIN`;
  }
}

/* ---------- generation ---------- */
async function generateCard() {
  try {
    if (!publicKeyBase58) {
      setMsg("CONNECT WALLET TO GENERATE.", "bad");
      showView("gen");
      return;
    }

    setMsg("SIGN TO GENERATE…", "");
    const provider = requirePhantomOrDeepLink();
    const day = utcDayStr();
    const message = `COM COIN daily meme | ${day}`;

    const encoded = new TextEncoder().encode(message);
    const signed = await provider.signMessage(encoded, "utf8");
    const signature = bs58.encode(signed.signature);

    const data = await fetchJson("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pubkey: publicKeyBase58, message, signature })
    });

    lastImageSrc = `/api/image?id=${encodeURIComponent(data.cardId)}&t=${Date.now()}`;

    if (outWrap) outWrap.classList.remove("hidden");
    if (outImg) outImg.src = lastImageSrc;

    if (btnCopyTweet) btnCopyTweet.disabled = false;
    if (btnDownload) btnDownload.disabled = false;

    if (shillText) {
      const txt =
`$COMCOIN just minted a COM CARD.

CARD: ${data.cardId}
OWNER: ${publicKeyBase58}

#comcoin #pumpfun #solana`;
      shillText.value = txt;
    }

    if (cardMetaMini) {
      cardMetaMini.innerHTML = `
        <div><b>ID</b>: ${escapeHtml(data.cardId)}</div>
        <div><b>NAME</b>: ${escapeHtml(String(data.name || "").toUpperCase())}</div>
      `;
    }

    setMsg("CARD MINTED.", "ok");
  } catch (e) {
    setMsg(String(e.message || e), "bad");
  }
}

function copyTweet() {
  try {
    if (!shillText?.value) return;
    navigator.clipboard.writeText(shillText.value);
    setMsg("COPIED.", "ok");
  } catch {
    setMsg("COPY FAILED.", "bad");
  }
}

function downloadImage() {
  if (!lastImageSrc) return;
  const a = document.createElement("a");
  a.href = lastImageSrc;
  a.download = "com_card.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ---------- cards list ---------- */
async function loadCards(force = false) {
  lastCardsView = "board";
  if (cardsMineWrap) cardsMineWrap.classList.add("hidden");
  if (cardsBoardWrap) cardsBoardWrap.classList.remove("hidden");
  setCardsBigTitleText(getSortLabel(currentSort));
  setActiveCardsMessage("LOADING…", "");

  const cacheKey = currentSort;
  const cached = boardCache.get(cacheKey);
  if (!force && cacheFresh(cached)) {
    renderCards(cardsGrid, cached.items, { showWalletLink: true });
    setActiveCardsMessage(VOTE_RULE_TEXT, "ok");
    return;
  }

  const data = await inflightOnce(`cards:${cacheKey}`, async () => {
    return await fetchJson(`/api/cards_list?sort=${encodeURIComponent(currentSort)}`);
  });

  const items = Array.isArray(data?.items) ? data.items : [];
  boardCache.set(cacheKey, { items, ts: Date.now() });
  renderCards(cardsGrid, items, { showWalletLink: true });
  setActiveCardsMessage(VOTE_RULE_TEXT, "ok");
}

async function loadMyCards(force = false) {
  lastCardsView = "mine";
  if (cardsBoardWrap) cardsBoardWrap.classList.add("hidden");
  if (cardsMineWrap) cardsMineWrap.classList.remove("hidden");
  setCardsBigTitleText("MY CARDS");
  setActiveCardsMessage("LOADING…", "");

  if (!publicKeyBase58) {
    setActiveCardsMessage("CONNECT WALLET TO VIEW YOUR CARDS.", "bad");
    renderCards(myCardsGrid, []);
    return;
  }

  const cacheKey = publicKeyBase58;
  const cached = walletCardsCache.get(cacheKey);
  if (!force && cacheFresh(cached)) {
    renderCards(myCardsGrid, cached.items, { showWalletLink: false });
    setActiveCardsMessage(VOTE_RULE_TEXT, "ok");
    return;
  }

  const data = await inflightOnce(`mine:${cacheKey}`, async () => {
    return await fetchJson(`/api/wallet_cards?wallet=${encodeURIComponent(publicKeyBase58)}`);
  });

  const items = Array.isArray(data?.items) ? data.items : [];
  walletCardsCache.set(cacheKey, { items, ts: Date.now() });
  renderCards(myCardsGrid, items, { showWalletLink: false });
  setActiveCardsMessage(VOTE_RULE_TEXT, "ok");
}

async function searchCard() {
  const id = (searchCardId?.value || "").trim();
  if (!id) return;
  try {
    const data = await fetchJson(`/api/card_get?id=${encodeURIComponent(id)}`);
    const item = data?.item ? [data.item] : [];
    renderCards(cardsGrid, item, { showWalletLink: true });
    setActiveCardsMessage("FOUND.", "ok");
  } catch (e) {
    setActiveCardsMessage("NOT FOUND.", "bad");
  }
}

/* ---------- wallet page ---------- */
async function openWalletPage(walletAddr) {
  try {
    showView("wallet");
    if (walletPageSub) walletPageSub.textContent = shortWallet(walletAddr);
    if (walletCardsMsg) walletCardsMsg.textContent = "LOADING…";
    if (walletCardsGrid) walletCardsGrid.innerHTML = "";

    const data = await fetchJson(`/api/wallet_cards?wallet=${encodeURIComponent(walletAddr)}`);
    const items = Array.isArray(data?.items) ? data.items : [];

    renderCards(walletCardsGrid, items, { showWalletLink: false });

    // rank for *viewer* wallet only; keep existing behavior
    if (publicKeyBase58 && walletAddr === publicKeyBase58) {
      await refreshBalanceAndRank();
    } else {
      if (walletRankBig) walletRankBig.textContent = "";
      if (walletRankCallout) walletRankCallout.textContent = "";
    }

    if (walletCardsMsg) walletCardsMsg.textContent = VOTE_RULE_TEXT;
  } catch (e) {
    if (walletCardsMsg) walletCardsMsg.textContent = String(e.message || e);
  }
}

/* ---------- details ---------- */
function stopCardPolling(){
  if (cardPollTimer) clearInterval(cardPollTimer);
  cardPollTimer = null;
}

function startCardPolling(){
  stopCardPolling();
  if (!currentCardId) return;
  cardPollTimer = setInterval(() => {
    loadCardDetails(currentCardId, { silent: true, forceImage: false }).catch(()=>{});
  }, 10_000);
}

async function openCardDetails(cardId){
  currentCardId = cardId;
  currentCardImageBase = null;
  showView("card");
  setDetailsVotePill(cardId);
  await loadCardDetails(cardId, { silent: false, forceImage: true });
  startCardPolling();
}

async function loadCardDetails(cardId, { silent = false, forceImage = false } = {}){
  const token = ++cardDetailsReqToken;

  try {
    if (!silent) setCardMsg("LOADING…", "");

    const data = await fetchJson(`/api/card_details?id=${encodeURIComponent(cardId)}`);
    if (token !== cardDetailsReqToken) return;

    const card = data?.card;
    const votes = Array.isArray(data?.recentVotes) ? data.recentVotes : [];
    const series = Array.isArray(data?.voteSeries) ? data.voteSeries : [];

    // title
    if (cardTitle) cardTitle.textContent = (card?.name || "COM CARD").toUpperCase();

    // image (avoid flicker unless forceImage or first load)
    const imgBase = card?.imageUrl || card?.image_url || "";
    if (forceImage || !currentCardImageBase) {
      currentCardImageBase = imgBase;
      if (cardImg) cardImg.src = imgBase ? `${imgBase}&t=${Date.now()}` : "";
    }

    // meta
    const up = Number(card?.upvotes ?? 0);
    const down = Number(card?.downvotes ?? 0);
    const score = up - down;

    if (cardScorePill) cardScorePill.textContent = `SCORE: ${score}  (▲${up} ▼${down})`;
    if (cardCreatedPill) cardCreatedPill.textContent = fmtDate(card?.created_at || card?.createdAt);

    if (cardMeta) {
      const owner = card?.owner_wallet || card?.ownerWallet || "";
      cardMeta.innerHTML = `
        <div><b>ID</b>: ${escapeHtml(cardId)}</div>
        <div><b>OWNER</b>: <span class="linkLike" id="detailOwner">${escapeHtml(shortWallet(owner))}</span></div>
        <div><b>UP</b>: ${fmtNum(up)} &nbsp;&nbsp; <b>DOWN</b>: ${fmtNum(down)}</div>
      `;
      cardMeta.querySelector("#detailOwner")?.addEventListener("click", async () => {
        if (!owner) return;
        stopCardPolling();
        await openWalletPage(owner);
      });
    }

    // votes list
    if (cardVotesList) {
      cardVotesList.innerHTML = "";
      for (const v of votes) {
        const li = document.createElement("div");
        const w = v?.voter_wallet || v?.voterWallet || "";
        const vv = Number(v?.vote ?? 0);
        const day = v?.vote_day_utc || v?.voteDayUtc || fmtDate(v?.created_at);
        li.className = "voteRow";
        li.innerHTML = `
          <span class="${vv === 1 ? "up" : "down"}">${vv === 1 ? "▲" : "▼"}</span>
          <span class="linkLike" data-wallet="${escapeHtml(w)}">${escapeHtml(shortWallet(w))}</span>
          <span class="voteDay">${escapeHtml(String(day || ""))}</span>
        `;
        li.querySelector("[data-wallet]")?.addEventListener("click", async () => {
          if (!w) return;
          stopCardPolling();
          await openWalletPage(w);
        });
        cardVotesList.appendChild(li);
      }
    }

    // chart (event-based cumulative movement; starts at 0 baseline)
    renderChart(series);

    // keep vote pill correct
    setDetailsVotePill(cardId);

    if (!silent) setCardMsg("", "");
  } catch (e) {
    if (!silent) setCardMsg(String(e.message || e), "bad");
  }
}

function renderChart(voteSeries){
  if (!cardChart) return;
  const canvas = cardChart;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0,0,w,h);

  const vals = [0, ...voteSeries.map(Number)];
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 0);
  const span = Math.max(1, max - min);

  // padding
  const px = 12;
  const py = 12;

  const xStep = (w - px*2) / Math.max(1, vals.length - 1);

  // baseline y for 0
  const y0 = py + (max / span) * (h - py*2);

  // baseline
  ctx.beginPath();
  ctx.moveTo(px, y0);
  ctx.lineTo(w - px, y0);
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // polyline
  ctx.beginPath();
  for (let i=0;i<vals.length;i++){
    const x = px + i * xStep;
    const y = py + ((max - vals[i]) / span) * (h - py*2);
    if (i===0) ctx.moveTo(x,y);
    else ctx.lineTo(x,y);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

/* ---------- cache update after vote ---------- */
function updateCachesAfterVote(cardId, upvotes, downvotes){
  // board cache
  for (const [k, entry] of boardCache.entries()) {
    if (!entry?.items) continue;
    const items = entry.items.map(it => {
      const id = it.id || it.cardId;
      if (id !== cardId) return it;
      return { ...it, upvotes, downvotes, score: upvotes - downvotes };
    });
    boardCache.set(k, { items, ts: entry.ts });
  }

  // wallet cache
  for (const [k, entry] of walletCardsCache.entries()) {
    if (!entry?.items) continue;
    const items = entry.items.map(it => {
      const id = it.id || it.cardId;
      if (id !== cardId) return it;
      return { ...it, upvotes, downvotes, score: upvotes - downvotes };
    });
    walletCardsCache.set(k, { items, ts: entry.ts });
  }
}

/* ---------- voting (FIXED) ---------- */
async function voteCard(cardId, vote, pillEl) {
  const onDetails = viewCard && !viewCard.classList.contains("hidden");

  try {
    if (!publicKeyBase58) {
      if (onDetails) setCardMsg("CONNECT WALLET TO VOTE.", "bad");
      else setActiveCardsMessage("CONNECT WALLET TO VOTE.", "bad");
      showView("gen");
      return;
    }

    // If we already know we voted today (local memory), don’t even prompt signature
    if (hasVotedToday(publicKeyBase58, cardId)) {
      if (onDetails) {
        setDetailsVotePill(cardId);
        setCardMsg("VOTE LIMIT FOR THIS CARD REACHED (TODAY).", "bad");
      } else {
        setActiveCardsMessage("VOTE LIMIT FOR THIS CARD REACHED (TODAY).", "bad");
      }
      return;
    }

    if (onDetails) {
      setCardMsg("SIGN TO VOTE…", "");
      if (cardVoteStatusPill) cardVoteStatusPill.textContent = "SIGNING…";
      if (btnCardVoteUp) btnCardVoteUp.disabled = true;
      if (btnCardVoteDown) btnCardVoteDown.disabled = true;
    } else {
      setActiveCardsMessage("SIGN TO VOTE…", "");
    }

    const provider = requirePhantomOrDeepLink();
    const today = utcDayStr();
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

    // ✅ Handle “already voted” by status code (no string guessing)
    if (res.status === 429) {
      markVotedToday(publicKeyBase58, cardId);
      if (onDetails) {
        setDetailsVotePill(cardId);
        setCardMsg("VOTE LIMIT FOR THIS CARD REACHED (TODAY).", "bad");
      } else {
        setActiveCardsMessage("VOTE LIMIT FOR THIS CARD REACHED (TODAY).", "bad");
      }
      return;
    }

    if (!res.ok) throw new Error(data?.error || text || "VOTE FAILED");

    const up = Number(data?.upvotes ?? 0);
    const down = Number(data?.downvotes ?? 0);
    const score = Number(data?.score ?? (up - down));

    if (pillEl) pillEl.textContent = `SCORE: ${score}  (▲${up} ▼${down})`;

    updateCachesAfterVote(cardId, up, down);

    // ✅ mark locally so details page doesn't revert status
    markVotedToday(publicKeyBase58, cardId);

    if (onDetails) {
      setDetailsVotePill(cardId);
      setCardMsg("VOTE LOCKED FOR TODAY.", "ok");

      if (currentCardId && currentCardId === cardId) {
        setTimeout(() => loadCardDetails(cardId, { silent: true, forceImage: false }), 400);
      }
    } else {
      setActiveCardsMessage(VOTE_RULE_TEXT, "ok");
    }
  } catch (e) {
    const raw = String(e.message || e);

    let nicer = raw;
    if (raw.toLowerCase().includes("invalid vote message")) {
      nicer = "VOTE MESSAGE MISMATCH. REFRESH THE PAGE AND TRY AGAIN.";
    } else if (raw.toLowerCase().includes("invalid signature")) {
      nicer = "SIGNATURE FAILED. TRY AGAIN.";
    } else if (raw.toLowerCase().includes("card not found")) {
      nicer = "CARD NOT FOUND.";
    }

    if (onDetails) {
      setDetailsVotePill(cardId);
      setCardMsg(nicer, "bad");
    } else {
      setActiveCardsMessage(nicer, "bad");
    }
  } finally {
    if (onDetails) {
      const used = hasVotedToday(publicKeyBase58, cardId);
      if (btnCardVoteUp) btnCardVoteUp.disabled = used;
      if (btnCardVoteDown) btnCardVoteDown.disabled = used;
      setDetailsVotePill(cardId);
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

    const pill = document.createElement("div");
    pill.className = "pill";
    pill.textContent = `SCORE: ${score}  (▲${up} ▼${down})`;
    card.appendChild(pill);

    const actions = document.createElement("div");
    actions.className = "cardActions";

    const btnUp = document.createElement("button");
    btnUp.className = "btnVote up";
    btnUp.textContent = "▲ UP";
    btnUp.onclick = async () => {
      await voteCard(id, 1, pill);
      if (opts.afterVote) opts.afterVote(id);
    };

    const btnDown = document.createElement("button");
    btnDown.className = "btnVote down";
    btnDown.textContent = "▼ DOWN";
    btnDown.onclick = async () => {
      await voteCard(id, -1, pill);
      if (opts.afterVote) opts.afterVote(id);
    };

    actions.appendChild(btnUp);
    actions.appendChild(btnDown);
    card.appendChild(actions);

    container.appendChild(card);
  }
}

/* ---------- ui wiring ---------- */
tabGen?.addEventListener("click", () => showView("gen"));
tabRank?.addEventListener("click", () => showView("rank"));
tabCards?.addEventListener("click", async () => {
  showView("cards");
  if (lastCardsView === "mine") await loadMyCards(false);
  else await loadCards(false);
});
tabMarket?.addEventListener("click", () => showView("market"));

btnConnect?.addEventListener("click", connectWallet);
btnDisconnect?.addEventListener("click", disconnectWallet);
btnGenerate?.addEventListener("click", generateCard);
btnCopyTweet?.addEventListener("click", copyTweet);
btnDownload?.addEventListener("click", downloadImage);

btnRefreshCards?.addEventListener("click", async () => await loadCards(true));
btnRefreshMine?.addEventListener("click", async () => await loadMyCards(true));

btnSearchCard?.addEventListener("click", async () => await searchCard());

btnCardsBoard?.addEventListener("click", async () => {
  lastCardsView = "board";
  await loadCards(false);
});
btnCardsMine?.addEventListener("click", async () => {
  lastCardsView = "mine";
  await loadMyCards(false);
});

cardsSortBtn?.addEventListener("click", () => toggleSortMenu());
cardsSortMenu?.addEventListener("click", async (e) => {
  const v = e?.target?.getAttribute?.("data-sort");
  if (!v) return;
  toggleSortMenu(false);
  setSort(v);
  await loadCards(true);
});
document.addEventListener("click", (e) => {
  if (!cardsSortMenu || cardsSortMenu.classList.contains("hidden")) return;
  if (cardsSortDD?.contains(e.target)) return;
  toggleSortMenu(false);
});

btnBackToCards?.addEventListener("click", async () => {
  showView("cards");
  if (lastCardsView === "mine") await loadMyCards(false);
  else await loadCards(false);
});

btnCardBack?.addEventListener("click", async () => {
  stopCardPolling();
  showView("cards");
  if (lastCardsView === "mine") await loadMyCards(false);
  else await loadCards(false);
});

btnCardRefresh?.addEventListener("click", async () => {
  if (!currentCardId) return;
  await loadCardDetails(currentCardId, { silent: false, forceImage: false });
});

btnCardVoteUp?.addEventListener("click", async () => {
  if (!currentCardId) return;
  await voteCard(currentCardId, 1, cardScorePill);
  setDetailsVotePill(currentCardId);
});

btnCardVoteDown?.addEventListener("click", async () => {
  if (!currentCardId) return;
  await voteCard(currentCardId, -1, cardScorePill);
  setDetailsVotePill(currentCardId);
});

/* ---------- init ---------- */
(function init(){
  setConnectedUI(false);
  setSort(currentSort);
  showView("gen");

  // pre-load board when going to cards
  if (cardsGrid) cardsGrid.innerHTML = "";
})();
