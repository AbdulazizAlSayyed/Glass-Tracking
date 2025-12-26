const router = require("express").Router();
const pool = require("../db");

// (اختياري) حماية role إذا عندك role اسمه activation
function onlyActivation(req, res, next) {
  const role = req.user?.role;
  if (role === "activation" || role === "manager" || role === "admin")
    return next();
  return res.status(403).json({ ok: false, error: "Activation access only" });
}

// ✅ لائحة القطع المكسورة اللي بدها replacement
router.get("/broken", onlyActivation, async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT 
        gp.id AS broken_piece_id,
        gp.piece_number AS broken_piece_code,
        gp.broken_at,
        gp.broken_notes,
        s.name AS broken_station_name,
        o.order_no AS order_code,
        o.client AS customer,
        ol.line_code,
        ol.size,
        ol.glass_type
      FROM glass_pieces gp
      LEFT JOIN stations s ON s.id = gp.broken_station_id
      JOIN orders o ON o.id = gp.order_id
      JOIN order_lines ol ON ol.id = gp.line_id
      WHERE gp.status='broken'
        AND gp.needs_replacement=1
      ORDER BY gp.broken_at DESC
      `
    );

    res.json({ ok: true, data: rows });
  } catch (e) {
    next(e);
  }
});

// ✅ Ziad يعمل replacement (ينشئ قطعة جديدة وترجع لأول محطة)
router.post("/replace", onlyActivation, async (req, res, next) => {
  let conn;
  try {
    const brokenPieceCode = String(req.body?.brokenPieceCode || "").trim();
    if (!brokenPieceCode) {
      return res
        .status(400)
        .json({ ok: false, error: "brokenPieceCode is required" });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [[broken]] = await conn.execute(
      `
      SELECT id, order_id, line_id, piece_number
      FROM glass_pieces
      WHERE piece_number = ?
        AND status='broken'
        AND needs_replacement=1
      LIMIT 1
      `,
      [brokenPieceCode]
    );

    if (!broken) {
      await conn.rollback();
      return res
        .status(404)
        .json({
          ok: false,
          error: "Broken piece not found or already resolved",
        });
    }

    // أول محطة (stage_order=1)
    const [[firstStation]] = await conn.execute(
      `SELECT id FROM stations WHERE is_active=1 ORDER BY stage_order ASC LIMIT 1`
    );
    if (!firstStation) {
      await conn.rollback();
      return res
        .status(400)
        .json({ ok: false, error: "No active stations found" });
    }

    // Generate new piece code: XXX-R1 / R2 ...
    const base = broken.piece_number;
    const [existing] = await conn.execute(
      `SELECT piece_number FROM glass_pieces WHERE piece_number LIKE ?`,
      [`${base}-R%`]
    );

    let maxR = 0;
    for (const r of existing) {
      const m = String(r.piece_number).match(/-R(\d+)$/i);
      if (m) maxR = Math.max(maxR, parseInt(m[1], 10));
    }
    const newCode = `${base}-R${maxR + 1}`;

    // Create replacement piece
    const [ins] = await conn.execute(
      `
      INSERT INTO glass_pieces (order_id, line_id, piece_number, status, current_station_id, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', ?, NOW(), NOW())
      `,
      [broken.order_id, broken.line_id, newCode, firstStation.id]
    );

    const newPieceId = ins.insertId;

    // Mark broken as resolved
    await conn.execute(
      `
      UPDATE glass_pieces
      SET needs_replacement=0,
          replacement_piece_id=?,
          updated_at=NOW()
      WHERE id=?
      `,
      [newPieceId, broken.id]
    );

    await conn.commit();

    res.json({
      ok: true,
      message: "Replacement created",
      replacement: {
        id: newPieceId,
        piece_code: newCode,
        first_station_id: firstStation.id,
      },
    });
  } catch (e) {
    if (conn) await conn.rollback().catch(() => {});
    next(e);
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
