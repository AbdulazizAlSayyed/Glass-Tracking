const jwt = require("jsonwebtoken");

function authRequired(req, res, next) {
  // Check Authorization header
  let token = null;
  const header = req.headers.authorization || "";

  if (header.startsWith("Bearer ")) {
    token = header.slice(7);
  }

  // Also check cookies (if using cookies)
  if (!token && req.cookies && req.cookies.auth_token) {
    token = req.cookies.auth_token;
  }

  if (!token) {
    return res.status(401).json({
      ok: false,
      error: "Authentication required",
    });
  }

  try {
    const secret = process.env.JWT_SECRET || "dev-secret";
    const payload = jwt.verify(token, secret);

    // Extract userId from various possible fields
    const userId =
      payload.userId ??
      payload.id ??
      payload.user_id ??
      payload.uid ??
      payload.sub ??
      null;

    if (!userId) {
      return res.status(401).json({
        ok: false,
        error: "Invalid token: missing user identifier",
      });
    }

    // Add user info to request
    req.user = {
      ...payload,
      userId: Number(userId) || userId,
      token, // Optional: include token if needed
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

    return res.status(401).json({
      ok: false,
      error: "Authentication failed",
    });
  }
}

// Optional: Middleware for role-based access control
function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: "Authentication required",
      });
    }

    const userRole = req.user.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        ok: false,
        error: "Insufficient permissions",
        requiredRoles: allowedRoles,
        userRole: userRole,
      });
    }

    next();
  };
}

// Optional: Soft auth - attach user if token exists but don't require it
function optionalAuth(req, res, next) {
  let token = null;
  const header = req.headers.authorization || "";

  if (header.startsWith("Bearer ")) {
    token = header.slice(7);
  }

  if (!token && req.cookies && req.cookies.auth_token) {
    token = req.cookies.auth_token;
  }

  if (token) {
    try {
      const secret = process.env.JWT_SECRET || "dev-secret";
      const payload = jwt.verify(token, secret);

      const userId =
        payload.userId ??
        payload.id ??
        payload.user_id ??
        payload.uid ??
        payload.sub ??
        null;

      if (userId) {
        req.user = {
          ...payload,
          userId: Number(userId) || userId,
        };
      }
    } catch (e) {
      // Token is invalid but that's ok for optional auth
      console.debug("Optional auth token error:", e.message);
    }
  }

  next();
}

module.exports = {
  authRequired,
  requireRole,
  optionalAuth,
};
