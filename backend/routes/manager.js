const router = require("express").Router();
const pool = require("../db");

// helpers
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

function requireManager(req, res) {
  const role = String(req.user?.role || "").toLowerCase();
  if (!req.user) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return false;
  }
  if (!["manager", "admin"].includes(role)) {
    res.status(403).json({ ok: false, error: "Forbidden" });
    return false;
  }
  return true;
}

// GET /api/manager/dashboard
router.get("/dashboard", async (req, res, next) => {
  if (!requireManager(req, res)) return;

  let conn;
  try {
    conn = await pool.getConnection();

    const todayIso = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // 1) Orders + aggregates from glass_pieces
    const [orderRows] = await conn.execute(
      `
      SELECT
        o.id,
        o.order_no,
        o.client,
        o.status,
        o.delivery_date,
        o.created_at,
        COALESCE(p.total_pieces, 0)    AS total_pieces,
        COALESCE(p.completed_pieces, 0) AS completed_pieces,
        COALESCE(p.broken_pieces, 0)    AS broken_pieces,
        COALESCE(p.wip_pieces, 0)       AS wip_pieces
      FROM orders o
      LEFT JOIN (
        SELECT
          order_id,
          COUNT(*) AS total_pieces,
          SUM(status = 'completed') AS completed_pieces,
          SUM(status = 'broken')    AS broken_pieces,
          SUM(status NOT IN ('completed','broken')) AS wip_pieces
        FROM glass_pieces
        GROUP BY order_id
      ) p ON p.order_id = o.id
      ORDER BY o.created_at DESC
      LIMIT 30
      `
    );

    // 2) Broken TODAY per order (from piece_events)
    const [brokenPerOrderRows] = await conn.execute(
      `
      SELECT
        gp.order_id,
        COUNT(*) AS broken_today
      FROM piece_events pe
      JOIN glass_pieces gp ON gp.id = pe.piece_id
      WHERE pe.event_type = 'BROKEN'
        AND DATE(pe.created_at) = CURDATE()
      GROUP BY gp.order_id
      `
    );
    const brokenMap = new Map();
    for (const r of brokenPerOrderRows) {
      brokenMap.set(r.order_id, Number(r.broken_today || 0));
    }

    // 3) Last activity per order
    const [lastEventRows] = await conn.execute(
      `
      SELECT
        gp.order_id,
        MAX(pe.created_at) AS last_update
      FROM glass_pieces gp
      JOIN piece_events pe ON pe.piece_id = gp.id
      GROUP BY gp.order_id
      `
    );
    const lastUpdateMap = new Map();
    for (const r of lastEventRows) {
      lastUpdateMap.set(r.order_id, r.last_update);
    }

    // 4) Current stage per order (station with most WIP pieces)
    const [stagePerOrderRows] = await conn.execute(
      `
      SELECT
        gp.order_id,
        s.name AS stage_name,
        COUNT(*) AS cnt
      FROM glass_pieces gp
      JOIN stations s ON s.id = gp.current_station_id
      WHERE gp.status NOT IN ('completed','broken')
      GROUP BY gp.order_id, s.id, s.name
      `
    );
    const stagePerOrderMap = new Map();
    for (const r of stagePerOrderRows) {
      const existing = stagePerOrderMap.get(r.order_id);
      if (!existing || r.cnt > existing.cnt) {
        stagePerOrderMap.set(r.order_id, { stage: r.stage_name, cnt: r.cnt });
      }
    }

    // 5) Stage load (WIP pieces in station) + Broken TODAY per station
    const [stageWipRows] = await conn.execute(
      `
      SELECT
        s.id,
        s.name,
        COUNT(gp.id) AS wip_count
      FROM stations s
      LEFT JOIN glass_pieces gp
        ON gp.current_station_id = s.id
       AND gp.status NOT IN ('completed','broken')
      WHERE s.is_active = 1
      GROUP BY s.id, s.name
      ORDER BY s.stage_order ASC, s.name ASC
      `
    );

    const [brokenTodayByStationRows] = await conn.execute(
      `
      SELECT
        pe.station_id,
        COUNT(*) AS broken_today
      FROM piece_events pe
      WHERE pe.event_type = 'BROKEN'
        AND DATE(pe.created_at) = CURDATE()
      GROUP BY pe.station_id
      `
    );
    const brokenStationMap = new Map();
    for (const r of brokenTodayByStationRows) {
      brokenStationMap.set(Number(r.station_id), Number(r.broken_today || 0));
    }

    // 6) Audit (mini log)
    const [auditRows] = await conn.execute(
      `
      SELECT
        pe.created_at,
        pe.event_type,
        pe.notes,
        u.username,
        gp.piece_number,
        s.name AS station_name
      FROM piece_events pe
      LEFT JOIN users u       ON u.id = pe.user_id
      LEFT JOIN glass_pieces gp ON gp.id = pe.piece_id
      LEFT JOIN stations s    ON s.id = pe.station_id
      ORDER BY pe.created_at DESC
      LIMIT 30
      `
    );

    // ===== Build response objects =====
    const orders = orderRows.map((o) => {
      const createdDateStr = toDateString(o.created_at);
      const dueDateStr = toDateString(o.delivery_date);
      const createdToday = createdDateStr === todayIso;

      const lastUpdate = lastUpdateMap.get(o.id) || o.created_at;
      const lastUpdateTime = toTimeString(lastUpdate);

      const stageInfo = stagePerOrderMap.get(o.id);
      const currentStage = stageInfo?.stage || "—";

      const totalPieces = Number(o.total_pieces || 0);
      const completedPieces = Number(o.completed_pieces || 0);

      const progressPct =
        totalPieces > 0 ? Math.round((completedPieces / totalPieces) * 100) : 0;

      const brokenToday = brokenMap.get(o.id) || 0;

      return {
        id: o.id,
        orderNo: o.order_no,
        client: o.client,
        qty: totalPieces,
        stage: currentStage,
        status: o.status,
        due: dueDateStr,
        lastUpdate: lastUpdateTime || "—",
        progressPct,
        createdToday,
        brokenToday,
      };
    });

    // stageLoad: we don't have "inProgress" true status in your DB, so keep it 0 for now
    const stageLoad = stageWipRows.map((s) => ({
      stage: s.name,
      waiting: Number(s.wip_count || 0),
      inProgress: 0,
      broken: brokenStationMap.get(Number(s.id)) || 0, // ✅ broken TODAY
    }));

    // KPIs
    const ordersToday = orders.filter((o) => o.createdToday).length;
    const activeOrders = orders.filter((o) => o.status === "Active").length;
    const draftOrders = orders.filter((o) => o.status === "Draft").length;

    const delayedOrders = orders.filter(
      (o) =>
        o.due &&
        o.due < todayIso &&
        !["Completed", "Cancelled", "Delivery Ready"].includes(o.status)
    ).length;

    const wipPieces = stageLoad.reduce(
      (sum, s) => sum + (s.waiting || 0) + (s.inProgress || 0),
      0
    );

    // completed pieces today
    const [completedTodayRows] = await conn.execute(
      `
      SELECT COUNT(*) AS completedToday
      FROM glass_pieces
      WHERE status='completed'
        AND DATE(updated_at) = CURDATE()
      `
    );
    const completedToday = Number(completedTodayRows[0]?.completedToday || 0);

    // broken pieces today (from stageLoad "broken today")
    const brokenToday = stageLoad.reduce((sum, s) => sum + (s.broken || 0), 0);

    const deliveryReady = orders.filter((o) =>
      ["Delivery Ready"].includes(o.status)
    ).length;

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
        (best, s) => ((s.broken || 0) > (best.broken || 0) ? s : best),
        stageLoad[0]
      );
      if ((maxBrokenStage.broken || 0) > 0) {
        alerts.push({
          type: "warning",
          title: `High breakage in ${maxBrokenStage.stage}`,
          meta: `Broken pieces today: ${maxBrokenStage.broken}`,
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
