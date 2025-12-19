const crypto = require("crypto");

const COOKIE_NAME = "slots_session";

function base64urlEncode(str) {
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
function base64urlDecode(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  return Buffer.from(b64, "base64").toString("utf8");
}

function sign(data, secret) {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

function makeCookieValue(payloadObj) {
  if (!process.env.SESSION_SECRET) throw new Error("Missing SESSION_SECRET env var");
  const payload = base64urlEncode(JSON.stringify(payloadObj));
  const sig = sign(payload, process.env.SESSION_SECRET);
  return `${payload}.${sig}`;
}

function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  const parts = raw.split(";").map(s => s.trim());
  for (const p of parts) {
    const i = p.indexOf("=");
    if (i === -1) continue;
    const k = p.slice(0, i);
    const v = p.slice(i + 1);
    if (k === name) return v;
  }
  return null;
}

function getSession(req) {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return null;

  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  if (!process.env.SESSION_SECRET) return null;
  const expected = sign(payload, process.env.SESSION_SECRET);
  if (expected !== sig) return null;

  try {
    const obj = JSON.parse(base64urlDecode(payload));
    if (!obj.wallet) return null;
    if (obj.exp && Date.now() > obj.exp) return null;
    return obj;
  } catch {
    return null;
  }
}

function setSessionCookie(res, wallet) {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const value = makeCookieValue({ wallet, exp });

  // basic cookie string (no library)
  const secure = process.env.VERCEL_ENV === "production" ? "Secure; " : "";
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; ${secure}Max-Age=${7 * 24 * 60 * 60}`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

module.exports = { getSession, setSessionCookie, clearSessionCookie };
