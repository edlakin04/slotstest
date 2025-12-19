const { withIronSessionApiRoute } = require("iron-session/next");

const sessionOptions = {
  password: process.env.SESSION_PASSWORD,
  cookieName: "slots_session",
  cookieOptions: {
    secure: process.env.VERCEL_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  },
};

function withSessionRoute(handler) {
  return withIronSessionApiRoute(handler, sessionOptions);
}

module.exports = { withSessionRoute };
