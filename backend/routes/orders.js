// routes/orders.js
const router = require("express").Router();
const multer = require("multer");
const XLSX = require("xlsx");
const { parse } = require("csv-parse/sync");
const pool = require("../db");
const { authRequired } = require("../middleware/auth");

// ===================== Upload =====================
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
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else
      cb(new Error("Invalid file type. Only CSV and Excel files are allowed."));
  },
});

// ===================== Helpers =====================
function norm(val) {
  if (val == null) return null;
  if (typeof val === "string") {
    const t = val.trim();
    return t === "" ? null : t;
  }
  return val;
}
function toStr(val, def = "") {
  const v = norm(val);
  return v != null ? String(v) : def;
}
function toQtyInt(val, def = 1) {
  const v = norm(val);
  if (v == null) return def;
  const num = Number(v);
  if (!Number.isFinite(num)) return def;
  const r = Math.round(num);
  return r <= 0 ? def : r;
}
function toPageInt(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}
function normalizeDateToYMD(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
function getUserId(req) {
  return req.user?.userId ?? req.user?.id ?? null;
}

// ===================== GLASS ANALYZER =====================
function analyzeGlassFromText(textRaw) {
  const text = toStr(textRaw, "").toLowerCase();

  const hasDouble =
    text.includes("a/s") ||
    text.includes("air") ||
    text.includes("double") ||
    text.includes("argon") ||
    text.includes("spacer");

  const hasLaminated =
    text.includes("lam") ||
    text.includes("laminated") ||
    text.includes("tcl") ||
    text.includes("6.6.4");

  if (hasDouble && text.includes("double double"))
    return { kind: "DOUBLE_DOUBLE", piecesPerUnit: 4 };
  if (hasLaminated && text.includes("laminated laminated"))
    return { kind: "LAM_LAM", piecesPerUnit: 4 };
  if (hasDouble && hasLaminated)
    return { kind: "DOUBLE_LAM", piecesPerUnit: 3 };
  if (hasDouble) return { kind: "DOUBLE", piecesPerUnit: 2 };
  if (hasLaminated) return { kind: "LAMINATED", piecesPerUnit: 2 };
  return { kind: "SINGLE", piecesPerUnit: 1 };
}

// ===================== Extractors =====================
function pickGlassType({ description, typeValue }) {
  const desc = toStr(description, "").trim();
  const type = toStr(typeValue, "").trim();

  if (desc) return desc; // ✅ الحقيقة
  if (type && type.toLowerCase() !== "man") return type; // ✅ بس اذا مو MAN
  return "";
}

function buildSize({ sizeValue, misc1, misc2, misc4, description }) {
  const size = toStr(sizeValue, "").trim();
  if (size) return size;

  const m1 = norm(misc1);
  const m2 = norm(misc2);
  const m4 = toStr(misc4, "").trim();

  let thickness = null;
  if (m4 && m4.includes("*")) {
    const parts = m4
      .split("*")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 3) thickness = parts[2];
  }

  if (m1 != null && m2 != null) {
    const lenStr = String(m1);
    const widStr = String(m2);
    return thickness
      ? `${lenStr} x ${widStr} m (${thickness} mm)`
      : `${lenStr} x ${widStr} m`;
  }

  const desc = toStr(description, "").toLowerCase();
  const m = desc.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
  if (m) {
    const a = m[1];
    const b = m[2];
    const mm = desc.match(/(\d+(?:\.\d+)?)\s*mm/i);
    const t = mm ? mm[1] : thickness;
    return t ? `${a} x ${b} m (${t} mm)` : `${a} x ${b} m`;
  }

  return "";
}

function buildNotes({ notesValue, misc4 }) {
  const notes = toStr(notesValue, "").trim();
  const m4 = toStr(misc4, "").trim();

  // ✅ ما في Type: MAN هون نهائياً
  if (notes && m4) return `${notes} | Misc4: ${m4}`;
  if (notes) return notes;
  if (m4) return `Misc4: ${m4}`;
  return null;
}

// ===================== parseFile =====================
function parseFile(buffer, filename) {
  const warnings = [];
  const lines = [];
  const ext = filename.toLowerCase().split(".").pop();

  try {
    if (ext === "csv" || ext === "txt") {
      const content = buffer.toString("utf-8");
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_quotes: true,
        relax_column_count: true,
      });

      records.forEach((row, idx) => {
        const lineCode =
          row["Line Code"] ||
          row["Line"] ||
          row["Code"] ||
          row["Item"] ||
          `L${idx + 1}`;

        const qtyRaw =
          row["Misc3"] ||
          row["misc3"] ||
          row["Qty"] ||
          row["Quantity"] ||
          row["QTY"] ||
          row["Pieces"] ||
          row["pcs"];

        const description =
          row["Description"] || row["Desc"] || row["DESCRIPTION"] || "";
        const typeValue = row["Type"] || row["TYPE"] || "";

        const sizeValue =
          row["Size"] || row["Dimensions"] || row["Dim"] || row["SIZE"] || "";
        const misc1 = row["Misc1"] || row["misc1"];
        const misc2 = row["Misc2"] || row["misc2"];
        const misc4 = row["Misc4"] || row["misc4"];

        const glassType = pickGlassType({ description, typeValue });
        const size = buildSize({ sizeValue, misc1, misc2, misc4, description });
        const notes = buildNotes({
          notesValue: row["Notes"] || row["Remarks"] || row["Comment"] || "",
          misc4,
        });

        const qty = toQtyInt(qtyRaw, 1);

        if (!glassType)
          warnings.push(`Line ${lineCode}: Glass Type/Description is missing`);
        if (!size) warnings.push(`Line ${lineCode}: Size is missing`);

        lines.push({
          line_code: toStr(lineCode),
          qty,
          size: toStr(size, ""),
          glass_type: toStr(glassType, ""),
          notes,
        });
      });
    } else if (ext === "xlsx" || ext === "xls") {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const records = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (records.length < 2) {
        warnings.push("Excel file has no data rows");
        return { lines, warnings };
      }

      const headers = records[0].map((h) => toStr(h).toLowerCase());
      const getCol = (row, possibleNames) => {
        for (const name of possibleNames) {
          const idx = headers.indexOf(String(name).toLowerCase());
          if (idx !== -1 && row[idx] !== undefined) return row[idx];
        }
        return null;
      };

      for (let i = 1; i < records.length; i++) {
        const row = records[i];
        if (!row || row.every((c) => c == null || String(c).trim() === ""))
          continue;

        const lineCode =
          getCol(row, ["line code", "line", "code", "item"]) || `L${i}`;

        const qtyRaw =
          getCol(row, ["misc3"]) ||
          getCol(row, ["qty", "quantity", "pieces", "pcs"]);

        const description = getCol(row, ["description", "desc"]) || "";
        const typeValue = getCol(row, ["type"]) || "";

        const sizeValue = getCol(row, ["size", "dimensions", "dim"]) || "";
        const misc1 = getCol(row, ["misc1"]);
        const misc2 = getCol(row, ["misc2"]);
        const misc4 = getCol(row, ["misc4"]);

        const glassType = pickGlassType({ description, typeValue });
        const size = buildSize({ sizeValue, misc1, misc2, misc4, description });

        const notes = buildNotes({
          notesValue: getCol(row, ["notes", "remarks", "comment"]) || "",
          misc4,
        });

        const qty = toQtyInt(qtyRaw, 1);

        if (!glassType)
          warnings.push(`Line ${lineCode}: Glass Type/Description is missing`);
        if (!size) warnings.push(`Line ${lineCode}: Size is missing`);

        lines.push({
          line_code: toStr(lineCode),
          qty,
          size: toStr(size, ""),
          glass_type: toStr(glassType, ""),
          notes,
        });
      }
    } else {
      warnings.push(`Unsupported file format: ${ext}`);
    }
  } catch (e) {
    warnings.push(`File parsing error: ${e.message}`);
  }

  return { lines, warnings };
}

// ---- capabilities (optional tables/columns) ----
const CAPS = {
  checked: false,
  hasGlassPieces: false,
  hasStations: false,
  hasOrdersCurrentStage: false,
  hasPiecesColsInOrderLines: false,
};

async function ensureCaps(conn) {
  if (CAPS.checked) return;

  try {
    const [[gp]] = await conn.query(
      `SELECT COUNT(*) AS c FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name='glass_pieces'`
    );
    CAPS.hasGlassPieces = Number(gp?.c || 0) > 0;

    const [[st]] = await conn.query(
      `SELECT COUNT(*) AS c FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name='stations'`
    );
    CAPS.hasStations = Number(st?.c || 0) > 0;

    const [[col]] = await conn.query(
      `SELECT COUNT(*) AS c FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name='orders' AND column_name='current_stage'`
    );
    CAPS.hasOrdersCurrentStage = Number(col?.c || 0) > 0;

    const [[olcol]] = await conn.query(
      `SELECT COUNT(*) AS c FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name='order_lines' AND column_name='pieces_count'`
    );
    CAPS.hasPiecesColsInOrderLines = Number(olcol?.c || 0) > 0;
  } catch (e) {
    console.warn("ensureCaps warning:", e.message);
  } finally {
    CAPS.checked = true;
  }
}

// ===================== GET /summary =====================
router.get("/summary", authRequired, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const userId = Number(getUserId(req) || 0);
    const mine = req.query.mine === "1";

    const [rows] = await conn.execute(
      `
      SELECT
        COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) AS imported_today,
        COUNT(CASE WHEN status = 'Draft' THEN 1 END) AS draft_waiting,
        MAX(created_at) AS last_import
      FROM orders
      ${mine && userId ? "WHERE created_by = ?" : ""}
      `,
      mine && userId ? [userId] : []
    );

    const s = rows[0] || {};
    res.json({
      ok: true,
      summary: {
        importedToday: Number(s.imported_today || 0),
        draftWaiting: Number(s.draft_waiting || 0),
        lastImport: s.last_import || null,
        warningsDetected: 0,
      },
    });
  } catch (e) {
    console.error("summary error:", e);
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

// ===================== GET /recent =====================
router.get("/recent", authRequired, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    await ensureCaps(conn);

    const userId = Number(getUserId(req) || 0);
    const mine = req.query.mine === "1";
    const limit = Math.min(Math.max(toPageInt(req.query.limit, 10), 1), 50);

    const params = [];
    let where = "";
    if (mine && userId) {
      where = "WHERE o.created_by = ?";
      params.push(userId);
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
        COUNT(ol.id) AS line_count,
        COALESCE(SUM(ol.qty),0) AS total_units,
        ${
          CAPS.hasPiecesColsInOrderLines
            ? "COALESCE(SUM(ol.pieces_count),0) AS total_pieces"
            : "COALESCE(SUM(ol.qty),0) AS total_pieces"
        }
      FROM orders o
      LEFT JOIN order_lines ol ON o.id = ol.order_id
      ${where}
      GROUP BY o.id, o.order_no, o.client, o.prf, o.delivery_date, o.status, o.created_at
      ORDER BY o.created_at DESC
      LIMIT ${Number(limit)}
    `;

    const [rows] = await conn.query(sql, params);
    res.json({
      ok: true,
      orders: rows.map((r) => ({
        ...r,
        line_count: Number(r.line_count || 0),
        total_units: Number(r.total_units || 0),
        total_pieces: Number(r.total_pieces || 0),
      })),
    });
  } catch (e) {
    console.error("recent error:", e);
    res.json({ ok: true, orders: [] });
  } finally {
    if (conn) conn.release();
  }
});

// ===================== POST /import/preview =====================
router.post(
  "/import/preview",
  authRequired,
  upload.single("file"),
  async (req, res) => {
    if (!req.file)
      return res.status(400).json({ ok: false, error: "File is required" });

    const { orderNo, client, prf, deliveryDate } = req.body;
    const parsed = parseFile(req.file.buffer, req.file.originalname);

    const warnings = [...parsed.warnings];
    if (!orderNo) warnings.push("Order number is missing");
    if (!client) warnings.push("Client name is missing");

    const totalPieces = parsed.lines.reduce((sum, l) => {
      const a = analyzeGlassFromText(l.glass_type);
      return sum + Number(l.qty || 0) * Number(a.piecesPerUnit || 1);
    }, 0);

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
        linesPreview: parsed.lines.slice(0, 15).map((l) => {
          const a = analyzeGlassFromText(l.glass_type);
          return {
            ...l,
            pieces_per_unit: a.piecesPerUnit,
            pieces_count: Number(l.qty || 0) * a.piecesPerUnit,
          };
        }),
      },
    });
  }
);

// ===================== POST /import =====================
router.post(
  "/import",
  authRequired,
  upload.single("file"),
  async (req, res, next) => {
    let conn;
    try {
      conn = await pool.getConnection();
      await ensureCaps(conn);

      if (!req.file)
        return res.status(400).json({ ok: false, error: "File is required" });

      const userId = Number(getUserId(req) || 0);
      if (!userId)
        return res
          .status(401)
          .json({ ok: false, error: "User not authenticated" });

      const { orderNo, client, prf, deliveryDate } = req.body;
      if (!orderNo || !client) {
        return res
          .status(400)
          .json({
            ok: false,
            error: "Order number and client name are required",
          });
      }

      const [existing] = await conn.execute(
        "SELECT id FROM orders WHERE order_no = ?",
        [orderNo]
      );
      if (existing.length)
        return res
          .status(409)
          .json({ ok: false, error: `Order #${orderNo} already exists` });

      const parsed = parseFile(req.file.buffer, req.file.originalname);
      if (!parsed.lines.length)
        return res
          .status(400)
          .json({ ok: false, error: "No valid data found in the file" });

      const totalPieces = parsed.lines.reduce((sum, l) => {
        const a = analyzeGlassFromText(l.glass_type);
        return sum + Number(l.qty || 0) * Number(a.piecesPerUnit || 1);
      }, 0);

      await conn.beginTransaction();

      const [orderResult] = await conn.execute(
        `
      INSERT INTO orders (order_no, client, prf, delivery_date, status, created_by, total_lines, total_pieces)
      VALUES (?, ?, ?, ?, 'Draft', ?, ?, ?)
      `,
        [
          orderNo,
          client,
          prf || null,
          normalizeDateToYMD(deliveryDate),
          userId,
          parsed.lines.length,
          totalPieces,
        ]
      );

      const orderId = orderResult.insertId;

      for (const line of parsed.lines) {
        const a = analyzeGlassFromText(line.glass_type);
        const piecesCount =
          Number(line.qty || 0) * Number(a.piecesPerUnit || 1);

        // إذا عندك أعمدة pieces_per_unit و pieces_count ب order_lines رح يعبّيهم
        if (CAPS.hasPiecesColsInOrderLines) {
          await conn.execute(
            `INSERT INTO order_lines (order_id, line_code, qty, size, glass_type, notes, pieces_per_unit, pieces_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              orderId,
              line.line_code,
              line.qty,
              line.size,
              line.glass_type,
              line.notes || null,
              a.piecesPerUnit,
              piecesCount,
            ]
          );
        } else {
          await conn.execute(
            `INSERT INTO order_lines (order_id, line_code, qty, size, glass_type, notes)
           VALUES (?, ?, ?, ?, ?, ?)`,
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
          totalPieces,
        },
        message: "Order created successfully",
      });
    } catch (e) {
      try {
        if (conn) await conn.rollback();
      } catch {}
      next(e);
    } finally {
      if (conn) conn.release();
    }
  }
);

// ===================== GET /api/orders (filters + pagination) =====================
router.get("/", authRequired, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    await ensureCaps(conn);

    const page = Math.max(1, toPageInt(req.query.page, 1));
    const limit = Math.min(
      100,
      Math.max(5, toPageInt(req.query.limit || req.query.pageSize, 10))
    );
    const offset = (page - 1) * limit;

    const q = (req.query.q || "").trim();
    const status = (req.query.status || "").trim();
    const client = (req.query.client || "").trim();
    const orderNo = (req.query.orderNo || "").trim();

    const stage = (req.query.stage || "").trim();
    const from = (req.query.from || "").trim();
    const to = (req.query.to || "").trim();
    const incCompleted = String(req.query.incCompleted || "").trim(); // "0" or "1"
    const mine = req.query.mine === "1";
    const userId = Number(getUserId(req) || 0);

    const where = [];
    const params = [];

    if (mine && userId) {
      where.push("o.created_by = ?");
      params.push(userId);
    }

    if (status && status !== "all") {
      where.push("o.status = ?");
      params.push(status);
    }

    if (client) {
      where.push("o.client LIKE ?");
      params.push(`%${client}%`);
    }

    if (orderNo) {
      where.push("o.order_no LIKE ?");
      params.push(`%${orderNo}%`);
    }

    if (q) {
      where.push("(o.order_no LIKE ? OR o.client LIKE ? OR o.prf LIKE ?)");
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    if (from) {
      where.push("o.delivery_date >= ?");
      params.push(from);
    }
    if (to) {
      where.push("o.delivery_date <= ?");
      params.push(to);
    }

    if (incCompleted === "0") {
      where.push("o.status <> 'Completed'");
    }

    if (CAPS.hasOrdersCurrentStage && stage && stage !== "all") {
      where.push("o.current_stage = ?");
      params.push(stage);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [countRows] = await conn.execute(
      `SELECT COUNT(*) AS total FROM orders o ${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const dataSql = `
      SELECT
        o.id,
        o.order_no,
        o.client,
        o.prf,
        o.status,
        o.delivery_date,
        o.created_at
        ${
          CAPS.hasOrdersCurrentStage
            ? ", o.current_stage"
            : ", NULL AS current_stage"
        },
        COUNT(ol.id) AS total_lines,
        ${
          CAPS.hasPiecesColsInOrderLines
            ? "COALESCE(SUM(ol.pieces_count),0) AS total_pieces"
            : "COALESCE(SUM(ol.qty),0) AS total_pieces"
        }
      FROM orders o
      LEFT JOIN order_lines ol ON ol.order_id = o.id
      ${whereSql}
      GROUP BY o.id, o.order_no, o.client, o.prf, o.status, o.delivery_date, o.created_at
      ${CAPS.hasOrdersCurrentStage ? ", o.current_stage" : ""}
      ORDER BY o.created_at DESC
      LIMIT ${Number(limit)} OFFSET ${Number(offset)}
    `;

    const [rows] = await conn.query(dataSql, params);

    res.json({
      ok: true,
      orders: rows.map((r) => ({
        ...r,
        total_lines: Number(r.total_lines || 0),
        total_pieces: Number(r.total_pieces || 0),
      })),
      pagination: { page, limit, total, totalPages },
    });
  } catch (e) {
    console.error("GET /api/orders error:", e);
    res
      .status(500)
      .json({ ok: false, error: "Server error", message: e.message });
  } finally {
    if (conn) conn.release();
  }
});

// ===================== GET /api/orders/:id (details + lines + pieces) =====================
router.get("/:id", authRequired, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    await ensureCaps(conn);

    const orderId = parseInt(req.params.id, 10);
    if (Number.isNaN(orderId))
      return res.status(400).json({ ok: false, error: "Invalid order ID" });

    const [orders] = await conn.execute("SELECT * FROM orders WHERE id = ?", [
      orderId,
    ]);
    if (!orders.length)
      return res.status(404).json({ ok: false, error: "Order not found" });

    const [lines] = await conn.execute(
      "SELECT * FROM order_lines WHERE order_id = ? ORDER BY id ASC",
      [orderId]
    );

    let pieces = [];
    if (CAPS.hasGlassPieces) {
      try {
        if (CAPS.hasStations) {
          const [p] = await conn.execute(
            `
            SELECT
              gp.id,
              gp.piece_number AS piece_code,
              gp.status,
              gp.created_at,
              st.name AS station_name,
              gp.broken_notes
            FROM glass_pieces gp
            LEFT JOIN stations st ON st.id = gp.current_station_id
            WHERE gp.order_id = ?
            ORDER BY gp.id ASC
            `,
            [orderId]
          );
          pieces = p;
        } else {
          const [p] = await conn.execute(
            `SELECT id, piece_number AS piece_code, status, created_at, broken_notes
             FROM glass_pieces WHERE order_id = ? ORDER BY id ASC`,
            [orderId]
          );
          pieces = p;
        }
      } catch (err) {
        console.warn("pieces query skipped:", err.message);
        pieces = [];
      }
    }

    res.json({ ok: true, order: orders[0], lines, pieces });
  } catch (e) {
    console.error("order details error:", e);
    res
      .status(500)
      .json({ ok: false, error: "Database error", message: e.message });
  } finally {
    if (conn) conn.release();
  }
});

// ===================== PUT /api/orders/:id/status (activate generates pieces) =====================
router.put("/:id/status", authRequired, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    await ensureCaps(conn);

    const orderId = Number(req.params.id);
    const { status } = req.body;

    const allowed = ["Draft", "Active", "Paused", "Completed", "Cancelled"];
    if (!allowed.includes(status))
      return res.status(400).json({ ok: false, error: "Invalid status" });

    if (status !== "Active") {
      await conn.execute(
        "UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?",
        [status, orderId]
      );
      return res.json({ ok: true, message: `Order status = ${status}` });
    }

    // Activate -> generate pieces
    await conn.beginTransaction();

    const [[order]] = await conn.execute(
      "SELECT id, status FROM orders WHERE id = ?",
      [orderId]
    );
    if (!order) {
      await conn.rollback();
      return res.status(404).json({ ok: false, error: "Order not found" });
    }
    if (order.status === "Active") {
      await conn.rollback();
      return res.json({ ok: true, message: "Order already active" });
    }

    const [lines] = await conn.execute(
      "SELECT * FROM order_lines WHERE order_id = ?",
      [orderId]
    );
    let pieceCounter = 1;

    for (const line of lines) {
      const { piecesPerUnit } = analyzeGlassFromText(line.glass_type);

      for (let i = 0; i < Number(line.qty || 0); i++) {
        for (let p = 0; p < piecesPerUnit; p++) {
          const code = `${orderId}-${line.id}-${pieceCounter++}`;

          await conn.execute(
            `
            INSERT INTO glass_pieces (order_id, line_id, piece_number, status, created_at)
            VALUES (?, ?, ?, 'pending', NOW())
            `,
            [orderId, line.id, code]
          );
        }
      }
    }

    await conn.execute(
      "UPDATE orders SET status='Active', updated_at=NOW() WHERE id=?",
      [orderId]
    );
    await conn.commit();

    res.json({ ok: true, message: "Order activated & pieces generated" });
  } catch (e) {
    if (conn) await conn.rollback();
    console.error("Activate error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  } finally {
    if (conn) conn.release();
  }
});

// ===================== DELETE /api/orders/:id =====================
router.delete("/:id", authRequired, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    await ensureCaps(conn);

    const orderId = parseInt(req.params.id, 10);
    if (Number.isNaN(orderId))
      return res.status(400).json({ ok: false, error: "Invalid order ID" });

    const [existing] = await conn.execute(
      "SELECT id, order_no FROM orders WHERE id = ?",
      [orderId]
    );
    if (!existing.length)
      return res.status(404).json({ ok: false, error: "Order not found" });

    await conn.beginTransaction();

    if (CAPS.hasGlassPieces) {
      try {
        await conn.execute(
          `DELETE pe FROM piece_events pe
           JOIN glass_pieces gp ON gp.id = pe.piece_id
           WHERE gp.order_id = ?`,
          [orderId]
        );
      } catch (err) {
        console.warn("Skipping piece_events delete:", err.message);
      }

      try {
        await conn.execute("DELETE FROM glass_pieces WHERE order_id = ?", [
          orderId,
        ]);
      } catch (err) {
        console.warn("Skipping glass_pieces delete:", err.message);
      }
    }

    await conn.execute("DELETE FROM order_lines WHERE order_id = ?", [orderId]);
    await conn.execute("DELETE FROM orders WHERE id = ?", [orderId]);

    await conn.commit();

    res.json({
      ok: true,
      message: `Order #${existing[0].order_no} deleted successfully`,
    });
  } catch (e) {
    try {
      if (conn) await conn.rollback();
    } catch {}
    console.error("delete order error:", e);
    res
      .status(500)
      .json({ ok: false, error: "Database error", message: e.message });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
