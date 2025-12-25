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

// Scan Next
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

    // ✅ استخدم أعمدة الـ DB: id + status
    const [rows] = await pool.execute(
      `SELECT id AS piece_id, current_station_id, status AS piece_status
       FROM glass_pieces
       WHERE piece_code = ?
       LIMIT 1`,
      [pieceCode]
    );

    if (!rows.length)
      return res.status(404).json({ ok: false, error: "Piece not found" });

    const piece = rows[0];

    if (piece.piece_status === "broken" || piece.piece_status === "completed") {
      return res
        .status(400)
        .json({ ok: false, error: `Piece is ${piece.piece_status}` });
    }

    if (Number(piece.current_station_id) !== Number(stationId)) {
      return res
        .status(400)
        .json({ ok: false, error: "Piece is not at your station" });
    }

    await pool.execute("CALL sp_move_next(?, ?, ?)", [
      pieceCode,
      userId || null,
      notes,
    ]);

    const [updated] = await pool.execute(
      `
      SELECT gp.piece_code,
             gp.status AS piece_status,
             s.name AS current_station
      FROM glass_pieces gp
      LEFT JOIN stations s ON s.id = gp.current_station_id
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

// Broken
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

    const [srows] = await pool.execute(
      "SELECT name FROM stations WHERE id = ? LIMIT 1",
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
      SELECT gp.piece_code,
             gp.status AS piece_status,
             s.name AS current_station
      FROM glass_pieces gp
      LEFT JOIN stations s ON s.id = gp.current_station_id
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

// History
router.get("/:pieceCode/history", async (req, res, next) => {
  try {
    const { pieceCode } = req.params;

    // ✅ alias id → piece_id
    const [pieceRows] = await pool.execute(
      "SELECT id AS piece_id, piece_code FROM glass_pieces WHERE piece_code=? LIMIT 1",
      [pieceCode]
    );

    if (!pieceRows.length)
      return res.status(404).json({ ok: false, error: "Piece not found" });

    const pieceId = pieceRows[0].piece_id;

    // ✅ عندك في الجدول اسم العمود created_at مش event_time
    const [rows] = await pool.execute(
      `
      SELECT pe.created_at AS event_time,
             pe.event_type,
             pe.notes,
             s.name AS station_name,
             u.username AS by_user
      FROM piece_events pe
      LEFT JOIN stations s ON s.id = pe.station_id
      LEFT JOIN users   u ON u.id = pe.user_id
      WHERE pe.piece_id = ?
      ORDER BY pe.created_at ASC
      `,
      [pieceId]
    );

    res.json({ ok: true, piece: pieceRows[0], history: rows });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
