// routes/delivery.js
const router = require("express").Router();
const pool = require("../db");
const { authRequired } = require("../middleware/auth");

// فقط مستخدم delivery (أو admin) يسمح له
function requireDeliveryRole(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ ok: false, error: "Not authenticated" });
  }
  if (req.user.role === "delivery" || req.user.role === "admin") {
    return next();
  }
  return res.status(403).json({ ok: false, error: "Delivery role required" });
}

// Helper لتوحيد status
function mapPieceStatus(dbStatus) {
  if (!dbStatus) return "in_progress";
  const s = String(dbStatus).toLowerCase();
  if (["ready", "completed", "ready_for_delivery"].includes(s)) return "ready";
  if (s === "delivered") return "delivered";
  if (s === "broken") return "broken";
  return "in_progress";
}

/**
 * GET /api/delivery/orders
 * ترجع لستة أوامر مع summary (total / ready / delivered / remaining)
 */
router.get("/orders", authRequired, requireDeliveryRole, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();

    const [rows] = await conn.execute(
      `
      SELECT 
        o.id,
        o.order_no,
        o.client,
        o.delivery_date,
        o.status AS order_status,
        COALESCE(COUNT(gp.id), 0) AS total_pieces,
        COALESCE(SUM(gp.status IN ('ready','READY','completed','COMPLETED','ready_for_delivery')), 0) AS ready_pieces,
        COALESCE(SUM(gp.status IN ('delivered','DELIVERED')), 0) AS delivered_pieces
      FROM orders o
      LEFT JOIN glass_pieces gp ON gp.order_id = o.id
      WHERE o.status <> 'Cancelled'
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT 300
      `
    );

    const data = rows.map((r) => {
      const total = r.total_pieces || 0;
      const ready = r.ready_pieces || 0;
      const delivered = r.delivered_pieces || 0;
      const remaining = total - delivered;

      return {
        id: r.id,
        orderNo: r.order_no,
        customer: r.client,
        deliveryDate: r.delivery_date,
        orderStatus: r.order_status,
        total,
        ready,
        delivered,
        remaining,
      };
    });

    res.json({ ok: true, data });
  } catch (err) {
    console.error("GET /api/delivery/orders error:", err);
    res
      .status(500)
      .json({ ok: false, error: "Failed to load delivery orders" });
  } finally {
    if (conn) conn.release();
  }
});

/**
 * GET /api/delivery/orders/:orderNo
 * تفاصيل أمر واحد + كل القطع التابعة له + history
 */
router.get(
  "/orders/:orderNo",
  authRequired,
  requireDeliveryRole,
  async (req, res) => {
    const { orderNo } = req.params;
    let conn;

    try {
      conn = await pool.getConnection();

      // order
      const [orderRows] = await conn.execute(
        `
        SELECT 
          o.id,
          o.order_no,
          o.client,
          o.delivery_date,
          o.status AS order_status
        FROM orders o
        WHERE o.order_no = ?
        LIMIT 1
        `,
        [orderNo]
      );

      if (!orderRows.length) {
        return res.status(404).json({ ok: false, error: "Order not found" });
      }

      const order = orderRows[0];

      // pieces
      const [pieceRows] = await conn.execute(
        `
        SELECT 
          gp.id,
          gp.piece_number,
          gp.status,
          gp.current_station_id,
          s.name AS current_station_name,
          ol.line_code,
          ol.size,
          ol.glass_type
        FROM glass_pieces gp
        JOIN order_lines ol ON ol.id = gp.line_id
        LEFT JOIN stations s ON s.id = gp.current_station_id
        WHERE gp.order_id = ?
        ORDER BY ol.line_code ASC, gp.id ASC
        `,
        [order.id]
      );

      const pieces = pieceRows.map((r) => ({
        id: r.id,
        glassNo: r.piece_number || `P-${r.id}`,
        line: r.line_code,
        size: r.size,
        type: r.glass_type,
        status: mapPieceStatus(r.status),
        currentStage: r.current_station_name || null,
      }));

      // history من delivery_notes + delivery_pieces
      const [historyRows] = await conn.execute(
        `
        SELECT 
          dn.id,
          dn.dn_no,
          dn.driver,
          dn.notes,
          dn.created_at,
          COUNT(dp.id) AS delivered
        FROM delivery_notes dn
        LEFT JOIN delivery_pieces dp ON dp.dn_id = dn.id
        WHERE dn.order_id = ?
        GROUP BY dn.id
        ORDER BY dn.created_at ASC
        `,
        [order.id]
      );

      const history = historyRows.map((h) => ({
        dn: h.dn_no,
        date: h.created_at,
        driver: h.driver,
        notes: h.notes,
        delivered: h.delivered,
      }));

      res.json({
        ok: true,
        data: {
          order: {
            id: order.id,
            orderNo: order.order_no,
            customer: order.client,
            deliveryDate: order.delivery_date,
            status: order.order_status,
          },
          pieces,
          history,
        },
      });
    } catch (err) {
      console.error("GET /api/delivery/orders/:orderNo error:", err);
      res
        .status(500)
        .json({ ok: false, error: "Failed to load order details" });
    } finally {
      if (conn) conn.release();
    }
  }
);

/**
 * POST /api/delivery/confirm
 * body:
 *  {
 *    orderNo,
 *    dnNo,           // optional, ممكن يجي من الواجهة
 *    driver,
 *    notes,
 *    mode: "grouped" | "pieces",
 *    groups: [{ line, size, type, qty }],
 *    pieces: ["piece_number", ...]
 *  }
 */
router.post("/confirm", authRequired, requireDeliveryRole, async (req, res) => {
  const {
    orderNo,
    dnNo,
    driver,
    notes,
    mode,
    groups = [],
    pieces = [],
  } = req.body || {};

  if (!orderNo) {
    return res.status(400).json({ ok: false, error: "orderNo is required" });
  }

  if (mode !== "grouped" && mode !== "pieces") {
    return res.status(400).json({ ok: false, error: "Invalid mode" });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // order
    const [orderRows] = await conn.execute(
      `SELECT id FROM orders WHERE order_no = ? LIMIT 1`,
      [orderNo]
    );
    if (!orderRows.length) {
      await conn.rollback();
      return res.status(404).json({ ok: false, error: "Order not found" });
    }
    const orderId = orderRows[0].id;

    // station الخاصة بالـ delivery (لو عندكم كود ثابت مثل 'DELIVERY')
    let deliveryStationId = null;
    const [stRows] = await conn.execute(
      `SELECT id FROM stations WHERE code = 'DELIVERY' LIMIT 1`
    );
    if (stRows.length) deliveryStationId = stRows[0].id;

    // احسب DN number لو مش مبعوث
    let finalDnNo = dnNo;
    if (!finalDnNo) {
      const [lastDnRows] = await conn.execute(
        `SELECT dn_no FROM delivery_notes WHERE order_id = ? ORDER BY id DESC LIMIT 1`,
        [orderId]
      );
      if (!lastDnRows.length) {
        finalDnNo = "DN-0001";
      } else {
        const last = lastDnRows[0].dn_no || "DN-0000";
        const num = parseInt(last.replace(/\D/g, "") || "0", 10) + 1;
        finalDnNo = `DN-${String(num).padStart(4, "0")}`;
      }
    }

    // انشئ delivery_note
    const [dnResult] = await conn.execute(
      `
        INSERT INTO delivery_notes (order_id, dn_no, driver, notes, created_by)
        VALUES (?, ?, ?, ?, ?)
        `,
      [orderId, finalDnNo, driver || null, notes || null, req.user.id]
    );
    const dnId = dnResult.insertId;

    // جهّز list القطع اللي راح تتسلّم
    let pieceIds = [];

    if (mode === "grouped") {
      // لكل group نجيب N قطع READY
      for (const g of groups) {
        const qty = Number(g.qty) || 0;
        if (!qty) continue;

        const [rows] = await conn.execute(
          `
            SELECT gp.id
            FROM glass_pieces gp
            JOIN order_lines ol ON ol.id = gp.line_id
            WHERE gp.order_id = ?
              AND gp.status IN ('ready','READY','completed','COMPLETED','ready_for_delivery')
              AND ol.line_code = ?
              AND ol.size = ?
              AND ol.glass_type = ?
            ORDER BY gp.id
            LIMIT ?
            `,
          [orderId, g.line, g.size, g.type, qty]
        );

        if (rows.length < qty) {
          await conn.rollback();
          return res.status(400).json({
            ok: false,
            error: `Not enough READY pieces for group ${g.line} / ${g.size} / ${g.type}`,
          });
        }

        pieceIds.push(...rows.map((r) => r.id));
      }
    } else {
      // mode === "pieces": piece_number list
      if (!pieces.length) {
        await conn.rollback();
        return res.status(400).json({ ok: false, error: "No pieces selected" });
      }

      const placeholders = pieces.map(() => "?").join(",");
      const params = [orderId, ...pieces];

      const [rows] = await conn.execute(
        `
          SELECT id, piece_number
          FROM glass_pieces
          WHERE order_id = ?
            AND piece_number IN (${placeholders})
            AND status IN ('ready','READY','completed','COMPLETED','ready_for_delivery')
          `,
        params
      );

      if (!rows.length) {
        await conn.rollback();
        return res.status(400).json({
          ok: false,
          error: "Selected pieces are not READY or not found",
        });
      }

      pieceIds = rows.map((r) => r.id);
    }

    if (!pieceIds.length) {
      await conn.rollback();
      return res.status(400).json({ ok: false, error: "No pieces to deliver" });
    }

    // نفّذ التسليم: سجّل delivery_pieces + عدّل glass_pieces + piece_events
    for (const pid of pieceIds) {
      await conn.execute(
        `INSERT INTO delivery_pieces (dn_id, piece_id) VALUES (?, ?)`,
        [dnId, pid]
      );

      await conn.execute(
        `
          UPDATE glass_pieces
          SET status = 'delivered',
              current_station_id = COALESCE(?, current_station_id),
              updated_at = NOW()
          WHERE id = ?
          `,
        [deliveryStationId, pid]
      );

      await conn.execute(
        `
          INSERT INTO piece_events (piece_id, event_type, station_id, user_id, notes)
          VALUES (?, 'DELIVERED', ?, ?, ?)
          `,
        [pid, deliveryStationId, req.user.id, `Delivered in ${finalDnNo}`]
      );
    }

    // احسب summary جديد + history
    const [[sumRow]] = await conn.execute(
      `
        SELECT 
          COUNT(*) AS total,
          SUM(status IN ('ready','READY','completed','COMPLETED','ready_for_delivery')) AS ready,
          SUM(status IN ('delivered','DELIVERED')) AS delivered
        FROM glass_pieces
        WHERE order_id = ?
        `,
      [orderId]
    );
    const total = sumRow.total || 0;
    const ready = sumRow.ready || 0;
    const delivered = sumRow.delivered || 0;
    const remaining = total - delivered;

    const [historyRows] = await conn.execute(
      `
        SELECT 
          dn.id,
          dn.dn_no,
          dn.driver,
          dn.notes,
          dn.created_at,
          COUNT(dp.id) AS delivered
        FROM delivery_notes dn
        LEFT JOIN delivery_pieces dp ON dp.dn_id = dn.id
        WHERE dn.order_id = ?
        GROUP BY dn.id
        ORDER BY dn.created_at ASC
        `,
      [orderId]
    );

    await conn.commit();

    res.json({
      ok: true,
      data: {
        deliveredNow: pieceIds.length,
        dnNo: finalDnNo,
        summary: { total, ready, delivered, remaining },
        history: historyRows.map((h) => ({
          dn: h.dn_no,
          date: h.created_at,
          driver: h.driver,
          notes: h.notes,
          delivered: h.delivered,
        })),
      },
    });
  } catch (err) {
    console.error("POST /api/delivery/confirm error:", err);
    if (conn) await conn.rollback();
    res
      .status(500)
      .json({ ok: false, error: "Failed to confirm delivery note" });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
