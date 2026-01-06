// backend/routes/intake.js
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

/**
 * panes_per_unit:
 * - A/S / Air Space / Double glazing => 2 panes
 * - Laminated / TCL / 6.6.4 => 2 panes
 * - else => 1 pane
 */
const PANES_PER_UNIT_EXPR = `
  CASE
    WHEN LOWER(COALESCE(ol.glass_type,'')) LIKE '%a/s%'
      OR LOWER(COALESCE(ol.glass_type,'')) LIKE '%air space%'
      OR LOWER(COALESCE(ol.glass_type,'')) LIKE '%double glazing%'
      OR LOWER(COALESCE(ol.glass_type,'')) LIKE '%double glaz%'
    THEN 2
    WHEN LOWER(COALESCE(ol.glass_type,'')) LIKE '%laminated%'
      OR LOWER(COALESCE(ol.glass_type,'')) LIKE '%tcl%'
      OR LOWER(COALESCE(ol.glass_type,'')) LIKE '%6.6.4%'
    THEN 2
    ELSE 1
  END
`;

// --------------------
// Spec parsing helpers
// --------------------
function norm(s) {
  return String(s || "").trim();
}

function isDoubleOrLam(glassType) {
  const t = norm(glassType).toLowerCase();
  const hasDouble =
    t.includes("a/s") || t.includes("air space") || t.includes("double glaz");
  const hasLam =
    t.includes("laminated") || t.includes("tcl") || t.includes("6.6.4");
  return hasDouble || hasLam;
}

// Split glass_type for A/S into left/right
function splitGlassTypeToAB(glassType) {
  const raw = norm(glassType);
  if (!raw) return { a: "", b: "", mode: "unknown" };

  const lower = raw.toLowerCase();
  const idx = lower.indexOf("a/s");
  if (idx !== -1) {
    const left = raw.slice(0, idx).trim();
    let right = raw.slice(idx + 3).trim(); // after "a/s"
    right = right.replace(/^(\*|\-|:)+/g, "").trim();
    return { a: left || raw, b: right || raw, mode: "as" };
  }

  // laminated/tcl/6.6.4 etc. No clean split => duplicate
  return { a: raw, b: raw, mode: "dup" };
}

// Turn raw text into compact "pane_type" like: "5.5 CLEAR", "6 MM F GRAY", "5.5 LOW E"
function extractPaneType(rawText, fallbackThicknessMM = null) {
  const raw = norm(rawText);
  if (!raw) return fallbackThicknessMM ? `${fallbackThicknessMM} MM` : "—";

  const up = raw.toUpperCase();

  // thickness
  let thickness = null;
  const mTh =
    up.match(/(\d+(?:\.\d+)?)\s*MM/) || up.match(/(^|\s)(\d+(?:\.\d+)?)(\s|$)/);
  if (mTh) thickness = mTh[1] || mTh[2];

  if (!thickness && fallbackThicknessMM)
    thickness = String(fallbackThicknessMM);

  // keywords
  const hasLowE = up.includes("LOW") && up.includes("E");
  const hasGrey = up.includes("GRAY") || up.includes("GREY");
  const hasClear = up.includes("CLEAR");
  const hasBronze = up.includes("BRONZE");
  const hasGreen = up.includes("GREEN");
  const hasBlue = up.includes("BLUE");
  const hasF = /\bF\b/.test(up); // F (like "6 MM F GRAY")

  // Remove noisy leading words for B like POLYSULFIDE / SPACER / ARGON / etc
  let cleaned = up
    .replace(/POLYSULFIDE/gi, "")
    .replace(/SPACER/gi, "")
    .replace(/ARGON/gi, "")
    .replace(/AIR\s*SPACE/gi, "")
    .replace(/DOUBLE\s*GLAZ(ING)?/gi, "")
    .replace(/\*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Build short label
  const parts = [];
  if (thickness) parts.push(thickness);

  if (hasLowE) parts.push("LOW E");
  else if (hasGrey) parts.push(hasF ? "MM F GRAY" : "GREY");
  else if (hasBronze) parts.push("BRONZE");
  else if (hasGreen) parts.push("GREEN");
  else if (hasBlue) parts.push("BLUE");
  else if (hasClear) parts.push("CLEAR");
  else {
    // fallback: try keep meaningful tail after thickness
    // example: "6 MM F GRAY" => keep "MM F GRAY"
    if (thickness) {
      const idx = cleaned.indexOf(thickness);
      let tail =
        idx >= 0 ? cleaned.slice(idx + thickness.length).trim() : cleaned;
      tail = tail.replace(/^MM\s+/i, "MM ").trim();
      if (tail) parts.push(tail);
    } else {
      parts.push(cleaned.slice(0, 20));
    }
  }

  // If we already added thickness only, make it "X MM"
  if (parts.length === 1 && thickness) return `${thickness} MM`;

  // Fix: when we created "6" + "MM F GRAY" => "6 MM F GRAY"
  if (parts.length >= 2 && parts[1].startsWith("MM ")) {
    return `${parts[0]} ${parts[1]}`.trim();
  }

  return parts.join(" ").trim();
}

// --------------------
// KPIs
// --------------------
router.get("/kpis", async (req, res, next) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
        SUM(o.status = 'Draft')  AS draft_count,
        SUM(o.status = 'Active') AS active_count,
        SUM(o.status = 'Paused') AS paused_count
      FROM orders o
    `);

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

// --------------------
// Orders list for intake
// activated_lines = FULLY completed lines only (by panes)
// excluding broken/completed pieces
// --------------------
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

        (SELECT COUNT(*) FROM order_lines ol2 WHERE ol2.order_id = o.id) AS total_lines,

        (
          SELECT COUNT(*)
          FROM (
            SELECT
              ol.id,
              ol.qty,
              ${PANES_PER_UNIT_EXPR} AS panes_per_unit,
              COUNT(gp.id) AS panes_count
            FROM order_lines ol
            LEFT JOIN glass_pieces gp
              ON gp.line_id = ol.id
             AND gp.status NOT IN ('broken','completed')
            WHERE ol.order_id = o.id
            GROUP BY ol.id, ol.qty, panes_per_unit
            HAVING panes_count >= (ol.qty * panes_per_unit)
          ) t
        ) AS activated_lines

      FROM orders o
      ${whereSql}
      ORDER BY o.created_at DESC
      LIMIT ${Number(limit)} OFFSET ${Number(offset)}
    `;

    const [rows] = await pool.execute(sql, params);
    res.json({ ok: true, orders: rows, page, limit });
  } catch (e) {
    next(e);
  }
});

// --------------------
// ✅ Order lines for intake (NOW RETURNS PANE RECORDS)
// each line returns:
// - if single pane: one record (pane_label null)
// - if double/lam: two records (A and B)
// activated / remaining computed per pane_label
// --------------------
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
        ${PANES_PER_UNIT_EXPR} AS panes_per_unit
      FROM order_lines ol
      WHERE ol.order_id = ?
      ORDER BY ol.id ASC
      `,
      [orderId]
    );

    // Build pane-records
    const out = [];

    for (const ol of rows) {
      const qtyUnits = Number(ol.qty || 0);
      const panesPerUnit = Number(ol.panes_per_unit || 1);
      const gt = norm(ol.glass_type);

      const isMulti = panesPerUnit === 2 && isDoubleOrLam(gt);

      if (!isMulti) {
        // single pane record
        const [[cnt]] = await pool.execute(
          `
          SELECT COUNT(*) AS c
          FROM glass_pieces
          WHERE line_id = ?
            AND status NOT IN ('broken','completed')
          `,
          [ol.id]
        );

        const activated = Number(cnt?.c || 0);
        const remaining = Math.max(0, qtyUnits - activated);

        out.push({
          pane_key: `${ol.id}:S`,
          line_id: ol.id,
          line_code: ol.line_code,
          qty_units: qtyUnits,
          size: ol.size,
          glass_type: ol.glass_type,
          notes: ol.notes,

          panes_per_unit: 1,
          pane_label: null,
          pane_type: extractPaneType(gt),

          activated_panes: activated,
          needed_panes: qtyUnits,
          remaining_panes: remaining,
        });
        continue;
      }

      // multi (A/B)
      const { a, b } = splitGlassTypeToAB(gt);

      // Activated per label
      const [[cntA]] = await pool.execute(
        `
        SELECT COUNT(*) AS c
        FROM glass_pieces
        WHERE line_id = ?
          AND pane_label = 'A'
          AND status NOT IN ('broken','completed')
        `,
        [ol.id]
      );

      const [[cntB]] = await pool.execute(
        `
        SELECT COUNT(*) AS c
        FROM glass_pieces
        WHERE line_id = ?
          AND pane_label = 'B'
          AND status NOT IN ('broken','completed')
        `,
        [ol.id]
      );

      const actA = Number(cntA?.c || 0);
      const actB = Number(cntB?.c || 0);

      out.push({
        pane_key: `${ol.id}:A`,
        line_id: ol.id,
        line_code: `${ol.line_code} (A)`,
        qty_units: qtyUnits,
        size: ol.size,
        glass_type: ol.glass_type,
        notes: ol.notes,

        panes_per_unit: 2,
        pane_label: "A",
        pane_type: extractPaneType(a),

        activated_panes: actA,
        needed_panes: qtyUnits,
        remaining_panes: Math.max(0, qtyUnits - actA),
      });

      out.push({
        pane_key: `${ol.id}:B`,
        line_id: ol.id,
        line_code: `${ol.line_code} (B)`,
        qty_units: qtyUnits,
        size: ol.size,
        glass_type: ol.glass_type,
        notes: ol.notes,

        panes_per_unit: 2,
        pane_label: "B",
        pane_type: extractPaneType(b),

        activated_panes: actB,
        needed_panes: qtyUnits,
        remaining_panes: Math.max(0, qtyUnits - actB),
      });
    }

    res.json({ ok: true, lines: out });
  } catch (e) {
    next(e);
  }
});

// --------------------
// ✅ Activate = create PANES (pane aware)
// - can activate only A today and B tomorrow
// - assigns unit_seq smartly: fills missing sequences 1..qty
// - sets unit_key, pane_label, pane_type
// - sets order Active only when all panes fully created (qty*panes_per_unit)
// --------------------
router.post("/activate", async (req, res, next) => {
  let conn;
  try {
    conn = await pool.getConnection();

    const orderId = clampInt(req.body?.orderId, 1, 999999999, null);
    const items = Array.isArray(req.body?.lines) ? req.body.lines : [];

    if (!orderId)
      return res.status(400).json({ ok: false, error: "orderId required" });
    if (!items.length)
      return res.status(400).json({ ok: false, error: "lines required" });

    const [ordRows] = await conn.execute(
      `SELECT id, order_no, status FROM orders WHERE id = ? LIMIT 1`,
      [orderId]
    );
    if (!ordRows.length)
      return res.status(404).json({ ok: false, error: "Order not found" });

    const orderNo = ordRows[0].order_no;

    // First station
    const [stRows] = await conn.execute(
      `SELECT id FROM stations WHERE stage_order = 1 ORDER BY id ASC LIMIT 1`
    );
    const firstStationId = stRows[0]?.id || null;

    if (!firstStationId) {
      return res
        .status(400)
        .json({ ok: false, error: "No first station found (stage_order=1)" });
    }

    await conn.beginTransaction();

    let createdPieces = 0;
    let touched = 0;

    for (const x of items) {
      const go = x.go === true || x.go === 1 || x.go === "1";
      if (!go) continue;

      const lineId = clampInt(x.lineId, 1, 999999999, null);
      const activateQtyPanes = clampInt(x.activateQty, 0, 999999999, 0);
      const paneLabel =
        x.paneLabel === "A" || x.paneLabel === "B" ? x.paneLabel : null;
      const paneType = norm(x.paneType) || null;

      if (!lineId || activateQtyPanes <= 0) continue;

      const [lineRows] = await conn.execute(
        `
        SELECT id, line_code, qty, glass_type
        FROM order_lines
        WHERE id = ? AND order_id = ? LIMIT 1
        `,
        [lineId, orderId]
      );
      if (!lineRows.length) continue;

      const line = lineRows[0];
      const lineCode = line.line_code || `L${lineId}`;
      const totalUnits = Number(line.qty || 0);

      // Determine if this line is multi-pane
      const gt = norm(line.glass_type);
      const multi = isDoubleOrLam(gt);

      // Load existing panes per unit_seq
      const [existing] = await conn.execute(
        `
        SELECT unit_seq, pane_label
        FROM glass_pieces
        WHERE line_id = ?
          AND status NOT IN ('broken','completed')
          AND unit_seq IS NOT NULL
        `,
        [lineId]
      );

      // Map unit_seq => Set(labels)
      const map = new Map();
      for (const r of existing) {
        const seq = Number(r.unit_seq);
        if (!map.has(seq)) map.set(seq, new Set());
        map.get(seq).add(r.pane_label || "S");
      }

      // helper: find next unit_seq that misses label
      function findNextSeqForLabel(labelWanted) {
        for (let seq = 1; seq <= totalUnits; seq++) {
          const set = map.get(seq) || new Set();
          if (!set.has(labelWanted)) return seq;
        }
        return null;
      }

      // Create panes
      for (let i = 0; i < activateQtyPanes; i++) {
        let labelWanted = "S";
        if (multi) {
          // For multi, paneLabel MUST be A or B (because intake is pane records)
          if (!paneLabel) break;
          labelWanted = paneLabel;
        }

        const seq = findNextSeqForLabel(labelWanted);
        if (!seq) break; // no space left

        // mark filled
        if (!map.has(seq)) map.set(seq, new Set());
        map.get(seq).add(labelWanted);

        const unitKey = `${orderNo}-${lineCode}-${seq}`;
        const pieceNumber = multi
          ? `${orderNo}-${lineCode}-${seq}-${labelWanted}`
          : `${orderNo}-${lineCode}-${seq}`;

        await conn.execute(
          `
          INSERT INTO glass_pieces (
            order_id, line_id, current_station_id,
            piece_number, status, created_at, updated_at,
            unit_key, unit_seq, pane_label, pane_type
          ) VALUES (?, ?, ?, ?, 'pending', NOW(), NOW(), ?, ?, ?, ?)
          `,
          [
            orderId,
            lineId,
            firstStationId,
            pieceNumber,
            unitKey,
            seq,
            multi ? labelWanted : null,
            paneType,
          ]
        );

        createdPieces++;
      }

      touched++;
    }

    // recompute full lines using panes_count >= qty * panes_per_unit
    const [[stats]] = await conn.execute(
      `
      SELECT
        (SELECT COUNT(*) FROM order_lines WHERE order_id = ?) AS totalLines,
        (
          SELECT COUNT(*)
          FROM (
            SELECT
              ol.id,
              ol.qty,
              ${PANES_PER_UNIT_EXPR} AS panes_per_unit,
              COUNT(gp.id) AS panes_count
            FROM order_lines ol
            LEFT JOIN glass_pieces gp
              ON gp.line_id = ol.id
             AND gp.status NOT IN ('broken','completed')
            WHERE ol.order_id = ?
            GROUP BY ol.id, ol.qty, panes_per_unit
            HAVING panes_count >= (ol.qty * panes_per_unit)
          ) t
        ) AS fullLines
      `,
      [orderId, orderId]
    );

    const totalLines = Number(stats?.totalLines || 0);
    const fullLines = Number(stats?.fullLines || 0);
    const allFullyActivated = totalLines > 0 && fullLines === totalLines;

    await conn.execute(
      `UPDATE orders
       SET status = ?
       WHERE id = ? AND status IN ('Draft','Active')`,
      [allFullyActivated ? "Active" : "Draft", orderId]
    );

    await conn.commit();

    res.json({
      ok: true,
      orderId,
      createdPieces,
      touched,
      totalLines,
      fullLines,
      orderStatus: allFullyActivated ? "Active" : "Draft",
    });
  } catch (e) {
    if (conn) await conn.rollback().catch(() => {});
    next(e);
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
