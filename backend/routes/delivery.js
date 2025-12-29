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
  if (s === "ready" || s === "completed" || s === "ready_for_delivery") {
    return "ready";
  }
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
 * تفاصيل أمر واحد + كل القطع التابعة له
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

      // أولاً: نجيب الـ order
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

      // ثانياً: نجيب القطع (glass_pieces + order_lines + stations)
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

      // TODO لاحقاً: نضيف history من جداول delivery_notes
      const history = [];

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

module.exports = router;
