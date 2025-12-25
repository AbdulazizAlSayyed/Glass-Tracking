const router = require("express").Router();
const pool = require("../db");

function clampInt(v, min, max, def) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}
function likeQ(q) {
  return `%${String(q || "").trim()}%`;
}

// KPIs
router.get("/kpis", async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT
        SUM(o.status = 'Draft')  AS draft_count,
        SUM(o.status = 'Active') AS active_count,
        SUM(o.status = 'Paused') AS paused_count
      FROM orders o
      `
    );
    const r = rows[0] || {};
    res.json({
      ok: true,
      kpis: {
        draft: Number(r.draft_count || 0),
        active: Number(r.active_count || 0),
        paused: Number(r.paused_count || 0),
        piecesToday: 0,
      },
    });
  } catch (e) {
    next(e);
  }
});

// Orders list
router.get("/orders", async (req, res, next) => {
  try {
    const status = String(req.query.status || "all").toLowerCase();
    const q = String(req.query.q || "").trim();
    const draftOnly = String(req.query.draftOnly || "0") === "1";
    const page = clampInt(req.query.page || "1", 1, 100000, 1);
    const limit = clampInt(req.query.limit || "20", 1, 100, 20);
    const offset = (page - 1) * limit;

    const where = [];
    const params = [];

    if (draftOnly) {
      where.push(`o.status = 'Draft'`);
    } else if (status !== "all") {
      const map = {
        draft: "Draft",
        active: "Active",
        paused: "Paused",
        completed: "Completed",
        cancelled: "Cancelled",
      };
      const mapped = map[status];
      if (mapped) {
        where.push(`o.status = ?`);
        params.push(mapped);
      }
    }

    if (q) {
      where.push(`(o.order_no LIKE ? OR o.client LIKE ? OR o.prf LIKE ?)`);
      params.push(likeQ(q), likeQ(q), likeQ(q));
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const sql = `
      SELECT
        o.id,
        o.order_no,
        o.client,
        o.prf,
        o.created_at,
        o.delivery_date,
        o.status,
        (SELECT COUNT(*) FROM order_lines ol WHERE ol.order_id = o.id) AS total_lines,
        (SELECT COUNT(DISTINCT gp.line_id)
           FROM glass_pieces gp
           WHERE gp.order_id = o.id) AS activated_lines
      FROM orders o
      ${whereSql}
      ORDER BY o.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [rows] = await pool.execute(sql, params);
    res.json({ ok: true, orders: rows, page, limit });
  } catch (e) {
    next(e);
  }
});

// Order lines
router.get("/orders/:orderId/lines", async (req, res, next) => {
  try {
    const orderId = clampInt(req.params.orderId, 1, 999999999, null);
    if (!orderId)
      return res.status(400).json({ ok: false, error: "Bad orderId" });

    const [rows] = await pool.execute(
      `
      SELECT
        ol.id,
        ol.line_code,
        ol.qty,
        ol.size,
        ol.glass_type,
        ol.notes,
        (SELECT COUNT(*) FROM glass_pieces gp WHERE gp.line_id = ol.id) AS activated_qty
      FROM order_lines ol
      WHERE ol.order_id = ?
      ORDER BY ol.id ASC
      `,
      [orderId]
    );

    res.json({ ok: true, lines: rows });
  } catch (e) {
    next(e);
  }
});

// Activate lines
router.post("/activate", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const orderId = clampInt(req.body?.orderId, 1, 999999999, null);
    const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];

    if (!orderId)
      return res.status(400).json({ ok: false, error: "orderId required" });
    if (!lines.length)
      return res.status(400).json({ ok: false, error: "lines required" });

    const [ordRows] = await conn.execute(
      `SELECT id, order_no, status FROM orders WHERE id = ? LIMIT 1`,
      [orderId]
    );
    if (!ordRows.length)
      return res.status(404).json({ ok: false, error: "Order not found" });

    const orderNo = ordRows[0].order_no;

    const [stRows] = await conn.execute(
      `SELECT id FROM stations WHERE stage_order = 1 ORDER BY id ASC LIMIT 1`
    );
    const firstStationId = stRows[0]?.id || null;

    await conn.beginTransaction();

    let createdPieces = 0;
    let touchedLines = 0;

    for (const x of lines) {
      const go = x.go === true || x.go === 1 || x.go === "1";
      if (!go) continue;

      const lineId = clampInt(x.lineId, 1, 999999999, null);
      const activateQty = clampInt(x.activateQty, 0, 999999999, 0);
      if (!lineId || activateQty <= 0) continue;

      const [lineRows] = await conn.execute(
        `SELECT id, line_code, qty FROM order_lines WHERE id = ? AND order_id = ? LIMIT 1`,
        [lineId, orderId]
      );
      if (!lineRows.length) continue;

      const lineCode = lineRows[0].line_code || `L${lineId}`;
      const totalQty = Number(lineRows[0].qty || 0);

      const [cntRows] = await conn.execute(
        `SELECT COUNT(*) AS c FROM glass_pieces WHERE line_id = ?`,
        [lineId]
      );
      const already = Number(cntRows[0]?.c || 0);

      const remaining = Math.max(0, totalQty - already);
      const toCreate = Math.min(activateQty, remaining);
      if (toCreate <= 0) continue;

      for (let i = 1; i <= toCreate; i++) {
        const seq = already + i;
        const pieceCode = `${orderNo}-${lineCode}-${seq}`;
        await conn.execute(
          `INSERT INTO glass_pieces (piece_code, order_id, line_id, current_station_id, status)
           VALUES (?, ?, ?, ?, 'Waiting')`,
          [pieceCode, orderId, lineId, firstStationId]
        );
        createdPieces++;
      }

      touchedLines++;
    }

    if (createdPieces > 0) {
      await conn.execute(`UPDATE orders SET status = 'Active' WHERE id = ?`, [
        orderId,
      ]);
    }

    await conn.commit();

    res.json({
      ok: true,
      orderId,
      createdPieces,
      touchedLines,
      statusUpdated: createdPieces > 0,
    });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally {
    conn.release();
  }
});

module.exports = router;
