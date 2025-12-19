const { withSessionRoute } = require("../_lib/session");
const { getPool } = require("../_lib/db");

function randHex(len) {
  const chars = "abcdef0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

const nameA = ["Neon","Turbo","Ghost","Violet","Chrome","Solar","Apex","Shadow","Feral","Nova","Glitch","Pixel","Hyper","Omega","Void","Mint","Lunar","Prism","Rogue","Flux"];
const nameB = ["Trump","Wizard","Monkey","Whale","Cat","Pepe","Rocket","Goblin","Knight","Alien","Dragon","Degen","Reaper","Angel","Bot","King","Queen","Titan","Hacker","Joker"];
const nameC = ["Protocol","Poster","Slot","Board","Cannon","Machine","Signal","Hype","Wave","Engine","Temple","Arena","Mint","Market","Scroll","Portal","Gem","Grail","Relay","Index"];
function randChoice(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function makeName(){ return `${randChoice(nameA)} ${randChoice(nameB)} ${randChoice(nameC)}`; }

async function handler(req, res) {
  const p = getPool();

  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const wallet = req.session?.user?.wallet;
    if (!wallet) return res.status(401).json({ error: "Not logged in" });

    const COST = 20;

    await p.query("BEGIN");

    const u = await p.query("SELECT fake_balance FROM users WHERE wallet=$1 FOR UPDATE", [wallet]);
    if (u.rowCount === 0) {
      await p.query("ROLLBACK");
      return res.status(400).json({ error: "User not found" });
    }

    const bal = Number(u.rows[0].fake_balance);
    if (bal < COST) {
      await p.query("ROLLBACK");
      return res.status(400).json({ error: "Insufficient fake balance" });
    }

    const newBal = bal - COST;
    await p.query("UPDATE users SET fake_balance=$1 WHERE wallet=$2", [newBal, wallet]);

    const now = Date.now();
    const slot = {
      // id gets assigned later, we patch it after insert
      id: 0,
      name: makeName(),
      createdAt: now,
      creatorWallet: wallet,
      ownerWallet: wallet,
      lockedUntil: now + 2 * 60 * 1000,
      votes: [],
      sales: [],
      priceHistory: [{ t: now, priceUSD: 5 }],
      up: 0,
      down: 0,
      scoreS: 0,
      priceUSD: 5,
      lastVoteAt: now,
      voteRatePerSec: 0.0, // DB-created slots don't auto-sim votes unless your frontend adds them
      _db: true,
      _nonce: randHex(6),
    };

    const ins = await p.query(
      "INSERT INTO slots (wallet, slot_json) VALUES ($1, $2) RETURNING id",
      [wallet, slot]
    );

    slot.id = Number(ins.rows[0].id);

    // update stored json with real id
    await p.query("UPDATE slots SET slot_json=$1 WHERE id=$2", [slot, slot.id]);

    await p.query("COMMIT");

    res.status(200).json({ ok: true, slot, fake_balance: newBal });
  } catch (err) {
    try { await p.query("ROLLBACK"); } catch(_e){}
    console.error("slots/create error:", err);
    res.status(500).json({ error: "Server error", message: err.message });
  }
}

module.exports = withSessionRoute(handler);
