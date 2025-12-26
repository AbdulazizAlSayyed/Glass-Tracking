const router = require("express").Router();
const pool = require("../db");

// ---------- helpers ----------
function toDateString(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}
function toTimeString(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(11, 16);
}

// GET /api/manager/dashboard
router.get("/dashboard", async (req, res, next) => {
  let conn;
  try {
    conn = await pool.getConnection();

    // 1) Last 50 orders + total pieces
    const [orderRows] = await conn.execute(`
      SELECT
        o.id,
        o.order_no,
        o.client,
        o.status,
        o.delivery_date,
        o.created_at,
        o.updated_at,
        COALESCE(p.total_pieces, 0) AS total_pieces
      FROM orders o
      LEFT JOIN (
        SELECT order_id, COUNT(*) AS total_pieces
        FROM glass_pieces
        GROUP BY order_id
      ) p ON p.order_id = o.id
      ORDER BY o.created_at DESC
      LIMIT 50
    `);

    // 2) Completed pieces per order (for progress %)
    const [progressRows] = await conn.execute(`
      SELECT
        order_id,
        COUNT(*) AS total_pieces,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_pieces
      FROM glass_pieces
      GROUP BY order_id
    `);
    const progressMap = new Map();
    for (const r of progressRows) {
      progressMap.set(Number(r.order_id), {
        total: Number(r.total_pieces || 0),
        completed: Number(r.completed_pieces || 0),
      });
    }

    // 3) "Current stage" per order = station with the most WIP pieces
    const [stagePerOrderRows] = await conn.execute(`
      SELECT
        gp.order_id,
        s.name AS stage_name,
        COUNT(*) AS cnt
      FROM glass_pieces gp
      JOIN stations s ON s.id = gp.current_station_id
      WHERE gp.current_station_id IS NOT NULL
        AND gp.status NOT IN ('completed')  -- broken stays in station, so it can still show in stage stats if you want
      GROUP BY gp.order_id, s.id, s.name
    `);
    const stagePerOrderMap = new Map();
    for (const r of stagePerOrderRows) {
      const orderId = Number(r.order_id);
      const existing = stagePerOrderMap.get(orderId);
      if (!existing || Number(r.cnt) > existing.cnt) {
        stagePerOrderMap.set(orderId, {
          stage: r.stage_name,
          cnt: Number(r.cnt),
        });
      }
    }

    // 4) Broken today per order (from piece_events)
    const [brokenPerOrderRows] = await conn.execute(`
      SELECT
        gp.order_id,
        COUNT(*) AS broken_today
      FROM piece_events pe
      JOIN glass_pieces gp ON gp.id = pe.piece_id
      WHERE pe.event_type = 'BROKEN'
        AND DATE(pe.created_at) = CURDATE()
      GROUP BY gp.order_id
    `);
    const brokenMap = new Map();
    for (const r of brokenPerOrderRows) {
      brokenMap.set(Number(r.order_id), Number(r.broken_today || 0));
    }

    // 5) Last activity per order
    const [lastEventRows] = await conn.execute(`
      SELECT
        gp.order_id,
        MAX(pe.created_at) AS last_update
      FROM glass_pieces gp
      JOIN piece_events pe ON pe.piece_id = gp.id
      GROUP BY gp.order_id
    `);
    const lastUpdateMap = new Map();
    for (const r of lastEventRows) {
      lastUpdateMap.set(Number(r.order_id), r.last_update);
    }

    // 6) Stage load (waiting/inProgress are from glass_pieces.status)
    //    brokenToday from piece_events
    const [stageBaseRows] = await conn.execute(`
      SELECT
        s.id,
        s.name,
        s.stage_order,
        SUM(CASE
              WHEN gp.id IS NOT NULL
               AND gp.status NOT IN ('completed','broken','in_process')
              THEN 1 ELSE 0
            END) AS waiting,
        SUM(CASE
              WHEN gp.id IS NOT NULL
               AND gp.status = 'in_process'
              THEN 1 ELSE 0
            END) AS in_progress
      FROM stations s
      LEFT JOIN glass_pieces gp ON gp.current_station_id = s.id
      WHERE s.is_active = 1
      GROUP BY s.id, s.name, s.stage_order
      ORDER BY s.stage_order ASC
    `);

    const [brokenTodayRows] = await conn.execute(`
      SELECT
        station_id,
        COUNT(*) AS broken_today
      FROM piece_events
      WHERE event_type = 'BROKEN'
        AND DATE(created_at) = CURDATE()
      GROUP BY station_id
    `);
    const brokenTodayByStation = new Map();
    for (const r of brokenTodayRows) {
      brokenTodayByStation.set(
        Number(r.station_id),
        Number(r.broken_today || 0)
      );
    }

    const stageLoad = stageBaseRows.map((s) => ({
      stage: s.name,
      waiting: Number(s.waiting || 0),
      inProgress: Number(s.in_progress || 0),
      broken: Number(brokenTodayByStation.get(Number(s.id)) || 0), // broken TODAY
    }));

    // 7) Audit (last 30 events)
    const [auditRows] = await conn.execute(`
      SELECT
        pe.created_at,
        pe.event_type,
        pe.notes,
        u.username,
        gp.piece_number,
        s.name AS station_name
      FROM piece_events pe
      LEFT JOIN users u ON u.id = pe.user_id
      LEFT JOIN glass_pieces gp ON gp.id = pe.piece_id
      LEFT JOIN stations s ON s.id = pe.station_id
      ORDER BY pe.created_at DESC
      LIMIT 30
    `);

    // ---------- Build response for frontend ----------
    const todayIso = toDateString(new Date());

    const orders = orderRows.map((o) => {
      const orderId = Number(o.id);
      const due = toDateString(o.delivery_date);
      const created = toDateString(o.created_at);

      const lastUpdate =
        lastUpdateMap.get(orderId) || o.updated_at || o.created_at;
      const lastUpdateTime = toTimeString(lastUpdate);

      const prog = progressMap.get(orderId) || {
        total: Number(o.total_pieces || 0),
        completed: 0,
      };
      const totalPieces = Number(prog.total || 0);
      const completedPieces = Number(prog.completed || 0);
      const progressPct = totalPieces
        ? Math.round((completedPieces / totalPieces) * 100)
        : 0;

      let stage = stagePerOrderMap.get(orderId)?.stage || "—";
      if (o.status === "Completed") stage = "COMPLETED";
      if (o.status === "Cancelled") stage = "—";

      return {
        id: orderId,
        orderNo: o.order_no,
        client: o.client,
        qty: totalPieces,
        stage,
        status: o.status,
        due: due || "—",
        lastUpdate: lastUpdateTime || "—",
        progressPct,
        createdToday: created === todayIso,
        brokenToday: Number(brokenMap.get(orderId) || 0),
      };
    });

    // KPIs
    const ordersToday = orders.filter((o) => o.createdToday).length;
    const activeOrders = orders.filter((o) => o.status === "Active").length;
    const draftOrders = orders.filter((o) => o.status === "Draft").length;

    const delayedOrders = orders.filter((o) => {
      if (!o.due || o.due === "—") return false;
      return o.due < todayIso && !["Completed", "Cancelled"].includes(o.status);
    }).length;

    const wipPieces = stageLoad.reduce(
      (sum, s) => sum + s.waiting + s.inProgress,
      0
    );

    const brokenToday = stageLoad.reduce((sum, s) => sum + s.broken, 0);

    const completedToday = orderRows.filter(
      (o) => o.status === "Completed" && toDateString(o.updated_at) === todayIso
    ).length;

    const deliveryReady = orders.filter((o) => o.status === "Completed").length;

    const kpis = {
      ordersToday,
      activeOrders,
      wipPieces,
      completedToday,
      brokenToday,
      deliveryReady,
      draftOrders,
      delayedOrders,
    };

    // Alerts
    const alerts = [];
    if (delayedOrders > 0) {
      alerts.push({
        type: "danger",
        title: `${delayedOrders} late order(s)`,
        meta: "Delivery date passed and not completed",
      });
    }
    if (stageLoad.length) {
      const maxBrokenStage = stageLoad.reduce(
        (best, s) => (s.broken > best.broken ? s : best),
        stageLoad[0]
      );
      if (maxBrokenStage.broken > 0) {
        alerts.push({
          type: "warning",
          title: `High breakage in ${maxBrokenStage.stage}`,
          meta: `Broken today: ${maxBrokenStage.broken}`,
        });
      }
    }

    const audit = auditRows.map((r) => ({
      time: toTimeString(r.created_at) || "",
      user: r.username || "—",
      action: r.event_type || "EVENT",
      target:
        r.piece_number && r.station_name
          ? `${r.piece_number} at ${r.station_name}`
          : r.notes || "—",
    }));

    res.json({
      ok: true,
      now: new Date().toISOString(),
      kpis,
      orders,
      stageLoad,
      alerts,
      audit,
    });
  } catch (e) {
    next(e);
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
