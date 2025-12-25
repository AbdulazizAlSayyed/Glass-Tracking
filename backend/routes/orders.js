const router = require("express").Router();
const multer = require("multer");
const XLSX = require("xlsx");
const { parse } = require("csv-parse/sync");
const pool = require("../db");
const { authRequired } = require("../middleware/auth");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only CSV and Excel files are allowed."));
    }
  },
});

// ===================== Helper Functions =====================

function norm(val) {
  if (val == null || val === undefined) return null;
  if (typeof val === "string") {
    const trimmed = val.trim();
    return trimmed === "" ? null : trimmed;
  }
  return val;
}

function toStr(val, def = "") {
  const v = norm(val);
  return v != null ? String(v) : def;
}

function toInt(val, def = 0) {
  const v = norm(val);
  if (v == null) return def;
  const num = Number(v);
  return isNaN(num) ? def : Math.max(0, Math.round(num));
}

function normalizeDateToYMD(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split("T")[0];
  } catch {
    return null;
  }
}

function parseFile(buffer, filename) {
  const warnings = [];
  const lines = [];

  try {
    const fileExtension = filename.toLowerCase().split(".").pop();

    if (fileExtension === "csv" || fileExtension === "txt") {
      // Parse CSV
      const content = buffer.toString("utf-8");
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_quotes: true,
        relax_column_count: true,
      });

      records.forEach((row, idx) => {
        const lineCode = toStr(
          row["Line Code"] || row["Line"] || row["Code"] || `L${idx + 1}`
        );
        const qty = toInt(
          row["Qty"] || row["Quantity"] || row["QTY"] || row["Pieces"]
        );
        const size = toStr(row["Size"] || row["Dimensions"] || row["Dim"]);
        const glassType = toStr(
          row["Type"] || row["Glass Type"] || row["Glass"]
        );
        const notes = toStr(row["Notes"] || row["Remarks"] || row["Comment"]);

        if (qty <= 0) {
          warnings.push(
            `Line ${lineCode}: Quantity is zero or invalid (${qty})`
          );
        }

        if (!size) {
          warnings.push(`Line ${lineCode}: Size is missing`);
        }

        lines.push({
          line_code: lineCode,
          qty,
          size,
          glass_type: glassType,
          notes,
        });
      });
    } else if (["xlsx", "xls"].includes(fileExtension)) {
      // Parse Excel
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const records = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

      if (records.length < 2) {
        warnings.push("Excel file has no data rows");
        return { lines, warnings };
      }

      const headers = records[0].map((h) => toStr(h).toLowerCase());

      for (let i = 1; i < records.length; i++) {
        const row = records[i];
        if (!row || row.every((cell) => !cell)) continue;

        const getCol = (possibleNames) => {
          for (const name of possibleNames) {
            const idx = headers.indexOf(name.toLowerCase());
            if (idx !== -1 && row[idx] !== undefined) return row[idx];
          }
          return null;
        };

        const lineCode = toStr(
          getCol(["line code", "line", "code", "item"]) || `L${i}`
        );
        const qty = toInt(getCol(["qty", "quantity", "pieces", "qty."]));
        const size = toStr(getCol(["size", "dimensions", "dim", "规格"]));
        const glassType = toStr(
          getCol(["type", "glass type", "glass", "种类"])
        );
        const notes = toStr(getCol(["notes", "remarks", "comment", "备注"]));

        if (qty <= 0) {
          warnings.push(
            `Line ${lineCode}: Quantity is zero or invalid (${qty})`
          );
        }

        if (!size) {
          warnings.push(`Line ${lineCode}: Size is missing`);
        }

        lines.push({
          line_code: lineCode,
          qty,
          size,
          glass_type: glassType,
          notes,
        });
      }
    } else {
      warnings.push(`Unsupported file format: ${fileExtension}`);
    }
  } catch (error) {
    warnings.push(`File parsing error: ${error.message}`);
    console.error("File parsing error:", error);
  }

  return { lines, warnings };
}

// ===================== API Routes =====================

// في routes/orders.js - تحديث دالة summary

// GET /api/orders/summary
// في routes/orders.js - أصلح دالة summary

// GET /api/orders/summary
router.get("/summary", async (req, res, next) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const userId = req.user?.userId;
    const mine = req.query.mine === "1";

    console.log("📊 Fetching summary for userId:", userId);

    // استعلام مبسط
    let query;
    let params = [];

    if (mine && userId) {
      query = `
        SELECT
          COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) AS imported_today,
          COUNT(CASE WHEN status = 'Draft' THEN 1 END) AS draft_waiting,
          MAX(created_at) AS last_import
        FROM orders
        WHERE created_by = ?
      `;
      params.push(userId);
    } else {
      // إذا لم يكن mine=1 أو لا يوجد userId، أرجع إحصائيات للجميع
      query = `
        SELECT
          COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) AS imported_today,
          COUNT(CASE WHEN status = 'Draft' THEN 1 END) AS draft_waiting,
          MAX(created_at) AS last_import
        FROM orders
      `;
    }

    console.log("Query:", query, "Params:", params);
    const [rows] = await conn.execute(query, params);
    const summary = rows[0] || {};

    console.log("Summary result:", summary);

    res.json({
      ok: true,
      summary: {
        importedToday: Number(summary.imported_today || 0),
        draftWaiting: Number(summary.draft_waiting || 0),
        lastImport: summary.last_import || null,
        warningsDetected: 0,
      },
    });
  } catch (error) {
    console.error("❌ Summary error:", error);
    // في حالة الخطأ، إرجاع بيانات افتراضية
    res.json({
      ok: true,
      summary: {
        importedToday: 0,
        draftWaiting: 0,
        lastImport: null,
        warningsDetected: 0,
      },
    });
  } finally {
    if (conn) conn.release();
  }
});

// تحديث دالة recent بنفس الطريقة
router.get("/recent", async (req, res, next) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const userId = req.user?.userId;
    const mine = req.query.mine === "1";
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    console.log("Fetching recent orders, user:", userId);

    let orders = [];

    try {
      let query = `
        SELECT
          o.id,
          o.order_no,
          o.client,
          o.prf,
          o.delivery_date,
          o.status,
          o.created_at,
          COUNT(ol.id) AS line_count
        FROM orders o
        LEFT JOIN order_lines ol ON o.id = ol.order_id
      `;

      const params = [];

      if (mine && userId) {
        query += " WHERE o.created_by = ?";
        params.push(userId);
      }

      query += `
        GROUP BY o.id, o.order_no, o.client, o.prf, o.delivery_date, o.status, o.created_at
        ORDER BY o.created_at DESC
        LIMIT ?
      `;

      params.push(limit);

      console.log("Recent orders query:", query);
      const [rows] = await conn.execute(query, params);
      orders = rows;
    } catch (queryError) {
      console.log("Query failed, returning empty array:", queryError.message);
      orders = [];
    }

    res.json({
      ok: true,
      orders: orders.map((order) => ({
        ...order,
        lines: Number(order.lines || 0),
      })),
    });
  } catch (error) {
    console.error("Recent orders error:", error);
    // في حالة الخطأ، إرجاع مصفوفة فارغة
    res.json({
      ok: true,
      orders: [],
    });
  } finally {
    if (conn) conn.release();
  }
});
// POST /api/orders/import/preview
router.post(
  "/import/preview",
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: "File is required",
        });
      }

      const { orderNo, client, prf, deliveryDate } = req.body;
      const parsed = parseFile(req.file.buffer, req.file.originalname);

      // تحذيرات إضافية
      const warnings = [...parsed.warnings];
      if (!orderNo) warnings.push("Order number is missing");
      if (!client) warnings.push("Client name is missing");

      const totalPieces = parsed.lines.reduce((sum, line) => sum + line.qty, 0);

      res.json({
        ok: true,
        preview: {
          orderNo: orderNo || "—",
          client: client || "—",
          prf: prf || null,
          deliveryDate: normalizeDateToYMD(deliveryDate),
          totalLines: parsed.lines.length,
          totalPieces,
          warnings,
          linesPreview: parsed.lines.slice(0, 15),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/orders/import
router.post("/import", upload.single("file"), async (req, res, next) => {
  let conn;
  try {
    conn = await pool.getConnection();

    if (!req.file) {
      return res.status(400).json({
        ok: false,
        error: "File is required",
      });
    }

    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        ok: false,
        error: "User not authenticated",
      });
    }

    const { orderNo, client, prf, deliveryDate } = req.body;

    if (!orderNo || !client) {
      return res.status(400).json({
        ok: false,
        error: "Order number and client name are required",
      });
    }

    // التحقق من عدم تكرار رقم الطلب
    const [existing] = await conn.execute(
      "SELECT id FROM orders WHERE order_no = ?",
      [orderNo]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        ok: false,
        error: `Order #${orderNo} already exists`,
      });
    }

    // تحليل الملف
    const parsed = parseFile(req.file.buffer, req.file.originalname);

    if (parsed.lines.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "No valid data found in the file",
      });
    }

    await conn.beginTransaction();

    try {
      // إنشاء الطلب
      const [orderResult] = await conn.execute(
        `INSERT INTO orders (
          order_no, 
          client, 
          prf, 
          delivery_date, 
          status, 
          created_by,
          total_lines,
          total_pieces
        ) VALUES (?, ?, ?, ?, 'Draft', ?, ?, ?)`,
        [
          orderNo,
          client,
          prf || null,
          normalizeDateToYMD(deliveryDate),
          userId,
          parsed.lines.length,
          parsed.lines.reduce((sum, line) => sum + line.qty, 0),
        ]
      );

      const orderId = orderResult.insertId;

      // إضافة بنود الطلب
      for (const line of parsed.lines) {
        await conn.execute(
          `INSERT INTO order_lines (
            order_id, 
            line_code, 
            qty, 
            size, 
            glass_type, 
            notes
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            line.line_code,
            line.qty,
            line.size,
            line.glass_type,
            line.notes || null,
          ]
        );
      }

      await conn.commit();

      res.json({
        ok: true,
        order: {
          id: orderId,
          orderNo,
          client,
          prf: prf || null,
          deliveryDate: normalizeDateToYMD(deliveryDate),
          status: "Draft",
          totalLines: parsed.lines.length,
          totalPieces: parsed.lines.reduce((sum, line) => sum + line.qty, 0),
        },
        message: "Order created successfully",
      });
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  } catch (error) {
    next(error);
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/orders/:id
router.get("/:id", async (req, res, next) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const orderId = parseInt(req.params.id);

    if (isNaN(orderId)) {
      return res.status(400).json({
        ok: false,
        error: "Invalid order ID",
      });
    }

    const [orders] = await conn.execute(`SELECT * FROM orders WHERE id = ?`, [
      orderId,
    ]);

    if (orders.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "Order not found",
      });
    }

    const [lines] = await conn.execute(
      `SELECT * FROM order_lines WHERE order_id = ?`,
      [orderId]
    );

    res.json({
      ok: true,
      order: {
        ...orders[0],
        lines,
      },
    });
  } catch (error) {
    next(error);
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/orders (قائمة جميع الطلبات)

// PUT /api/orders/:id/status
router.put("/:id/status", async (req, res, next) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const orderId = parseInt(req.params.id);
    const { status } = req.body;

    if (isNaN(orderId)) {
      return res.status(400).json({
        ok: false,
        error: "Invalid order ID",
      });
    }

    const allowedStatuses = [
      "Draft",
      "Active",
      "Paused",
      "Completed",
      "Cancelled",
    ];
    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        ok: false,
        error: `Invalid status. Allowed: ${allowedStatuses.join(", ")}`,
      });
    }

    const [result] = await conn.execute(
      `UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?`,
      [status, orderId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        ok: false,
        error: "Order not found",
      });
    }

    res.json({
      ok: true,
      message: `Order status updated to ${status}`,
    });
  } catch (error) {
    next(error);
  } finally {
    if (conn) conn.release();
  }
});
// DELETE /api/orders/:id - Delete an order
router.delete("/:id", async (req, res, next) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const orderId = parseInt(req.params.id);

    if (isNaN(orderId)) {
      return res.status(400).json({
        ok: false,
        error: "Invalid order ID",
      });
    }

    // Check if order exists
    const [existing] = await conn.execute(
      "SELECT id, order_no FROM orders WHERE id = ?",
      [orderId]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "Order not found",
      });
    }

    // Delete order (cascade will delete order_lines)
    await conn.execute("DELETE FROM orders WHERE id = ?", [orderId]);

    res.json({
      ok: true,
      message: `Order #${existing[0].order_no} deleted successfully`,
    });
  } catch (error) {
    next(error);
  } finally {
    if (conn) conn.release();
  }
});

// DELETE /api/orders/:id/lines - Delete order lines
router.delete("/:id/lines", async (req, res, next) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const orderId = parseInt(req.params.id);

    if (isNaN(orderId)) {
      return res.status(400).json({
        ok: false,
        error: "Invalid order ID",
      });
    }

    await conn.execute("DELETE FROM order_lines WHERE order_id = ?", [orderId]);

    res.json({
      ok: true,
      message: "Order lines deleted successfully",
    });
  } catch (error) {
    next(error);
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/orders with advanced filtering
// GET /api/orders (قائمة جميع الطلبات)
// GET /api/orders (قائمة جميع الطلبات)
// TEMPORARY SIMPLIFIED VERSION FOR TESTING

// GET /api/orders (قائمة جميع الطلبات)
router.get("/", authRequired, async (req, res, next) => {
  let conn;
  try {
    conn = await pool.getConnection();

    // Debug: Check if user is authenticated
    console.log("User making request:", req.user);

    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: "Authentication required",
      });
    }
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Simple query without filters first
    const query = `
      SELECT 
        o.*,
        (SELECT COUNT(*) FROM order_lines ol WHERE ol.order_id = o.id) AS line_count,
        (SELECT COALESCE(SUM(qty), 0) FROM order_lines ol WHERE ol.order_id = o.id) AS total_pieces
      FROM orders o
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
    `;

    console.log("Simple query:", query, "Params:", [limit, offset]);

    const [rows] = await conn.execute(query, [limit, offset]);

    // Get total count
    const [countResult] = await conn.execute(
      "SELECT COUNT(*) as total FROM orders"
    );
    const total = countResult[0]?.total || 0;

    res.json({
      ok: true,
      orders: rows,
      pagination: {
        page: page,
        limit: limit,
        total: total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("❌ Simple orders list error:", error);
    res.status(500).json({
      ok: false,
      error: error.message,
      details: error.sqlMessage,
    });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
