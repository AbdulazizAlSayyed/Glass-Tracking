const router = require("express").Router();
const pool = require("../db");
const bcrypt = require("bcryptjs");
const { authRequired } = require("../middleware/auth");

// ممكن تضبطهم من config إذا حابب
const AVAILABLE_ROLES = [
  "admin",
  "order_creator",
  "activation",
  "station_worker",
  "delivery",
];

// GET /api/users  -> list users + roles + stations
router.get("/", authRequired, async (req, res, next) => {
  let conn;
  try {
    conn = await pool.getConnection();

    const [userRows] = await conn.execute(`
      SELECT
        u.id,
        u.username,
        u.role,
        u.is_active,
        u.station_id,
        u.home_page,
        u.full_name,
        u.email,
        s.name AS station_name
      FROM users u
      LEFT JOIN stations s ON s.id = u.station_id
      ORDER BY u.username ASC
    `);

    const [stationRows] = await conn.execute(`
      SELECT id, name
      FROM stations
      WHERE is_active = 1
      ORDER BY stage_order ASC
    `);

    const users = userRows.map((u) => ({
      id: u.id,
      username: u.username,
      fullName: u.full_name || "",
      role: u.role,
      stationId: u.station_id,
      stationName: u.station_name || "–",
      status: u.is_active ? "active" : "disabled",
      lastLogin: null, // ما عندنا كولوم لها، ممكن تضيفه لاحقاً
      homePage: u.home_page || "",
      email: u.email || "",
    }));

    const stations = stationRows.map((s) => ({
      id: s.id,
      name: s.name,
    }));

    res.json({
      ok: true,
      users,
      roles: AVAILABLE_ROLES,
      stations,
    });
  } catch (err) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/users  -> create user
router.post("/", authRequired, async (req, res, next) => {
  let conn;
  try {
    const {
      username,
      fullName,
      role,
      stationId,
      status,
      email,
      homePage,
      password,
    } = req.body || {};

    if (!username || !fullName || !role) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing required fields" });
    }

    conn = await pool.getConnection();

    // check duplicate
    const [exists] = await conn.execute(
      "SELECT id FROM users WHERE username = ? LIMIT 1",
      [username.trim()]
    );
    if (exists.length) {
      return res
        .status(400)
        .json({ ok: false, error: "Username already exists" });
    }

    const pass = password && password.trim() ? password.trim() : "123456";
    const passwordHash = await bcrypt.hash(pass, 10);

    const [result] = await conn.execute(
      `
      INSERT INTO users (username, password_hash, role, is_active, station_id, home_page, full_name, email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        username.trim(),
        passwordHash,
        role,
        status === "disabled" ? 0 : 1,
        stationId || null,
        homePage || null,
        fullName,
        email || null,
      ]
    );

    res.json({
      ok: true,
      user: {
        id: result.insertId,
        username,
        fullName,
        role,
        stationId: stationId || null,
        stationName: null,
        status: status === "disabled" ? "disabled" : "active",
        lastLogin: null,
        email: email || "",
        homePage: homePage || "",
      },
      tempPassword: pass,
    });
  } catch (err) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/users/:id  -> update basic info
router.put("/:id", authRequired, async (req, res, next) => {
  let conn;
  try {
    const userId = req.params.id;
    const { fullName, role, stationId, status, email, homePage } =
      req.body || {};

    conn = await pool.getConnection();

    await conn.execute(
      `
      UPDATE users
      SET full_name = ?, role = ?, station_id = ?, is_active = ?, email = ?, home_page = ?
      WHERE id = ?
    `,
      [
        fullName || null,
        role || null,
        stationId || null,
        status === "disabled" ? 0 : 1,
        email || null,
        homePage || null,
        userId,
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/users/:id/reset-password
router.post("/:id/reset-password", authRequired, async (req, res, next) => {
  let conn;
  try {
    const userId = req.params.id;
    const newPass =
      (req.body && req.body.password) ||
      Math.random().toString(36).slice(2, 10);
    const hash = await bcrypt.hash(newPass, 10);

    conn = await pool.getConnection();
    await conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", [
      hash,
      userId,
    ]);

    res.json({ ok: true, tempPassword: newPass });
  } catch (err) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

// DELETE /api/users/:id
router.delete("/:id", authRequired, async (req, res, next) => {
  let conn;
  try {
    const userId = req.params.id;
    conn = await pool.getConnection();
    await conn.execute("DELETE FROM users WHERE id = ?", [userId]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
