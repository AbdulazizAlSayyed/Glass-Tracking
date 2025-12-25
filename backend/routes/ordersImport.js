const express = require("express");
const multer = require("multer");
const ExcelJS = require("exceljs");
const { parse } = require("csv-parse/sync");
const db = require("../db");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

function nowString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function normalizeHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function mapHeadersToKeys(headers) {
  const idx = {};
  headers.forEach((h, i) => {
    const x = normalizeHeader(h);

    if (["line", "line_code", "code", "item", "l"].includes(x)) idx.line = i;
    if (["qty", "quantity", "qte"].includes(x)) idx.qty = i;
    if (["size", "dimension", "dims"].includes(x)) idx.size = i;
    if (["type", "glass_type", "glass", "spec"].includes(x)) idx.type = i;
    if (["notes", "note", "remark", "remarks"].includes(x)) idx.notes = i;
  });
  return idx;
}

async function parseXlsx(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const ws = workbook.worksheets[0];
  if (!ws)
    return { lines: [], warnings: ["No worksheet found in Excel file."] };

  const headerRow = ws.getRow(1);
  const headers = (headerRow.values || []).slice(1);
  const map = mapHeadersToKeys(headers);

  const hasAnyHeader =
    headers.some(Boolean) && (map.qty !== undefined || map.size !== undefined);

  const lines = [];
  const warnings = [];

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const vals = (row.values || []).slice(1);
    if (!vals.some((v) => String(v || "").trim() !== "")) return;

    const get = (key, fallbackIndex) => {
      const i = hasAnyHeader ? map[key] : fallbackIndex;
      return i === undefined ? "" : vals[i];
    };

    const line_code =
      String(get("line", 0) || "").trim() || `L${rowNumber - 1}`;
    const qtyRaw = get("qty", 1);
    const qty = Math.max(0, parseInt(qtyRaw || 0, 10) || 0);
    const size = String(get("size", 2) || "").trim();
    const glass_type = String(get("type", 3) || "").trim();
    const notes = String(get("notes", 4) || "").trim();

    if (!qty) warnings.push(`Row ${rowNumber}: qty is missing/invalid.`);
    lines.push({
      line: line_code,
      qty,
      size,
      type: glass_type,
      notes: notes || "—",
    });
  });

  return { lines, warnings };
}

function parseCsv(buffer) {
  const text = buffer.toString("utf8");
  const delimiter = text.includes(";") ? ";" : text.includes("\t") ? "\t" : ",";

  // try header-based
  let records = [];
  try {
    records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      delimiter,
      relax_column_count: true,
      trim: true,
    });
  } catch (e) {
    // fallback: no header
    const rows = parse(text, {
      columns: false,
      skip_empty_lines: true,
      delimiter,
      relax_column_count: true,
      trim: true,
    });
    // build like L, QTY, SIZE, TYPE, NOTES
    const lines = rows.slice(0).map((r, i) => ({
      line: String(r[0] || `L${i + 1}`),
      qty: Math.max(0, parseInt(r[1] || 0, 10) || 0),
      size: String(r[2] || ""),
      type: String(r[3] || ""),
      notes: String(r[4] || "—"),
    }));
    return { lines, warnings: ["CSV has no headers, used fallback mapping."] };
  }

  const headers = records[0] ? Object.keys(records[0]) : [];
  const map = mapHeadersToKeys(headers);

  const lines = [];
  const warnings = [];

  records.forEach((r, idx) => {
    const rowNumber = idx + 2;

    const line_code =
      String(r[headers[map.line]] || "").trim() || `L${idx + 1}`;
    const qty = Math.max(0, parseInt(r[headers[map.qty]] || 0, 10) || 0);
    const size = String(r[headers[map.size]] || "").trim();
    const glass_type = String(r[headers[map.type]] || "").trim();
    const notes = String(r[headers[map.notes]] || "").trim();

    if (!qty) warnings.push(`Row ${rowNumber}: qty is missing/invalid.`);
    lines.push({
      line: line_code,
      qty,
      size,
      type: glass_type,
      notes: notes || "—",
    });
  });

  return { lines, warnings };
}

// ✅ PREVIEW (Upload file -> Preview JSON)
router.post(
  "/import/preview",
  upload.single("file"),
  async (req, res, next) => {
    try {
      const file = req.file;
      const { orderNo, client, prf, deliveryDate } = req.body;

      const warnings = [];
      if (!file) warnings.push("No file uploaded.");
      if (!deliveryDate) warnings.push("Delivery date is missing (optional).");
      if (!prf) warnings.push("PRF is empty (optional).");

      let parsed = { lines: [], warnings: [] };

      if (file) {
        const ext = (file.originalname.split(".").pop() || "").toLowerCase();
        if (ext === "xlsx") parsed = await parseXlsx(file.buffer);
        else if (ext === "csv" || ext === "txt") parsed = parseCsv(file.buffer);
        else warnings.push("Unsupported file type. Use .xlsx or .csv/.txt");
      }
      const totalLines = lines.length;
      const totalPieces = lines.reduce((a, x) => a + Number(x.qty || 0), 0);

      res.json({
        ok: true,
        preview: {
          orderNo: (orderNo || "").trim() || "—",
          client: (client || "").trim() || "—",
          prf: (prf || "").trim() || "—",
          deliveryDate: deliveryDate || "—",
          lines, // full lines
          totalLines, // ✅
          linesPreview, // ✅
          totalPieces,
          warnings: [...warnings, ...(parsed.warnings || [])],
          generatedAt: nowString(),
        },
      });
    } catch (e) {
      next(e);
    }
  }
);

// ✅ CREATE DRAFT (save to DB)
router.post("/import/draft", async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    const { orderNo, client, prf, deliveryDate, lines } = req.body;

    if (!orderNo || !client) {
      return res
        .status(400)
        .json({ ok: false, error: "orderNo and client are required." });
    }
    if (!Array.isArray(lines) || !lines.length) {
      return res
        .status(400)
        .json({ ok: false, error: "lines array is required." });
    }

    await conn.beginTransaction();

    const [orderResult] = await conn.execute(
      `INSERT INTO orders (order_no, client, prf, delivery_date, status)
       VALUES (?, ?, ?, ?, 'Draft')`,
      [orderNo, client, prf || null, deliveryDate || null]
    );

    const orderId = orderResult.insertId;

    const values = lines.map((x) => [
      orderId,
      x.line || null,
      Number(x.qty || 0),
      x.size || null,
      x.type || null,
      x.notes || null,
    ]);

    await conn.query(
      `INSERT INTO order_lines (order_id, line_code, qty, size, glass_type, notes)
       VALUES ?`,
      [values]
    );

    await conn.commit();

    res.json({ ok: true, orderId, status: "Draft" });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally {
    conn.release();
  }
});

module.exports = router;
