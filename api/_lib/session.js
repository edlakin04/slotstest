const { withIronSessionApiRoute } = require("iron-session/next");

function requireSessionPassword() {
  const pw = process.env.SESSION_PASSWORD;
  if (!pw || pw.length < 32) {
    throw new Error("SESSION_PASSWORD must be set and be 32+ characters");
  }
  return pw;
}

const sessionOptions = {
  password: requireSessionPassword(),
  cookieName: "slots_session",
  cookieOptions: {
    secure: process.env.VERCEL_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  }
};

function withSession(handler) {
  return withIronSessionApiRoute(handler, sessionOptions);
}

module.exports = { withSession };
