const jwt = require("jsonwebtoken");
const pool = require("../db");

function extractToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);

  if (req.cookies && req.cookies.auth_token) return req.cookies.auth_token;

  return null;
}

function extractUserId(payload) {
  const raw =
    payload.userId ??
    payload.id ??
    payload.user_id ??
    payload.uid ??
    payload.sub ??
    null;

  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
}

async function loadUserFromDb(userId) {
  const [rows] = await pool.execute(
    `
    SELECT 
      u.id,
      u.username,
      u.role,
      u.home_page,
      u.station_id,
      u.is_active,
      s.name AS station_name
    FROM users u
    LEFT JOIN stations s ON s.id = u.station_id
    WHERE u.id = ? 
    LIMIT 1
    `,
    [userId]
  );
  return rows[0] || null;
}

// =======================
// AUTH REQUIRED
// =======================
async function authRequired(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res
      .status(401)
      .json({ ok: false, error: "Authentication required" });
  }

  try {
    const secret = process.env.JWT_SECRET || "dev-secret";
    const payload = jwt.verify(token, secret);

    const userId = extractUserId(payload);
    if (!userId) {
      return res.status(401).json({ ok: false, error: "Invalid token" });
    }

    const user = await loadUserFromDb(userId);
    if (!user) {
      return res.status(401).json({ ok: false, error: "User not found" });
    }
    if (user.is_active === 0) {
      return res.status(403).json({ ok: false, error: "User is disabled" });
    }

    // ✅ Standardized fields + backward compatible
    req.user = {
      id: user.id,
      userId: user.id,

      username: user.username,
      role: user.role,

      homePage: user.home_page,
      home_page: user.home_page, // (optional compatibility)

      stationId: user.station_id,
      station_id: user.station_id, // (compatibility)
      stationName: user.station_name,

      token, // optional
    };

    next();
  } catch (error) {
    console.error("Token verification error:", error.message);

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        ok: false,
        error: "Token expired",
        code: "TOKEN_EXPIRED",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        ok: false,
        error: "Invalid token",
        code: "INVALID_TOKEN",
      });
    }

    return res.status(401).json({ ok: false, error: "Authentication failed" });
  }
}

// =======================
// ROLE BASED ACCESS
// =======================
function requireRole(roles) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.user) {
      return res
        .status(401)
        .json({ ok: false, error: "Authentication required" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        ok: false,
        error: "Insufficient permissions",
        requiredRoles: allowedRoles,
        userRole: req.user.role,
      });
    }
    next();
  };
}

// =======================
// OPTIONAL AUTH
// =======================
async function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return next();

  try {
    const secret = process.env.JWT_SECRET || "dev-secret";
    const payload = jwt.verify(token, secret);

    const userId = extractUserId(payload);
    if (!userId) return next();

    const user = await loadUserFromDb(userId);
    if (!user || user.is_active === 0) return next();

    req.user = {
      id: user.id,
      userId: user.id,
      username: user.username,
      role: user.role,
      homePage: user.home_page,
      stationId: user.station_id,
      stationName: user.station_name,
      token,
    };

    return next();
  } catch (err) {
    // optional => ignore invalid token
    console.debug("Optional auth token error:", err.message);
    return next();
  }
}

module.exports = {
  authRequired,
  requireRole,
  optionalAuth,
};
