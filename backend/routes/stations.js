const router = require("express").Router();
const pool = require("../db");

function getStationId(req) {
  return req.user?.stationId ?? req.user?.station_id ?? null;
}

/* ===============================
   1) Queue for current user's station
   =============================== */
router.get("/my/queue", async (req, res, next) => {
  try {
    const stationId = getStationId(req);
    if (!stationId) {
      return res.status(400).json({ ok: false, error: "No station assigned" });
    }

    // رجّع بيانات كافية للـ UI
    const [rows] = await pool.execute(
      `
      SELECT 
        gp.id AS piece_id,
        gp.piece_number AS piece_code,
        gp.status AS piece_status,

        o.order_no AS order_code,
        o.client AS customer,
        o.delivery_date AS due_date,

        ol.line_code,
        ol.size,
        ol.glass_type,
        ol.notes AS line_notes,

        s.name AS station_name,
        s.stage_order
      FROM glass_pieces gp
      JOIN stations s ON s.id = gp.current_station_id
      JOIN orders o ON o.id = gp.order_id
      JOIN order_lines ol ON ol.id = gp.line_id
      WHERE gp.current_station_id = ?
        AND gp.status NOT IN ('completed','broken')
      ORDER BY gp.created_at ASC
      `,
      [stationId]
    );

    res.json({ ok: true, stationId, data: rows });
  } catch (err) {
    next(err);
  }
});

/* ===============================
   2) Today passed counter for this station
   =============================== */
router.get("/my/today", async (req, res, next) => {
  try {
    const stationId = getStationId(req);
    if (!stationId) {
      return res.status(400).json({ ok: false, error: "No station assigned" });
    }

    const [rows] = await pool.execute(
      `
      SELECT COUNT(*) AS passedToday
      FROM piece_events
      WHERE station_id = ?
        AND event_type = 'PASS'
        AND DATE(created_at) = CURDATE()
      `,
      [stationId]
    );

    res.json({
      ok: true,
      stationId,
      passedToday: Number(rows[0]?.passedToday || 0),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
