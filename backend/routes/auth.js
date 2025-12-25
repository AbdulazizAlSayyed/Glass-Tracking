// backend/routes/auth.js
const router = require("express").Router();
const pool = require("../db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// POST /api/auth/login
router.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res
        .status(400)
        .json({ ok: false, error: "username and password are required" });
    }

    const [rows] = await pool.execute(
      `
      SELECT
        id,
        username,
        password_hash,
        role,
        is_active,
        home_page
      FROM users
      WHERE username = ?
      LIMIT 1
      `,
      [username]
    );

    if (!rows.length) {
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }

    const user = rows[0];

    if (!user.is_active) {
      return res
        .status(403)
        .json({ ok: false, error: "User is disabled. Contact admin." });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }

    // 👇 sign JWT (same secret as your authRequired)
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
      },
      process.env.JWT_SECRET || "dev-secret",
      { expiresIn: "7d" }
    );

    // 👇 this object goes to localStorage as "user"
    res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        homePage: user.home_page, // ⭐ important
      },
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
