const router = require("express").Router();
const multer = require("multer");
const XLSX = require("xlsx");
const { parse } = require("csv-parse/sync");
const pool = require("../db");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// helpers (نفس اللي عندك) ...

// (نفس كل الدوال المساعدة norm / toStr / toInt / normalizeDateToYMD / parseFile ... إلخ)
// ما رح أعيدها هون لتوفير مساحة، اعتبر نفس اللي عطيتني إياه، بس نكمل على الـ routes:

// ---------------- API: SUMMARY ----------------
router.get("/summary", async (req, res, next) => {
  try {
    const mine = String(req.query.mine || "0") === "1";
    const userId = req.user?.userId;

    if (mine && !userId) {
      return res
        .status(400)
        .json({ ok: false, error: "mine=1 requires userId" });
    }

    const [rows] = await pool.execute(
      `
      SELECT
        SUM(DATE(o.created_at) = CURDATE()) AS imported_today,
        SUM(o.status = 'Draft')             AS draft_waiting,
        MAX(o.created_at)                   AS last_import
      FROM orders o
      WHERE (? = 0 OR o.created_by = ?)
      `,
      [mine ? 1 : 0, userId]
    );

    const r = rows[0] || {};
    res.json({
      ok: true,
      summary: {
        importedToday: Number(r.imported_today || 0),
        draftWaiting: Number(r.draft_waiting || 0),
        lastImport: r.last_import || null,
        warningsDetected: 0,
      },
    });
  } catch (e) {
    next(e);
  }
});

// ---------------- API: RECENT ORDERS ----------------
router.get("/recent", async (req, res, next) => {
  try {
    const limit = Math.max(
      1,
      Math.min(parseInt(req.query.limit || "10", 10) || 10, 50)
    );

    const mine = String(req.query.mine || "0") === "1";
    const userId = req.user?.userId;

    if (mine && !userId) {
      return res
        .status(400)
        .json({ ok: false, error: "mine=1 requires userId" });
    }

    const sql = `
      SELECT
        o.id,
        o.order_no,
        o.client,
        o.prf,
        o.delivery_date,
        o.status,
        o.created_at,
        COALESCE(ol.lines, 0) AS lines
      FROM orders o
      LEFT JOIN (
        SELECT order_id, COUNT(*) AS lines
        FROM order_lines
        GROUP BY order_id
      ) ol ON ol.order_id = o.id
      WHERE (? = 0 OR o.created_by = ?)
      ORDER BY o.created_at DESC
      LIMIT ${limit}
    `;

    const [rows] = await pool.execute(sql, [mine ? 1 : 0, userId]);
    return res.json({ ok: true, orders: rows });
  } catch (e) {
    next(e);
  }
});

// ---------------- POST: PREVIEW ----------------
router.post(
  "/import/preview",
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ ok: false, error: "File is required (field name: file)" });
      }

      const orderNo = (req.body.orderNo || "").trim();
      const client = (req.body.client || "").trim();
      const prf = (req.body.prf || "").trim();
      const deliveryDate = normalizeDateToYMD(req.body.deliveryDate);

      const parsed = parseFile(req.file.buffer, req.file.originalname);

      const totalPieces = parsed.lines.reduce(
        (sum, x) => sum + (x.qty || 0),
        0
      );

      const warnings = [...(parsed.warnings || [])];
      if (!orderNo)
        warnings.push("Order number is missing (you can type it in the form).");
      if (!client)
        warnings.push("Client name is missing (you can type it in the form).");

      res.json({
        ok: true,
        preview: {
          orderNo: orderNo || "—",
          client: client || "—",
          prf: prf || null,
          deliveryDate: deliveryDate || null,
          totalLines: parsed.lines.length,
          totalPieces,
          warnings,
          linesPreview: parsed.lines.slice(0, 15),
        },
      });
    } catch (e) {
      next(e);
    }
  }
);

// ---------------- POST: IMPORT (Create Draft) ----------------
router.post("/import", upload.single("file"), async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ ok: false, error: "File is required (field name: file)" });
    }

    const userId = req.user?.userId;
    if (!userId) {
      return res
        .status(401)
        .json({ ok: false, error: "Unauthorized (missing userId)" });
    }

    const orderNo = (req.body.orderNo || "").trim();
    const client = (req.body.client || "").trim();
    const prf = (req.body.prf || "").trim() || null;
    const deliveryDate = normalizeDateToYMD(req.body.deliveryDate);

    if (!orderNo || !client) {
      return res
        .status(400)
        .json({ ok: false, error: "orderNo and client are required" });
    }

    const parsed = parseFile(req.file.buffer, req.file.originalname);
    if (!parsed.lines.length) {
      return res
        .status(400)
        .json({ ok: false, error: "No lines detected in file." });
    }

    const [exist] = await conn.execute(
      `SELECT id FROM orders WHERE order_no = ? LIMIT 1`,
      [orderNo]
    );
    if (exist.length) {
      return res
        .status(409)
        .json({ ok: false, error: "Order already exists." });
    }

    const totalPieces = parsed.lines.reduce(
      (sum, ln) => sum + (ln.qty || 0),
      0
    );

    await conn.beginTransaction();

    const [insOrder] = await conn.execute(
      `
      INSERT INTO orders (order_no, client, prf, delivery_date, status, created_by)
      VALUES (?, ?, ?, ?, 'Draft', ?)
      `,
      [orderNo, client, prf, deliveryDate || null, userId]
    );
    const orderId = insOrder.insertId;

    for (let i = 0; i < parsed.lines.length; i++) {
      const ln = parsed.lines[i];
      const lineCode = ln.line_code || `L${i + 1}`;
      const qty = ln.qty || 0;

      await conn.execute(
        `
        INSERT INTO order_lines (order_id, line_code, qty, size, glass_type, notes)
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [orderId, lineCode, qty, ln.size, ln.glass_type, ln.notes]
      );
    }

    await conn.commit();

    res.json({
      ok: true,
      order: {
        id: orderId,
        orderNo,
        client,
        prf,
        deliveryDate: deliveryDate || null,
        status: "Draft",
        totalLines: parsed.lines.length,
        totalPieces,
      },
    });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally {
    conn.release();
  }
});

module.exports = router;
