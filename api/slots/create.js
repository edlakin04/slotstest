const { getPool } = require("../_lib/db");
const { withSession } = require("../_lib/session");

const CREATE_COST = 20;

function randInt(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}
function randChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const nameA = ["Neon","Turbo","Ghost","Violet","Chrome","Solar","Apex","Shadow","Feral","Nova","Glitch","Pixel","Hyper","Omega","Void","Mint","Lunar","Prism","Rogue","Flux"];
const nameB = ["Trump","Wizard","Monkey","Whale","Cat","Pepe","Rocket","Goblin","Knight","Alien","Dragon","Degen","Reaper","Angel","Bot","King","Queen","Titan","Hacker","Joker"];
const nameC = ["Protocol","Poster","Slot","Board","Cannon","Machine","Signal","Hype","Wave","Engine","Temple","Arena","Mint","Market","Scroll","Portal","Gem","Grail","Relay","Index"];
function makeName(){ return `${randChoice(nameA)} ${randChoice(nameB)} ${randChoice(nameC)}`; }

async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const wallet = req.session.wallet;
    if (!wallet) return res.status(401).json({ error: "Not signed in" });

    const p = getPool();

    // Check balance
    const u = await p.query("SELECT fake_balance FROM users WHERE wallet=$1", [wallet]);
    if (u.rowCount === 0) return res.status(401).json({ error: "User not found" });

    const bal = Number(u.rows[0].fake_balance);
    if (bal < CREATE_COST) return res.status(400).json({ error: "Insufficient fake balance" });

    // Deduct + create slot
    await p.query("UPDATE users SET fake_balance = fake_balance - $2 WHERE wallet=$1", [wallet, CREATE_COST]);

    const createdAt = new Date();
    const lockedUntil = new Date(Date.now() + 2 * 60 * 1000);

    // This JSON matches your front-end shape closely enough to render in "My slots"
    const slot = {
      id: null, // DB id will be returned
      name: makeName(),
      createdAt: createdAt.getTime(),
      creatorWallet: wallet,
      ownerWallet: wallet,
      lockedUntil: lockedUntil.getTime(),
      votes: [],
      sales: [],
      priceHistory: [{ t: createdAt.getTime(), priceUSD: 5 }],
      up: 0,
      down: 0,
      scoreS: 0,
      priceUSD: 5,
      lastVoteAt: createdAt.getTime(),
      voteRatePerSec: randInt(1, 4) // not important for persisted slots
    };

    const ins = await p.query(
      "INSERT INTO slots (wallet, name, slot_json) VALUES ($1,$2,$3) RETURNING id, created_at",
      [wallet, slot.name, slot]
    );

    const slotId = Number(ins.rows[0].id);
    slot.id = slotId;

    const b2 = await p.query("SELECT fake_balance FROM users WHERE wallet=$1", [wallet]);

    return res.status(200).json({
      ok: true,
      slot,
      fake_balance: Number(b2.rows[0].fake_balance)
    });
  } catch (err) {
    console.error("slots/create error:", err);
    return res.status(500).json({ error: "Server error", message: err.message });
  }
}

module.exports = withSession(handler);
