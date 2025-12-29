// routes/manager.js
const router = require("express").Router();
const pool = require("../db");
const { authRequired } = require("../middleware/auth");

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
router.get("/dashboard", authRequired, async (req, res, next) => {
  let conn;
  try {
    conn = await pool.getConnection();

    // 1) آخر 50 order مع عدد القطع
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
      WHERE o.status <> 'Cancelled'
      ORDER BY o.created_at DESC
      LIMIT 50
    `);

    // 2) Progress + Ready + Delivered لكل order
    const [progressRows] = await conn.execute(`
      SELECT
        order_id,
        COUNT(*) AS total_pieces,
        SUM(status IN ('completed','COMPLETED')) AS completed_pieces,
        SUM(status IN ('ready','READY','completed','COMPLETED','ready_for_delivery')) AS ready_pieces,
        SUM(status IN ('delivered','DELIVERED')) AS delivered_pieces
      FROM glass_pieces
      GROUP BY order_id
    `);

    const progressMap = new Map();
    for (const r of progressRows) {
      const orderId = Number(r.order_id);
      progressMap.set(orderId, {
        total: Number(r.total_pieces || 0),
        completed: Number(r.completed_pieces || 0),
        ready: Number(r.ready_pieces || 0),
        delivered: Number(r.delivered_pieces || 0),
      });
    }

    // 3) Current stage per order = station مع أكثر WIP
    const [stagePerOrderRows] = await conn.execute(`
      SELECT
        gp.order_id,
        s.name AS stage_name,
        COUNT(*) AS cnt
      FROM glass_pieces gp
      JOIN stations s ON s.id = gp.current_station_id
      WHERE gp.current_station_id IS NOT NULL
        AND gp.status NOT IN ('completed','COMPLETED')
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

    // 4) Broken today per order
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

    // 6) Stage load (waiting / in progress + broken today)
    const [stageBaseRows] = await conn.execute(`
      SELECT
        s.id,
        s.name,
        s.stage_order,
        SUM(
          CASE
            WHEN gp.id IS NOT NULL
             AND gp.status NOT IN (
               'completed','COMPLETED',
               'broken','BROKEN',
               'in_process','IN_PROCESS'
             )
            THEN 1
            ELSE 0
          END
        ) AS waiting,
        SUM(
          CASE
            WHEN gp.id IS NOT NULL
             AND gp.status IN ('in_process','IN_PROCESS')
            THEN 1
            ELSE 0
          END
        ) AS in_progress
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
      broken: Number(brokenTodayByStation.get(Number(s.id)) || 0),
    }));

    // 7) Audit (آخر 30 event)
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
      LEFT JOIN stations s ON s.id = gp.current_station_id
      ORDER BY pe.created_at DESC
      LIMIT 30
    `);

    // 8) إحصائيات Delivery اليوم (قطع + أوامر)
    const [[delPiecesRow]] = await conn.execute(`
      SELECT
        COUNT(*) AS delivered_pieces_today
      FROM piece_events pe
      WHERE pe.event_type = 'DELIVERED'
        AND DATE(pe.created_at) = CURDATE()
    `);

    const [[delOrdersRow]] = await conn.execute(`
      SELECT
        COUNT(DISTINCT gp.order_id) AS delivered_orders_today
      FROM piece_events pe
      JOIN glass_pieces gp ON gp.id = pe.piece_id
      WHERE pe.event_type = 'DELIVERED'
        AND DATE(pe.created_at) = CURDATE()
    `);

    const deliveredPiecesToday = Number(
      delPiecesRow?.delivered_pieces_today || 0
    );
    const deliveredOrdersToday = Number(
      delOrdersRow?.delivered_orders_today || 0
    );

    // ---------- Build response ----------
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
        ready: 0,
        delivered: 0,
      };
      const totalPieces = Number(prog.total || 0);
      const donePieces =
        Number(prog.completed || 0) + Number(prog.delivered || 0);
      const progressPct = totalPieces
        ? Math.round((donePieces / totalPieces) * 100)
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

    // ========= KPIs =========
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

    // ✅ Delivery ready: orders فيها READY وما فيها Delivered
    let deliveryReady = 0;
    for (const o of orderRows) {
      const prog = progressMap.get(Number(o.id));
      if (!prog) continue;
      if (prog.ready > 0 && prog.delivered === 0) {
        deliveryReady++;
      }
    }

    const kpis = {
      ordersToday,
      activeOrders,
      wipPieces,
      completedToday,
      brokenToday,
      deliveryReady,
      draftOrders,
      delayedOrders,
      deliveredPiecesToday,
      deliveredOrdersToday,
    };

    // ========= Alerts =========
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
