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

function norm(s) {
  return String(s || "").trim();
}

function getUserId(req) {
  return req.user?.userId ?? req.user?.id ?? null;
}
function getStationId(req) {
  return req.user?.stationId ?? req.user?.station_id ?? null;
}

// =========================
// Scan Next (DONE / PASS)
// =========================
router.post("/scan-next", async (req, res, next) => {
  let conn;
  try {
    const pieceCode = norm(req.body?.pieceCode);
    const notes = req.body?.notes ? norm(req.body.notes) : null;

    const userId = getUserId(req);
    const stationId = getStationId(req);

    if (!pieceCode) {
      return res
        .status(400)
        .json({ ok: false, error: "pieceCode is required" });
    }

    // station_worker لازم يكون عنده station
    if (req.user?.role === "station_worker" && !stationId) {
      return res
        .status(400)
        .json({ ok: false, error: "No station assigned to this user" });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    // piece_number هو الكود الحقيقي بالـ DB
    const [rows] = await conn.execute(
      `
      SELECT id AS piece_id, piece_number, current_station_id, status
      FROM glass_pieces
      WHERE piece_number = ?
      LIMIT 1
      `,
      [pieceCode]
    );

    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ ok: false, error: "Piece not found" });
    }

    const piece = rows[0];

    if (piece.status === "broken" || piece.status === "completed") {
      await conn.rollback();
      return res
        .status(400)
        .json({ ok: false, error: `Piece is ${piece.status}` });
    }

    // station_worker لازم القطعة تكون بمحطته
    if (req.user?.role === "station_worker") {
      if (Number(piece.current_station_id) !== Number(stationId)) {
        await conn.rollback();
        return res
          .status(400)
          .json({ ok: false, error: "Piece is not at your station" });
      }
    }

    // جيب stage_order للمحطة الحالية
    const [cs] = await conn.execute(
      `SELECT id, stage_order, name FROM stations WHERE id = ? LIMIT 1`,
      [piece.current_station_id]
    );
    if (!cs.length) {
      await conn.rollback();
      return res
        .status(400)
        .json({ ok: false, error: "Invalid current station" });
    }

    const currentStation = cs[0];

    // المحطة التالية
    const [ns] = await conn.execute(
      `SELECT id, name FROM stations WHERE is_active=1 AND stage_order = ? LIMIT 1`,
      [Number(currentStation.stage_order) + 1]
    );

    if (ns.length) {
      const nextStation = ns[0];

      // move to next station
      await conn.execute(
        `
        UPDATE glass_pieces
        SET current_station_id = ?,
            scanned_by = ?,
            scanned_at = NOW(),
            updated_at = NOW()
        WHERE id = ?
        `,
        [nextStation.id, userId, piece.piece_id]
      );

      // log event
      await conn.execute(
        `
        INSERT INTO piece_events (piece_id, event_type, station_id, user_id, notes)
        VALUES (?, 'PASS', ?, ?, ?)
        `,
        [piece.piece_id, currentStation.id, userId, notes]
      );

      await conn.commit();

      // return updated
      const [updated] = await pool.execute(
        `
        SELECT gp.piece_number AS piece_code,
               gp.status AS piece_status,
               s.name AS current_station
        FROM glass_pieces gp
        LEFT JOIN stations s ON s.id = gp.current_station_id
        WHERE gp.id = ?
        LIMIT 1
        `,
        [piece.piece_id]
      );

      return res.json({
        ok: true,
        message: "Scan next OK",
        piece: updated[0] || null,
      });
    } else {
      // last station => completed
      await conn.execute(
        `
        UPDATE glass_pieces
        SET status = 'completed',
            current_station_id = NULL,
            scanned_by = ?,
            scanned_at = NOW(),
            updated_at = NOW()
        WHERE id = ?
        `,
        [userId, piece.piece_id]
      );

      await conn.execute(
        `
        INSERT INTO piece_events (piece_id, event_type, station_id, user_id, notes)
        VALUES (?, 'PASS', ?, ?, ?)
        `,
        [piece.piece_id, currentStation.id, userId, notes]
      );

      await conn.commit();

      const [updated] = await pool.execute(
        `
        SELECT gp.piece_number AS piece_code,
               gp.status AS piece_status,
               NULL AS current_station
        FROM glass_pieces gp
        WHERE gp.id = ?
        LIMIT 1
        `,
        [piece.piece_id]
      );

      return res.json({
        ok: true,
        message: "Scan next OK (completed)",
        piece: updated[0] || null,
      });
    }
  } catch (e) {
    if (conn) await conn.rollback().catch(() => {});
    next(handleDbError(e));
  } finally {
    if (conn) conn.release();
  }
});

// =========================
// Broken
// =========================
router.post("/broken", async (req, res, next) => {
  let conn;
  try {
    const pieceCode = norm(req.body?.pieceCode);
    const notes = req.body?.notes ? norm(req.body.notes) : null;

    const userId = getUserId(req);
    const stationId = getStationId(req);

    if (!pieceCode) {
      return res
        .status(400)
        .json({ ok: false, error: "pieceCode is required" });
    }

    if (req.user?.role === "station_worker" && !stationId) {
      return res
        .status(400)
        .json({ ok: false, error: "No station assigned to this user" });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [rows] = await conn.execute(
      `
      SELECT id AS piece_id, piece_number, current_station_id, status
      FROM glass_pieces
      WHERE piece_number = ?
      LIMIT 1
      `,
      [pieceCode]
    );

    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ ok: false, error: "Piece not found" });
    }

    const piece = rows[0];

    if (piece.status === "broken" || piece.status === "completed") {
      await conn.rollback();
      return res
        .status(400)
        .json({ ok: false, error: `Piece is ${piece.status}` });
    }

    if (req.user?.role === "station_worker") {
      if (Number(piece.current_station_id) !== Number(stationId)) {
        await conn.rollback();
        return res
          .status(400)
          .json({ ok: false, error: "Piece is not at your station" });
      }
    }

    await conn.execute(
      `
  UPDATE glass_pieces
  SET status='broken',
      scanned_by=?,
      scanned_at=NOW(),
      updated_at=NOW(),
      needs_replacement=1,
      broken_at=NOW(),
      broken_station_id=?,
      broken_notes=?
  WHERE id=?
  `,
      [userId, piece.current_station_id, notes, piece.piece_id]
    );

    await conn.execute(
      `
      INSERT INTO piece_events (piece_id, event_type, station_id, user_id, notes)
      VALUES (?, 'BROKEN', ?, ?, ?)
      `,
      [piece.piece_id, piece.current_station_id, userId, notes]
    );

    await conn.commit();

    const [out] = await pool.execute(
      `
      SELECT gp.piece_number AS piece_code,
             gp.status AS piece_status,
             s.name AS current_station
      FROM glass_pieces gp
      LEFT JOIN stations s ON s.id = gp.current_station_id
      WHERE gp.id = ?
      LIMIT 1
      `,
      [piece.piece_id]
    );

    res.json({ ok: true, message: "Marked as broken", piece: out[0] || null });
  } catch (e) {
    if (conn) await conn.rollback().catch(() => {});
    next(handleDbError(e));
  } finally {
    if (conn) conn.release();
  }
});

// =========================
// History
// =========================
router.get("/:pieceCode/history", async (req, res, next) => {
  try {
    const pieceCode = norm(req.params?.pieceCode);

    const [pieceRows] = await pool.execute(
      `SELECT id AS piece_id, piece_number AS piece_code
       FROM glass_pieces
       WHERE piece_number = ?
       LIMIT 1`,
      [pieceCode]
    );

    if (!pieceRows.length) {
      return res.status(404).json({ ok: false, error: "Piece not found" });
    }

    const pieceId = pieceRows[0].piece_id;

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
