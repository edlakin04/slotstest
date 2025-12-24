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

/* ---------------- Loading overlays (simple) ---------------- */

function setLoading(containerEl, on, text = "LOADING…") {
  if (!containerEl) return;

  let overlay = containerEl.querySelector(":scope > ._px_loading");
  if (on) {
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "_px_loading";
      overlay.style.position = "absolute";
      overlay.style.inset = "0";
      overlay.style.display = "flex";
      overlay.style.alignItems = "center";
      overlay.style.justifyContent = "center";
      overlay.style.background = "rgba(0,0,0,.65)";
      overlay.style.border = "4px solid rgba(180,255,210,.18)";
      overlay.style.boxShadow = "0 10px 0 rgba(0,0,0,.45)";
      overlay.style.zIndex = "40";
      overlay.style.pointerEvents = "none";

      const inner = document.createElement("div");
      inner.style.fontFamily = `"Press Start 2P", monospace`;
      inner.style.fontSize = "12px";
      inner.style.letterSpacing = ".14em";
      inner.style.textTransform = "uppercase";
      inner.style.color = "#C8FF00";
      inner.style.textShadow = "0 10px 0 rgba(0,0,0,.45)";
      inner.textContent = text;

      overlay.appendChild(inner);

      // ensure container has positioning
      const style = getComputedStyle(containerEl);
      if (style.position === "static") containerEl.style.position = "relative";

      containerEl.appendChild(overlay);
    } else {
      overlay.querySelector("div") && (overlay.querySelector("div").textContent = text);
      overlay.style.display = "flex";
    }
  } else {
    if (overlay) overlay.style.display = "none";
  }
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

  // instant from cache if available
  showCardsFromCacheOrLoad();
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

  // warm rank cache
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

  // keep board cache (public data), but clear wallet caches
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

    // refresh caches lightly (optional)
    myRankCardsCache = { items: null, ts: 0 };
    if (publicKeyBase58) walletCardsCache.delete(publicKeyBase58);

    if (!viewCards?.classList.contains("hidden")) {
      boardCache.delete(currentSort); // force refresh next load
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

/* ---------------- Com Cards: cache + loading ---------------- */

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
  // If cached and fresh → render instantly
  const cached = boardCache.get(currentSort);
  if (!forceNetwork && cacheFresh(cached) && Array.isArray(cached.items)) {
    setCardsMsg(VOTE_RULE_TEXT, "");
    renderCards(cardsGrid, cached.items, { showWalletLink: true });

    // optional background refresh if close to stale
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
      setCardsMsg(VOTE_RULE_TEXT, "");
      setLoading(viewCards, true, "LOADING COM CARDS…");
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

    // Only render if user is still on cards view
    if (!viewCards.classList.contains("hidden")) {
      renderCards(cardsGrid, items, { showWalletLink: true });
      if (!background) setCardsMsg(VOTE_RULE_TEXT, "");
    }
  } catch (e) {
    if (!background) setCardsMsg(String(e.message || e), "bad");
  } finally {
    if (!background) setLoading(viewCards, false);
  }
}

async function searchById(cardId) {
  try {
    setCardsMsg("SEARCHING…", "");
    setLoading(viewCards, true, "SEARCHING…");
    if (cardsGrid) cardsGrid.innerHTML = "";

    const res = await fetch(`/api/card_get?id=${encodeURIComponent(cardId)}`);
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}

    if (!res.ok) throw new Error(data?.error || text || "NOT FOUND");

    const item = data?.item;
    if (!item) throw new Error("NOT FOUND");

    setCardsMsg(VOTE_RULE_TEXT, "");
    renderCards(cardsGrid, [item], { showWalletLink: true });
  } catch (e) {
    setCardsMsg(String(e.message || e), "bad");
  } finally {
    setLoading(viewCards, false);
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

    // Update cached board counts instantly (so switching tabs stays instant)
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

/* ---------------- Rendering ---------------- */

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

/* ---------------- Wallet profile + rank cards (cache + loading) ---------------- */

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

  // cache hit
  const cached = walletCardsCache.get(wallet);
  if (cacheFresh(cached) && Array.isArray(cached.items)) {
    walletCardsMsg.textContent = `SHOWING ${cached.items.length} COM CARDS.`;
    renderCards(walletCardsGrid, cached.items, { showWalletLink: false });
    // background refresh
    if ((Date.now() - cached.ts) > (CACHE_TTL_MS * 0.8)) {
      loadWalletCards(wallet, { background: true }).catch(() => {});
    }
    return;
  }

  await loadWalletCards(wallet, { background: false });
}

async function loadWalletCards(wallet, { background = false } = {}) {
  try {
    if (!background) setLoading(viewWallet, true, "LOADING WALLET…");

    const res = await fetch(`/api/wallet_cards?wallet=${encodeURIComponent(wallet)}&limit=100`);
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}

    if (!res.ok) throw new Error(data?.error || text || "FAILED TO LOAD WALLET CARDS");

    const items = data?.items || [];
    walletCardsCache.set(wallet, { items, ts: Date.now() });

    if (!items.length) {
      if (!background) walletCardsMsg.textContent = "NO COM CARDS YET.";
      return;
    }

    if (!viewWallet.classList.contains("hidden")) {
      walletCardsMsg.textContent = `SHOWING ${items.length} COM CARDS.`;
      renderCards(walletCardsGrid, items, { showWalletLink: false });
    }
  } catch (e) {
    if (!background) walletCardsMsg.textContent = String(e.message || e);
  } finally {
    if (!background) setLoading(viewWallet, false);
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
      renderRankMini(myRankCardsCache.items);
      // background refresh
      if ((Date.now() - myRankCardsCache.ts) > (CACHE_TTL_MS * 0.8)) {
        loadRankCards({ preferCache: false }).catch(() => {});
      }
      return;
    }

    if (rankCardsMsg) rankCardsMsg.textContent = "LOADING YOUR COM CARDS…";
    if (rankMiniGrid) rankMiniGrid.innerHTML = "";
    setLoading(viewRank, true, "LOADING RANK…");

    const res = await fetch(`/api/wallet_cards?wallet=${encodeURIComponent(publicKeyBase58)}&limit=100`);
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}

    if (!res.ok) throw new Error(data?.error || text || "FAILED TO LOAD");

    const items = data?.items || [];
    myRankCardsCache = { items, ts: Date.now() };

    renderRankMini(items);
  } catch (e) {
    if (rankCardsMsg) rankCardsMsg.textContent = String(e.message || e);
  } finally {
    setLoading(viewRank, false);
  }
}

function renderRankMini(items) {
  if (!rankMiniGrid || !rankCardsMsg) return;

  if (!items?.length) {
    rankCardsMsg.textContent = "NO COM CARDS YET. GO GENERATE ONE.";
    rankMiniGrid.innerHTML = "";
    return;
  }

  rankCardsMsg.textContent = `YOU HAVE ${items.length} COM CARDS.`;
  rankMiniGrid.innerHTML = "";

  for (const it of items.slice(0, 24)) {
    const img = document.createElement("img");
    img.className = "miniThumb";
    img.src = it.imageUrl || it.image_url || "";
    img.alt = it.name || "COM CARD";
    img.onclick = async () => {
      showView("cards");
      if (searchCardId) searchCardId.value = it.id;
      setSort(currentSort);
      setCardsMsg(VOTE_RULE_TEXT, "");
      await searchById(it.id);
    };
    rankMiniGrid.appendChild(img);
  }
}

/* ---------------- Init + auto reconnect ---------------- */

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
