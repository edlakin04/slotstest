import bs58 from "https://cdn.skypack.dev/bs58";

const tabGen = document.getElementById("tabGen");
const tabRank = document.getElementById("tabRank");
const tabCards = document.getElementById("tabCards");
const tabMarket = document.getElementById("tabMarket");

const viewGen = document.getElementById("viewGen");
const viewRank = document.getElementById("viewRank");
const viewCards = document.getElementById("viewCards");
const viewWallet = document.getElementById("viewWallet"); // still used for clicking wallet IDs (profile)
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

// ✅ Rank page no longer loads cards:
const rankCardsMsg = document.getElementById("rankCardsMsg");
const rankMiniGrid = document.getElementById("rankMiniGrid");

const btnRefreshCards = document.getElementById("btnRefreshCards");
const cardsMsg = document.getElementById("cardsMsg");
const cardsGrid = document.getElementById("cardsGrid");
const searchCardId = document.getElementById("searchCardId");
const btnSearchCard = document.getElementById("btnSearchCard");
const cardsBigTitle = document.getElementById("cardsBigTitle");

// dropdown
const cardsSortDD = document.getElementById("cardsSortDD");
const cardsSortBtn = document.getElementById("cardsSortBtn");
const cardsSortMenu = document.getElementById("cardsSortMenu");
const cardsSortLabel = document.getElementById("cardsSortLabel");

// wallet profile page (click wallet IDs)
const walletPageSub = document.getElementById("walletPageSub");
const walletRankBig = document.getElementById("walletRankBig");
const walletRankCallout = document.getElementById("walletRankCallout");
const walletCardsMsg = document.getElementById("walletCardsMsg");
const walletCardsGrid = document.getElementById("walletCardsGrid");
const btnBackToCards = document.getElementById("btnBackToCards");

// ✅ NEW: Com Cards page "Board / My Cards"
const btnCardsBoard = document.getElementById("btnCardsBoard");
const btnCardsMine = document.getElementById("btnCardsMine");
const cardsBoardWrap = document.getElementById("cardsBoardWrap");
const cardsMineWrap = document.getElementById("cardsMineWrap");
const myCardsMsg = document.getElementById("myCardsMsg");
const myCardsGrid = document.getElementById("myCardsGrid");
const btnRefreshMine = document.getElementById("btnRefreshMine");

let publicKeyBase58 = null;
let lastImageSrc = null;

let currentSort = "trending";

// vote rule
const VOTE_RULE_TEXT = "RULE: 1 VOTE PER DAY PER WALLET PER CARD. (UP OR DOWN.)";

// caches (session)
const CACHE_TTL_MS = 30_000;
const boardCache = new Map();      // sort -> { items, ts }
const walletCardsCache = new Map(); // wallet -> { items, ts }

const RANKS = [
  { name: "Dust", min: 0 },
  { name: "Hodler", min: 1 },
  { name: "Shiller", min: 1_000 },
  { name: "Chad", min: 10_000 },
  { name: "Whale", min: 100_000 }
];

/* ---------------- helpers ---------------- */

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

function getSortLabel(v){
  if (v === "top") return "TOP";
  if (v === "newest") return "NEWEST";
  return "TRENDING";
}

function setCardsBigTitle(title) {
  if (!cardsBigTitle) return;
  cardsBigTitle.textContent = (title || "TRENDING").toUpperCase();
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

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------------- tabs ---------------- */

tabGen && (tabGen.onclick = () => showView("gen"));

tabRank && (tabRank.onclick = async () => {
  showView("rank");
  // rank page no longer fetches cards
});

tabCards && (tabCards.onclick = async () => {
  showView("cards");
  setSort(currentSort);
  openCardsSection("board");
  await showBoardFromCacheOrLoad();
});

tabMarket && (tabMarket.onclick = () => showView("market"));

/* ---------------- dropdown ---------------- */

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

  openCardsSection("board");
  await showBoardFromCacheOrLoad();
});

document.addEventListener("click", (e) => {
  if (!cardsSortDD || !cardsSortMenu) return;
  if (!cardsSortDD.contains(e.target)) toggleSortMenu(false);
});

/* ---------------- Cards page sub-tabs (Board / My Cards) ---------------- */

function openCardsSection(which) {
  const isBoard = which === "board";
  cardsBoardWrap?.classList.toggle("hidden", !isBoard);
  cardsMineWrap?.classList.toggle("hidden", isBoard);

  btnCardsBoard?.classList.toggle("active", isBoard);
  btnCardsMine?.classList.toggle("active", !isBoard);

  // message bar
  if (isBoard) setCardsMsg(VOTE_RULE_TEXT, "");
}

btnCardsBoard && (btnCardsBoard.onclick = async () => {
  openCardsSection("board");
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

/* ---------------- wallet connect ---------------- */

async function connectPhantom(opts) {
  const provider = requirePhantomOrDeepLink();
  const resp = await provider.connect(opts);
  publicKeyBase58 = resp.publicKey.toBase58();
  if (elWallet) elWallet.textContent = publicKeyBase58;
  setConnectedUI(true);
  await refreshBalanceAndRank();

  // if user is on "My Cards" section, warm it
  if (!viewCards?.classList.contains("hidden") && !cardsMineWrap?.classList.contains("hidden")) {
    await showMyCardsFromCacheOrLoad();
  }
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

  // clear wallet caches only
  walletCardsCache.clear();

  // rank page cards removed
  if (rankCardsMsg) rankCardsMsg.textContent = "";
  if (rankMiniGrid) rankMiniGrid.innerHTML = "";

  setConnectedUI(false);
  setMsg("");
  setCardsMsg(VOTE_RULE_TEXT, "");
  setMyCardsMsg("CONNECT WALLET TO SEE YOUR COM CARDS.", "");
  if (myCardsGrid) myCardsGrid.innerHTML = "";
});

/* ---------------- balance & rank ---------------- */

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

  // your existing gate (change to >=0 for testing)
  const eligible = amt >= 0;
  if (btnGenerate) btnGenerate.disabled = !eligible;

  if (!quiet) {
    setMsg(
      eligible ? "ELIGIBLE. HIT GENERATE." : "HOLD $COMCOIN TO GENERATE.",
      eligible ? "ok" : ""
    );
  }

  // Rank page: stop showing card stuff (optional text)
  if (rankCardsMsg) rankCardsMsg.textContent = "";
  if (rankMiniGrid) rankMiniGrid.innerHTML = "";
}

/* ---------------- generate ---------------- */

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
      outImg.onerror = () => setMsg("IMAGE SAVED BUT CAN’T LOAD IT.", "bad");
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

    // Invalidate only your own cards cache (so My Cards refreshes)
    if (publicKeyBase58) walletCardsCache.delete(publicKeyBase58);

    // refresh My Cards if user is currently there
    if (!viewCards?.classList.contains("hidden") && !cardsMineWrap?.classList.contains("hidden")) {
      await showMyCardsFromCacheOrLoad({ forceNetwork: true });
    }
  } catch (e) {
    setMsg(String(e.message || e), "bad");
  } finally {
    await refreshBalanceAndRank({ quiet: true });
  }
});

/* ---------------- extras ---------------- */

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

/* ---------------- COM CARDS BOARD (fast cache + single loading message) ---------------- */

btnRefreshCards && (btnRefreshCards.onclick = async () => {
  boardCache.delete(currentSort);
  openCardsSection("board");
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

  // instant if cached
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

    // ✅ Render immediately (images can load progressively)
    renderCards(cardsGrid, items, { showWalletLink: true });

    // ✅ Keep "LOADING..." until ALL images in the grid are loaded
    await waitForImagesIn(cardsGrid);

    // Only swap message if still on board view
    if (!viewCards?.classList.contains("hidden") && !cardsBoardWrap?.classList.contains("hidden")) {
      setCardsMsg(VOTE_RULE_TEXT, "");
    }
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

/* ---------------- MY COM CARDS (in Com Cards page) ---------------- */

async function showMyCardsFromCacheOrLoad({ forceNetwork = false } = {}) {
  if (!myCardsGrid) return;

  if (!publicKeyBase58) {
    setMyCardsMsg("CONNECT WALLET TO SEE YOUR COM CARDS.", "");
    myCardsGrid.innerHTML = "";
    return;
  }

  const cached = walletCardsCache.get(publicKeyBase58);
  if (!forceNetwork && cacheFresh(cached) && Array.isArray(cached.items)) {
    setMyCardsMsg(`MY COM CARDS: ${cached.items.length}`, "ok");
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

    // render immediately, keep message until images loaded
    renderCards(myCardsGrid, items, { showWalletLink: false });
    await waitForImagesIn(myCardsGrid);

    setMyCardsMsg(`MY COM CARDS: ${items.length}`, "ok");
  } catch (e) {
    setMyCardsMsg(String(e.message || e), "bad");
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

    // update cached current board counts
    const entry = boardCache.get(currentSort);
    if (entry?.items?.length) {
      for (const it of entry.items) {
        const id = it.id || it.cardId;
        if (id === cardId) {
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

/* ---------------- render cards ---------------- */

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
      ownerSpan.onclick = async () => { await openWalletPage(owner); };
    }

    meta.innerHTML = `
      ID: <span class="linkLike" data-card="${escapeHtml(id)}">${escapeHtml(id)}</span><br/>
      OWNER: <span id="owner-holder"></span><br/>
      DATE: ${escapeHtml(fmtTime(it.created_at || it.createdAt))}<br/>
    `;

    meta.querySelector('[data-card]')?.addEventListener("click", async () => {
      if (!id) return;
      showView("cards");
      openCardsSection("board");
      if (searchCardId) searchCardId.value = id;
      await searchById(id);
    });

    meta.querySelector("#owner-holder")?.replaceWith(ownerSpan);
    card.appendChild(meta);

    // voting row only on board (optional, but keep it everywhere)
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

/* ---------------- wallet profile page (click wallet IDs) ---------------- */

btnBackToCards && (btnBackToCards.onclick = async () => {
  showView("cards");
  openCardsSection("board");
  await showBoardFromCacheOrLoad();
});

async function openWalletPage(wallet) {
  showView("wallet");
  walletPageSub.textContent = `WALLET: ${wallet}`;
  walletCardsMsg.textContent = "LOADING COM CARDS…";
  walletCardsGrid.innerHTML = "";

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
    renderCards(walletCardsGrid, cached.items, { showWalletLink: false });
    await waitForImagesIn(walletCardsGrid);
    walletCardsMsg.textContent = cached.items.length ? `SHOWING ${cached.items.length} COM CARDS.` : "NO COM CARDS YET.";
    return;
  }

  try {
    walletCardsMsg.textContent = "LOADING COM CARDS…";
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

/* ---------------- auto reconnect + init ---------------- */

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
setCardsMsg(VOTE_RULE_TEXT, "");
setMyCardsMsg("CONNECT WALLET TO SEE YOUR COM CARDS.", "");
