const router = require("express").Router();
const pool = require("../db");

function handleDbError(e) {
  if (e && e.sqlState === "45000") {
    const err = new Error(e.message);
    err.status = 400;
    return err;
  }
  return e;
}

// ✅ Scan Next (المحطة والمستخدم من التوكن)
router.post("/scan-next", async (req, res, next) => {
  try {
    const { pieceCode, notes = null } = req.body;
    const stationId = req.user?.stationId;
    const userId = req.user?.userId;

    if (!pieceCode)
      return res
        .status(400)
        .json({ ok: false, error: "pieceCode is required" });

    if (!stationId)
      return res
        .status(400)
        .json({ ok: false, error: "No station assigned to this user" });

    // 1) تحقق القطعة موجودة وبأي محطة
    const [rows] = await pool.execute(
      `SELECT piece_id, current_station_id, piece_status
       FROM glass_pieces
       WHERE piece_code = ?
       LIMIT 1`,
      [pieceCode]
    );

    if (!rows.length)
      return res.status(404).json({ ok: false, error: "Piece not found" });

    const piece = rows[0];

    // 2) تحقق الحالة
    if (piece.piece_status === "broken" || piece.piece_status === "completed") {
      return res
        .status(400)
        .json({ ok: false, error: `Piece is ${piece.piece_status}` });
    }

    // 3) أهم تحقق: لازم القطعة تكون بمحطة المستخدم
    if (Number(piece.current_station_id) !== Number(stationId)) {
      return res
        .status(400)
        .json({ ok: false, error: "Piece is not at your station" });
    }

    // 4) نفّذ move_next (حسب الـworkflow تبع الطلبية إذا انت عدّلته)
    await pool.execute("CALL sp_move_next(?, ?, ?)", [
      pieceCode,
      userId || null,
      notes,
    ]);

    // رجّع وضع القطعة بعد التحديث
    const [updated] = await pool.execute(
      `
      SELECT gp.piece_code, gp.piece_status, s.name AS current_station
      FROM glass_pieces gp
      LEFT JOIN stations s ON s.station_id = gp.current_station_id
      WHERE gp.piece_code = ?
      LIMIT 1
      `,
      [pieceCode]
    );

    res.json({ ok: true, message: "Scan next OK", piece: updated[0] || null });
  } catch (e) {
    next(handleDbError(e));
  }
});

// ✅ Broken (stationName ما عاد يجي من الفرونت)
router.post("/broken", async (req, res, next) => {
  try {
    const { pieceCode, notes = null } = req.body;
    const stationId = req.user?.stationId;
    const userId = req.user?.userId;

    if (!pieceCode)
      return res
        .status(400)
        .json({ ok: false, error: "pieceCode is required" });

    if (!stationId)
      return res
        .status(400)
        .json({ ok: false, error: "No station assigned to this user" });

    // هات اسم المحطة من DB (لأن sp_mark_broken بدها stationName)
    const [srows] = await pool.execute(
      "SELECT name FROM stations WHERE station_id = ? LIMIT 1",
      [stationId]
    );
    if (!srows.length)
      return res.status(400).json({ ok: false, error: "Invalid station" });

    const stationName = srows[0].name;

    await pool.execute("CALL sp_mark_broken(?, ?, ?, ?)", [
      pieceCode,
      stationName,
      userId || null,
      notes,
    ]);

    const [rows] = await pool.execute(
      `
      SELECT gp.piece_code, gp.piece_status, s.name AS current_station
      FROM glass_pieces gp
      LEFT JOIN stations s ON s.station_id = gp.current_station_id
      WHERE gp.piece_code = ?
      LIMIT 1
      `,
      [pieceCode]
    );

    res.json({ ok: true, message: "Marked as broken", piece: rows[0] || null });
  } catch (e) {
    next(handleDbError(e));
  }
});

// ✅ History (مثل ما هو)
router.get("/:pieceCode/history", async (req, res, next) => {
  try {
    const { pieceCode } = req.params;

    const [pieceRows] = await pool.execute(
      "SELECT piece_id, piece_code FROM glass_pieces WHERE piece_code=? LIMIT 1",
      [pieceCode]
    );

    if (!pieceRows.length)
      return res.status(404).json({ ok: false, error: "Piece not found" });

    const pieceId = pieceRows[0].piece_id;

    const [rows] = await pool.execute(
      `
      SELECT pe.event_time, pe.event_type, pe.notes,
             s.name AS station_name, u.username AS by_user
      FROM piece_events pe
      LEFT JOIN stations s ON s.station_id = pe.station_id
      LEFT JOIN users u ON u.user_id = pe.user_id
      WHERE pe.piece_id = ?
      ORDER BY pe.event_time ASC
      `,
      [pieceId]
    );

    res.json({ ok: true, piece: pieceRows[0], history: rows });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
