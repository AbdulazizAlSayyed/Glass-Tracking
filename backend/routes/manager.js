const router = require("express").Router();
const pool = require("../db");

// helper بسيط لتنسيق التاريخ
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
  const conn = await pool.getConnection();
  try {
    const todayIso = new Date().toISOString().slice(0, 10); // yyyy-mm-dd

    // 1) Orders + basic aggregates
    const [orderRows] = await conn.execute(
      `
      SELECT
        o.id,
        o.order_no,
        o.client,
        o.status,
        o.delivery_date,
        o.created_at,
        COALESCE(gp.total_pieces, 0) AS total_pieces
      FROM orders o
      LEFT JOIN (
        SELECT
          order_id,
          COUNT(*) AS total_pieces
        FROM glass_pieces
        GROUP BY order_id
      ) gp ON gp.order_id = o.id
      ORDER BY o.created_at DESC
      LIMIT 30
      `
    );

    // 2) Stage load (per station)
    const [stageRows] = await conn.execute(
      `
      SELECT
        s.id,
        s.name,
        SUM(gp.piece_status = 'not_started') AS waiting,
        SUM(gp.piece_status = 'in_process')   AS in_progress,
        SUM(gp.piece_status = 'broken')       AS broken
      FROM stations s
      LEFT JOIN glass_pieces gp
        ON gp.current_station_id = s.id
      GROUP BY s.id, s.name
      ORDER BY s.stage_order ASC, s.name ASC
      `
    );

    // 3) Broken today per order (للـ brokenToday على مستوى order)
    const [brokenPerOrderRows] = await conn.execute(
      `
      SELECT
        gp.order_id,
        SUM(pe.event_type = 'broken') AS broken_today
      FROM piece_events pe
      JOIN glass_pieces gp ON gp.piece_id = pe.piece_id
      WHERE DATE(pe.event_time) = CURDATE()
        AND pe.event_type = 'broken'
      GROUP BY gp.order_id
      `
    );
    const brokenMap = new Map();
    for (const r of brokenPerOrderRows) {
      brokenMap.set(r.order_id, Number(r.broken_today || 0));
    }

    // 4) Last activity per order (lastUpdate)
    const [lastEventRows] = await conn.execute(
      `
      SELECT
        t.order_id,
        MAX(t.event_time) AS last_update
      FROM (
        SELECT gp.order_id, pe.event_time
        FROM glass_pieces gp
        JOIN piece_events pe ON pe.piece_id = gp.piece_id
      ) t
      GROUP BY t.order_id
      `
    );
    const lastUpdateMap = new Map();
    for (const r of lastEventRows) {
      lastUpdateMap.set(r.order_id, r.last_update);
    }

    // 5) Current stage per order (أكتر محطة فيها قطع لهيدا الـ order)
    const [stagePerOrderRows] = await conn.execute(
      `
      SELECT
        gp.order_id,
        s.name AS stage_name,
        COUNT(*) AS cnt
      FROM glass_pieces gp
      JOIN stations s ON s.id = gp.current_station_id
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

    // 6) Audit (mini log) من piece_events
    const [auditRows] = await conn.execute(
      `
      SELECT
        pe.event_time,
        pe.event_type,
        pe.notes,
        u.username,
        gp.piece_code,
        s.name AS station_name
      FROM piece_events pe
      LEFT JOIN users u      ON u.id = pe.user_id
      LEFT JOIN glass_pieces gp ON gp.piece_id = pe.piece_id
      LEFT JOIN stations s   ON s.id = pe.station_id
      ORDER BY pe.event_time DESC
      LIMIT 30
      `
    );

    // ========== Build JS objects for frontend ==========

    // Orders array (للـ "Recent orders" + KPIs)
    const orders = orderRows.map((o) => {
      const createdDateStr = toDateString(o.created_at);
      const dueDateStr = toDateString(o.delivery_date);
      const createdToday = createdDateStr === todayIso;

      const lastUpdate = lastUpdateMap.get(o.id) || o.created_at;
      const lastUpdateTime = toTimeString(lastUpdate);

      const stageInfo = stagePerOrderMap.get(o.id);
      const currentStage = stageInfo?.stage || "—";

      // بسيط: إذا ما في قطع، progress = 0
      const totalPieces = Number(o.total_pieces || 0);
      const progressPct = totalPieces > 0 ? 0 : 0; // فيك لاحقاً تحسب completed/total

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
        // موجودين إذا حبيت تستعملهم لاحقاً
        createdAt: o.created_at,
        deliveryDate: o.delivery_date,
      };
    });

    // Stage load
    const stageLoad = stageRows.map((s) => ({
      stage: s.name,
      waiting: Number(s.waiting || 0),
      inProgress: Number(s.in_progress || 0),
      broken: Number(s.broken || 0),
    }));

    // KPIs (من الـ orders + stageLoad)
    const ordersToday = orders.filter((o) => o.createdToday).length;
    const activeOrders = orders.filter((o) => o.status === "Active").length;
    const completedOrders = orders.filter((o) =>
      ["Completed", "Delivery Ready"].includes(o.status)
    ).length;
    const draftOrders = orders.filter((o) => o.status === "Draft").length;
    const delayedOrders = orders.filter(
      (o) =>
        o.due &&
        o.due < todayIso &&
        !["Completed", "Cancelled"].includes(o.status)
    ).length;

    const wipPieces = stageLoad.reduce(
      (sum, s) => sum + s.waiting + s.inProgress,
      0
    );
    const brokenTodayPieces = stageLoad.reduce((sum, s) => sum + s.broken, 0);
    const deliveryReadyOrders = orders.filter((o) =>
      ["Completed", "Delivery Ready"].includes(o.status)
    ).length;

    const kpis = {
      ordersToday,
      activeOrders,
      wipPieces,
      completedToday: completedOrders, // تقريباً: orders completed
      brokenToday: brokenTodayPieces,
      deliveryReady: deliveryReadyOrders,
      draftOrders,
      delayedOrders,
    };

    // Alerts (بسيطة، مبنية من الداتا)
    const alerts = [];

    if (delayedOrders > 0) {
      alerts.push({
        type: "danger",
        title: `${delayedOrders} late order(s)`,
        meta: "Delivery date passed and not completed",
      });
    }

    // مرحلة فيها كسر عالي
    if (stageLoad.length) {
      const maxBrokenStage = stageLoad.reduce(
        (best, s) => (s.broken > best.broken ? s : best),
        stageLoad[0]
      );
      if (maxBrokenStage.broken > 0) {
        alerts.push({
          type: "warning",
          title: `High breakage in ${maxBrokenStage.stage}`,
          meta: `Broken pieces today: ${maxBrokenStage.broken}`,
        });
      }
    }

    // Audit للواجهة
    const audit = auditRows.map((r) => ({
      time: toTimeString(r.event_time) || "",
      user: r.username || "—",
      action: r.event_type || "event",
      target:
        r.piece_code && r.station_name
          ? `${r.piece_code} at ${r.station_name}`
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
    conn.release();
  }
});

module.exports = router;
