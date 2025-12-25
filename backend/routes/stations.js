const router = require("express").Router();
const pool = require("../db");

// 1) Queue لمحطة المستخدم
router.get("/my/queue", async (req, res, next) => {
  try {
    const stationId = req.user?.stationId;
    if (!stationId) {
      return res.status(400).json({ ok: false, error: "No station assigned" });
    }

    const [rows] = await pool.execute(
      `
      SELECT gp.id AS piece_id,
             gp.piece_code,
             gp.status AS piece_status,
             o.order_no AS order_code,
             s.name AS station_name
      FROM glass_pieces gp
      JOIN stations s ON s.id = gp.current_station_id
      JOIN orders   o ON o.id = gp.order_id
      WHERE s.id = ?
        AND gp.status NOT IN ('completed','broken')
      ORDER BY gp.created_at ASC
      `,
      [stationId]
    );

    res.json({ ok: true, stationId, data: rows });
  } catch (e) {
    next(e);
  }
});

// 2) Queue بالـ ID
router.get("/id/:stationId/queue", async (req, res, next) => {
  try {
    const stationId = Number(req.params.stationId);

    const [rows] = await pool.execute(
      `
      SELECT gp.id AS piece_id,
             gp.piece_code,
             gp.status AS piece_status,
             o.order_no AS order_code,
             s.name AS station_name
      FROM glass_pieces gp
      JOIN stations s ON s.id = gp.current_station_id
      JOIN orders   o ON o.id = gp.order_id
      WHERE s.id = ?
        AND gp.status NOT IN ('completed','broken')
      ORDER BY gp.created_at ASC
      `,
      [stationId]
    );

    res.json({ ok: true, data: rows });
  } catch (e) {
    next(e);
  }
});

// 3) Queue بالاسم
router.get("/:stationName/queue", async (req, res, next) => {
  try {
    const { stationName } = req.params;

    const [rows] = await pool.execute(
      `
      SELECT gp.id AS piece_id,
             gp.piece_code,
             gp.status AS piece_status,
             o.order_no AS order_code,
             s.name AS station_name
      FROM glass_pieces gp
      JOIN stations s ON s.id = gp.current_station_id
      JOIN orders   o ON o.id = gp.order_id
      WHERE s.name = ?
        AND gp.status NOT IN ('completed','broken')
      ORDER BY gp.created_at ASC
      `,
      [stationName]
    );

    res.json({ ok: true, data: rows });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
