const router = require("express").Router();
const pool = require("../db");

// ✅ 1) Queue لمحطة المستخدم (لازم authRequired يكون شغال ع /api/stations)
router.get("/my/queue", async (req, res, next) => {
  try {
    const stationId = req.user?.stationId;
    if (!stationId) {
      return res.status(400).json({ ok: false, error: "No station assigned" });
    }

    const [rows] = await pool.execute(
      `
      SELECT gp.piece_id, gp.piece_code, gp.piece_status,
             o.order_code, s.name AS station_name
      FROM glass_pieces gp
      JOIN stations s ON s.station_id = gp.current_station_id
      JOIN orders o ON o.order_id = gp.order_id
      WHERE s.station_id = ?
        AND gp.piece_status IN ('not_started','in_process')
      ORDER BY gp.created_at ASC
      `,
      [stationId]
    );

    res.json({ ok: true, stationId, data: rows });
  } catch (e) {
    next(e);
  }
});

// ✅ 2) Queue بالـID (مفيد لأسماء فيها / أو مسافات)
router.get("/id/:stationId/queue", async (req, res, next) => {
  try {
    const stationId = Number(req.params.stationId);

    const [rows] = await pool.execute(
      `
      SELECT gp.piece_id, gp.piece_code, gp.piece_status,
             o.order_code, s.name AS station_name
      FROM glass_pieces gp
      JOIN stations s ON s.station_id = gp.current_station_id
      JOIN orders o ON o.order_id = gp.order_id
      WHERE s.station_id = ?
        AND gp.piece_status IN ('not_started','in_process')
      ORDER BY gp.created_at ASC
      `,
      [stationId]
    );

    res.json({ ok: true, data: rows });
  } catch (e) {
    next(e);
  }
});

// ✅ 3) Queue بالاسم (مثل Cutting) — لازم تيجي آخر شي
router.get("/:stationName/queue", async (req, res, next) => {
  try {
    const { stationName } = req.params;

    const [rows] = await pool.execute(
      `
      SELECT gp.piece_id, gp.piece_code, gp.piece_status,
             o.order_code, s.name AS station_name
      FROM glass_pieces gp
      JOIN stations s ON s.station_id = gp.current_station_id
      JOIN orders o ON o.order_id = gp.order_id
      WHERE s.name = ?
        AND gp.piece_status IN ('not_started','in_process')
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
