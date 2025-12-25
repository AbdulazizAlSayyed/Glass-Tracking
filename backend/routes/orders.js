const router = require("express").Router();
const multer = require("multer");
const XLSX = require("xlsx");
const { parse } = require("csv-parse/sync");
const pool = require("../db");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ---------------- helpers ----------------
function norm(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w_]/g, "");
}
function toStr(v) {
  if (v == null) return "";
  return String(v).trim();
}
function toInt(v) {
  const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}
function normalizeDateToYMD(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m1) {
    const [, dd, mm, yyyy] = m1;
    return `${yyyy}-${mm}-${dd}`;
  }

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function buildHeaderMap(rowArr) {
  const map = {};
  for (let col = 0; col < rowArr.length; col++) {
    const h = norm(rowArr[col]);
    if (!h) continue;

    if (["line", "line_code", "code", "frame", "f", "item", "l"].includes(h))
      map.line_code = col;
    if (["qty", "quantity", "qte", "pieces", "pc"].includes(h)) map.qty = col;
    if (["size", "dimension", "dimensions", "dim", "dims"].includes(h))
      map.size = col;
    if (["type", "glass_type", "glasstype", "glass", "spec"].includes(h))
      map.glass_type = col;
    if (
      ["notes", "note", "remark", "remarks", "comment", "comments"].includes(h)
    )
      map.notes = col;
  }
  return map;
}

function detectHeaderRow(rows) {
  const maxScan = Math.min(rows.length, 30);
  let best = { score: 0, rowIndex: -1, map: null };

  for (let i = 0; i < maxScan; i++) {
    const map = buildHeaderMap(rows[i] || []);
    const score = Object.keys(map).length;
    if (score > best.score) best = { score, rowIndex: i, map };
  }

  if (best.score >= 2) {
    return { hasHeader: true, startRow: best.rowIndex + 1, map: best.map };
  }

  return {
    hasHeader: false,
    startRow: 0,
    map: { line_code: 0, qty: 1, size: 2, glass_type: 3, notes: 4 },
  };
}

function parseRowsToLines(rows) {
  const { startRow, map, hasHeader } = detectHeaderRow(rows);
  const lines = [];

  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r] || [];
    const joined = row.map(toStr).join("").trim();
    if (!joined) continue;

    const line_code = toStr(row[map.line_code]);
    const qty = toInt(row[map.qty]);
    const size = toStr(row[map.size]);
    const glass_type = toStr(row[map.glass_type]);
    const notes = toStr(row[map.notes]);

    if (!qty && !line_code && !size && !glass_type) continue;

    lines.push({
      line_code: line_code || null,
      qty: qty || 0,
      size: size || null,
      glass_type: glass_type || null,
      notes: notes || null,
    });
  }

  const warnings = [];
  if (!lines.length) warnings.push("No lines detected in the file.");
  const zeroQty = lines.filter((x) => !x.qty).length;
  if (zeroQty) warnings.push(`${zeroQty} line(s) have qty = 0.`);

  return { lines, warnings, hasHeader };
}

function parseSpreadsheet(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames?.[0];
  if (!sheetName)
    return { lines: [], warnings: ["Spreadsheet has no sheets."] };

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: false,
    defval: "",
  });
  return parseRowsToLines(rows || []);
}

function parseCsv(buffer) {
  const text = buffer.toString("utf8");
  const delimiter = text.includes(";") ? ";" : text.includes("\t") ? "\t" : ",";

  try {
    const records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      delimiter,
      relax_column_count: true,
      trim: true,
    });

    if (!records.length) return { lines: [], warnings: ["CSV empty."] };

    const headers = Object.keys(records[0] || {});
    const m = {};
    headers.forEach((h) => {
      const x = norm(h);
      if (["line", "line_code", "code", "item", "l"].includes(x)) m.line = h;
      if (["qty", "quantity", "qte", "pieces", "pc"].includes(x)) m.qty = h;
      if (["size", "dimension", "dims", "dim"].includes(x)) m.size = h;
      if (["type", "glass_type", "glass", "spec"].includes(x)) m.type = h;
      if (["notes", "note", "remark", "remarks"].includes(x)) m.notes = h;
    });

    const lines = [];
    const warnings = [];
    records.forEach((r, idx) => {
      const line_code = toStr(r[m.line]) || `L${idx + 1}`;
      const qty = Math.max(0, toInt(r[m.qty]));
      const size = toStr(r[m.size]) || null;
      const glass_type = toStr(r[m.type]) || null;
      const notes = toStr(r[m.notes]) || null;

      if (!qty) warnings.push(`Row ${idx + 2}: qty is missing/invalid.`);
      lines.push({ line_code, qty, size, glass_type, notes });
    });

    return { lines, warnings, hasHeader: true };
  } catch (e) {
    const rows = parse(text, {
      columns: false,
      skip_empty_lines: true,
      delimiter,
      relax_column_count: true,
      trim: true,
    });

    const lines = rows.map((r, i) => ({
      line_code: toStr(r[0]) || `L${i + 1}`,
      qty: Math.max(0, toInt(r[1])),
      size: toStr(r[2]) || null,
      glass_type: toStr(r[3]) || null,
      notes: toStr(r[4]) || null,
    }));

    return {
      lines,
      warnings: ["CSV has no headers, used fallback mapping."],
      hasHeader: false,
    };
  }
}

function parseFile(buffer, filename) {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  if (ext === "xls" || ext === "xlsx") return parseSpreadsheet(buffer);
  if (ext === "csv" || ext === "txt") return parseCsv(buffer);
  return {
    lines: [],
    warnings: ["Unsupported file type. Use .xls/.xlsx/.csv/.txt"],
  };
}

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
        SUM(o.status = 'Draft') AS draft_waiting,
        MAX(o.created_at) AS last_import
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

// ---------------- API: RECENT ----------------
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

    // ✅ IMPORTANT: use derived table (no GROUP BY مشاكل)
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

// ---------------- POST: IMPORT ----------------
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

    const [st] = await conn.execute(
      `SELECT id FROM stations WHERE stage_order = 1 ORDER BY id ASC LIMIT 1`
    );
    const firstStationId = st[0]?.id || null;

    await conn.beginTransaction();

    const [insOrder] = await conn.execute(
      `
      INSERT INTO orders (order_no, client, prf, delivery_date, status, created_by)
      VALUES (?, ?, ?, ?, 'Draft', ?)
      `,
      [orderNo, client, prf, deliveryDate || null, userId]
    );
    const orderId = insOrder.insertId;

    let totalPieces = 0;

    for (let i = 0; i < parsed.lines.length; i++) {
      const ln = parsed.lines[i];
      const lineCode = ln.line_code || `L${i + 1}`;
      const qty = ln.qty || 0;

      const [insLine] = await conn.execute(
        `
        INSERT INTO order_lines (order_id, line_code, qty, size, glass_type, notes)
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [orderId, lineCode, qty, ln.size, ln.glass_type, ln.notes]
      );
      const lineId = insLine.insertId;

      for (let k = 1; k <= qty; k++) {
        const pieceCode = `${orderNo}-${lineCode}-${k}`;
        await conn.execute(
          `
          INSERT INTO glass_pieces (piece_code, order_id, line_id, current_station_id, status)
          VALUES (?, ?, ?, ?, 'Waiting')
          `,
          [pieceCode, orderId, lineId, firstStationId]
        );
        totalPieces++;
      }
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
