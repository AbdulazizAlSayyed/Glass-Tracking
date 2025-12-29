// backend/routes/reports.js
const router = require("express").Router();
const pool = require("../db");
const { authRequired } = require("../middleware/auth");

// helper: YYYY-MM-DD
function toDateString(d) {
  const date = new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

router.get("/base", authRequired, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();

    // آخر 30 يوم (مثل ما كنا نعمل بالـ front)
    const today = new Date();
    const start30 = new Date(today);
    start30.setDate(start30.getDate() - 29);

    const from = toDateString(start30);
    const to = toDateString(today);

    const fromTs = from + " 00:00:00";
    const toTs = to + " 23:59:59";

    // 1) المحطات
    const [stationRows] = await conn.execute(
      `SELECT id, code, name, stage_order
       FROM stations
       WHERE is_active = 1
       ORDER BY stage_order ASC`
    );

    const stationMap = new Map(stationRows.map((s) => [s.id, s.name]));
    const deliveryStationIds = stationRows
      .filter(
        (s) =>
          (s.name && s.name.toLowerCase().includes("delivery")) ||
          (s.code && s.code.toLowerCase().includes("delivery"))
      )
      .map((s) => s.id);
    const deliverySet = new Set(deliveryStationIds);

    // 2) العملاء (customers)
    const [customerRows] = await conn.execute(
      `SELECT DISTINCT client
         FROM orders
        WHERE created_at BETWEEN ? AND ?
          AND status <> 'Cancelled'
        ORDER BY client ASC`,
      [fromTs, toTs]
    );

    // 3) الأوردارات
    const [orderRows] = await conn.execute(
      `SELECT id, order_no, client, delivery_date, created_at, status
         FROM orders
        WHERE created_at BETWEEN ? AND ?
          AND status <> 'Cancelled'`,
      [fromTs, toTs]
    );

    const orderMap = new Map(orderRows.map((o) => [o.id, o]));

    // 4) قطع الزجاج
    const [pieceRows] = await conn.execute(
      `SELECT gp.id AS piece_id,
              gp.order_id,
              gp.current_station_id,
              gp.status
         FROM glass_pieces gp
         JOIN orders o ON o.id = gp.order_id
        WHERE o.created_at BETWEEN ? AND ?
          AND o.status <> 'Cancelled'`,
      [fromTs, toTs]
    );

    const piecesByOrder = new Map(); // order_id -> Set(piece_id)
    pieceRows.forEach((p) => {
      if (!piecesByOrder.has(p.order_id))
        piecesByOrder.set(p.order_id, new Set());
      piecesByOrder.get(p.order_id).add(p.piece_id);
    });

    // 5) الـ users (للأسماء)
    const [userRows] = await conn.execute(
      `SELECT id, full_name, username FROM users`
    );
    const userMap = new Map(
      userRows.map((u) => [u.id, u.full_name || u.username || "Unknown"])
    );

    // 6) أحداث القطع
    const [eventRows] = await conn.execute(
      `SELECT pe.id,
              pe.piece_id,
              pe.event_type,
              pe.station_id,
              pe.user_id,
              pe.notes,
              pe.created_at,
              gp.order_id
         FROM piece_events pe
         JOIN glass_pieces gp ON gp.id = pe.piece_id
         JOIN orders o ON o.id = gp.order_id
        WHERE pe.created_at BETWEEN ? AND ?
          AND o.status <> 'Cancelled'`,
      [fromTs, toTs]
    );

    /* ---------- DELIVERY INFO لكل order ---------- */

    const deliveryInfoByOrder = new Map(); // order_id -> {deliveredPieces:Set, lastDeliveredAt}
    eventRows.forEach((ev) => {
      if (ev.event_type !== "PASS") return;
      if (!deliverySet.has(ev.station_id)) return;
      const oId = ev.order_id;
      if (!deliveryInfoByOrder.has(oId)) {
        deliveryInfoByOrder.set(oId, {
          deliveredPieces: new Set(),
          lastDeliveredAt: null,
        });
      }
      const info = deliveryInfoByOrder.get(oId);
      info.deliveredPieces.add(ev.piece_id);
      const dt = new Date(ev.created_at);
      if (!info.lastDeliveredAt || dt > info.lastDeliveredAt) {
        info.lastDeliveredAt = dt;
      }
    });

    const orders = orderRows.map((o) => {
      const pieces = piecesByOrder.get(o.id) || new Set();
      const totalPieces = pieces.size || 0;
      const info = deliveryInfoByOrder.get(o.id);
      const deliveredCount = info ? info.deliveredPieces.size : 0;

      let deliveryType = "-";
      if (deliveredCount > 0 && deliveredCount < totalPieces)
        deliveryType = "Partial";
      if (deliveredCount > 0 && deliveredCount === totalPieces)
        deliveryType = "Full";

      const deliveredDate =
        info && info.lastDeliveredAt
          ? toDateString(info.lastDeliveredAt)
          : null;

      return {
        id: o.id,
        orderNo: o.order_no,
        customer: o.client,
        createdDate: toDateString(o.created_at),
        dueDate: o.delivery_date ? toDateString(o.delivery_date) : null,
        deliveredDate,
        deliveryType,
      };
    });

    /* ---------- BROKEN_EVENTS ---------- */

    const brokenEvents = eventRows
      .filter((ev) => ev.event_type === "BROKEN")
      .map((ev) => {
        const order = orderMap.get(ev.order_id);
        return {
          date: toDateString(ev.created_at),
          orderId: order ? order.id : null,
          orderNo: order ? order.order_no : null,
          customer: order ? order.client : null,
          pieceId: ev.piece_id,
          station: stationMap.get(ev.station_id) || `#${ev.station_id}`,
          worker: userMap.get(ev.user_id) || "Unknown",
          reason: ev.notes || "",
        };
      });

    /* ---------- PROD_SCANS (PASS events غير الـ Delivery) ---------- */

    const prodScans = eventRows
      .filter(
        (ev) => ev.event_type === "PASS" && !deliverySet.has(ev.station_id)
      )
      .map((ev) => ({
        date: toDateString(ev.created_at),
        station: stationMap.get(ev.station_id) || `#${ev.station_id}`,
        worker: userMap.get(ev.user_id) || "Unknown",
        completed: 1, // كل PASS = قطعة مخلّصة
      }));

    /* ---------- LEAD_SAMPLES (demo logic، مبني على المحطات) ---------- */

    const leadSamples = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(start30);
      d.setDate(d.getDate() + i);
      const dateStr = toDateString(d);

      stationRows.forEach((s) => {
        if (deliverySet.has(s.id)) return;
        const avg = 20 + (s.stage_order || 1) * 3; // من 20~50 دقيقة تقريباً
        const max = avg + 20;
        leadSamples.push({
          date: dateStr,
          station: s.name,
          avgMin: avg,
          maxMin: max,
        });
      });
    }

    /* ---------- WIP_SNAPSHOTS من glass_pieces.current_station_id ---------- */

    const todayStr = toDateString(today);
    const wipByStation = new Map(); // stationId -> {waiting,inProgress}

    pieceRows.forEach((p) => {
      if (!p.current_station_id) return;
      if (!wipByStation.has(p.current_station_id)) {
        wipByStation.set(p.current_station_id, { waiting: 0, inProgress: 0 });
      }
      const bucket = wipByStation.get(p.current_station_id);
      if (p.status === "in_progress") bucket.inProgress += 1;
      else if (p.status === "waiting") bucket.waiting += 1;
      else {
        // أي status غير completed/broken نعتبره waiting
        if (p.status !== "completed" && p.status !== "broken") {
          bucket.waiting += 1;
        }
      }
    });

    const wipSnapshots = [];
    wipByStation.forEach((val, stationId) => {
      if (val.waiting === 0 && val.inProgress === 0) return;
      wipSnapshots.push({
        date: todayStr,
        stage: stationMap.get(stationId) || `#${stationId}`,
        waiting: val.waiting,
        inProgress: val.inProgress,
      });
    });

    /* ---------- response ---------- */

    res.json({
      ok: true,
      from,
      to,
      stations: stationRows.map((s) => s.name),
      customers: customerRows.map((c) => c.client),
      orders,
      brokenEvents,
      prodScans,
      leadSamples,
      wipSnapshots,
    });
  } catch (err) {
    console.error("Reports base error:", err);
    res.status(500).json({
      ok: false,
      error: "Failed to load reports",
      details: err.message,
    });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
