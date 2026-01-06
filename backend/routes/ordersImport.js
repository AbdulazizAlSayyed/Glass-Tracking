// routes/ordersImport.js
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
// نفس قواعدك
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
// ✅ أهم نقطة: تجاهل Type=MAN بالكامل، وخد النوع من Description دائماً (إذا موجود)
function pickGlassType({ description, typeValue }) {
  const desc = toStr(description, "").trim();
  const type = toStr(typeValue, "").trim();

  // إذا الوصف موجود، هو مصدر الحقيقة
  if (desc) return desc;

  // إذا ما في وصف، بس type موجود، استعمله بشرط مو MAN
  if (type && type.toLowerCase() !== "man") return type;

  return "";
}

function buildSize({ sizeValue, misc1, misc2, misc4, description }) {
  // 1) إذا Size موجود جاهز
  const size = toStr(sizeValue, "").trim();
  if (size) return size;

  // 2) حاول من misc1/misc2 + thickness من misc4
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

  // 3) حاول استخراج من description (مثل 1.381 x 1.441)
  const desc = toStr(description, "").toLowerCase();
  const m = desc.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
  if (m) {
    const a = m[1];
    const b = m[2];
    // حاول thickness من description (مثلاً "6 mm")
    const mm = desc.match(/(\d+(?:\.\d+)?)\s*mm/i);
    const t = mm ? mm[1] : thickness;
    return t ? `${a} x ${b} m (${t} mm)` : `${a} x ${b} m`;
  }

  return ""; // رح يطلع warning "Size is missing"
}

function buildNotes({ notesValue, misc4 }) {
  // ✅ ممنوع نحط Type: MAN هون
  const notes = toStr(notesValue, "").trim();
  const m4 = toStr(misc4, "").trim();

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
    // CSV/TXT
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
          notesValue:
            row["Notes"] ||
            row["Remarks"] ||
            row["Comment"] ||
            row["NOTES"] ||
            "",
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
    }

    // EXCEL (xls/xlsx)
    else if (ext === "xlsx" || ext === "xls") {
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

// ===================== GET /api/orders-import/summary =====================
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

// ===================== GET /api/orders-import/recent =====================
router.get("/recent", authRequired, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();

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
        COALESCE(SUM(ol.pieces_count),0) AS total_pieces
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

// ===================== POST /api/orders-import/import/preview =====================
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

    // ✅ totalPieces based on analyzer
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
            pieces_count: Number(l.qty || 0) * Number(a.piecesPerUnit || 1),
          };
        }),
      },
    });
  }
);

// ===================== POST /api/orders-import/import =====================
router.post(
  "/import",
  authRequired,
  upload.single("file"),
  async (req, res, next) => {
    let conn;
    try {
      conn = await pool.getConnection();

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

      // ✅ totals based on analyzer
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

module.exports = router;
