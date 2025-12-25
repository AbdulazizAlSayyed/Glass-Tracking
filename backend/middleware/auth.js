const jwt = require("jsonwebtoken");

function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return res.status(401).json({ ok: false, error: "Unauthorized" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET) || {};

    // ✅ normalize userId (support many token payload shapes)
    const userId =
      payload.userId ??
      payload.id ??
      payload.user_id ??
      payload.uid ??
      payload.sub ??
      null;

    if (!userId) {
      return res
        .status(401)
        .json({ ok: false, error: "Invalid token payload (missing userId)" });
    }

    req.user = { ...payload, userId: Number(userId) || userId };
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: "Invalid token" });
  }
}

module.exports = { authRequired };
