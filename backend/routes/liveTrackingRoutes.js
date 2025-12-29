const router = require("express").Router();
const pool = require("../db");
const { authRequired } = require("../middleware/auth");

// GET /api/live-tracking
router.get("/", authRequired, async (req, res) => {
  let conn;

  try {
    conn = await pool.getConnection();

    // 1️⃣ Get Active Stations
    const [stations] = await conn.execute(`
      SELECT 
        id, 
        code, 
        name, 
        stage_order 
      FROM stations
      WHERE is_active = 1
      ORDER BY stage_order ASC
    `);

    // 2️⃣ Get Active Glass Pieces Grouped by Station + Order
    const [rows] = await conn.execute(`
      SELECT
        gp.current_station_id AS station_id,
        o.id AS order_id,
        o.order_no,
        o.client,
        DATE_FORMAT(o.delivery_date, '%Y-%m-%d') AS delivery_date,
        COUNT(*) AS pieces
      FROM glass_pieces gp
      JOIN orders o ON o.id = gp.order_id
      WHERE gp.current_station_id IS NOT NULL
        AND gp.status NOT IN ('completed', 'broken')
        AND o.status NOT IN ('Cancelled')
      GROUP BY gp.current_station_id, gp.order_id
      ORDER BY o.delivery_date ASC, o.order_no ASC
    `);

    // 3️⃣ Format Result
    const result = stations.map((st) => ({
      station_id: st.id,
      station_code: st.code,
      station_name: st.name,
      stage_order: st.stage_order,
      orders: rows.filter((r) => r.station_id === st.id),
    }));

    res.json({ ok: true, data: result });
  } catch (err) {
    console.error("LIVE TRACKING ERROR:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
