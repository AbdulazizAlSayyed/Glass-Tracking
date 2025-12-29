// backend/routes/workflowRoutes.js
const router = require("express").Router();
const pool = require("../db");
const { authRequired } = require("../middleware/auth");

// Helper: تأكد من وجود جدول broken_reasons
async function ensureBrokenReasonsTable(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS broken_reasons (
      id INT AUTO_INCREMENT PRIMARY KEY,
      label VARCHAR(255) NOT NULL,
      sort_order INT NOT NULL DEFAULT 1,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

// GET /api/workflow
router.get("/", authRequired, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();

    // تأكّد من broken_reasons
    await ensureBrokenReasonsTable(conn);

    // Stages من stations
    const [stations] = await conn.execute(
      `
      SELECT id, code, name, stage_order, is_active
      FROM stations
      ORDER BY stage_order ASC, id ASC
    `
    );

    // Broken reasons
    const [reasons] = await conn.execute(
      `
      SELECT id, label, sort_order, is_active
      FROM broken_reasons
      ORDER BY sort_order ASC, id ASC
    `
    );

    res.json({
      ok: true,
      stages: stations.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        order: s.stage_order,
        isActive: !!s.is_active,
      })),
      brokenReasons: reasons.map((r) => ({
        id: r.id,
        label: r.label,
        order: r.sort_order,
        isActive: !!r.is_active,
      })),
    });
  } catch (e) {
    console.error("GET /api/workflow error:", e);
    res.status(500).json({ ok: false, error: e.message || "Server error" });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/workflow
router.post("/", authRequired, async (req, res) => {
  const rawStages = Array.isArray(req.body.stages) ? req.body.stages : [];
  const rawReasons = Array.isArray(req.body.brokenReasons)
    ? req.body.brokenReasons
    : [];

  // ✅ نعمل normalise حتى لو جاية كـ string أو object
  const stages = rawStages
    .map((s) => {
      if (typeof s === "string") {
        return { id: null, name: s, isActive: true };
      }
      return {
        id: s.id || null,
        name: (s.name || "").trim(),
        isActive: s.isActive === false ? false : true,
      };
    })
    .filter((s) => s.name);

  const brokenReasons = rawReasons
    .map((r) => {
      if (typeof r === "string") {
        return { id: null, label: r, isActive: true };
      }
      return {
        id: r.id || null,
        label: (r.label || "").trim(),
        isActive: r.isActive === false ? false : true,
      };
    })
    .filter((r) => r.label);

  let conn;
  try {
    conn = await pool.getConnection();
    await ensureBrokenReasonsTable(conn);
    await conn.beginTransaction();

    // =======================
    // 1) تحديث STATIONS
    // =======================
    const stageIds = [];

    for (let i = 0; i < stages.length; i++) {
      const s = stages[i];
      const order = i + 1;
      const name = s.name;
      const isActive = s.isActive ? 1 : 0;

      if (s.id) {
        stageIds.push(Number(s.id));
        await conn.execute(
          `
          UPDATE stations
          SET name = ?, stage_order = ?, is_active = ?
          WHERE id = ?
        `,
          [name, order, isActive, s.id]
        );
      } else {
        const code = name.toUpperCase().replace(/\s+/g, "_").slice(0, 20);
        const [result] = await conn.execute(
          `
          INSERT INTO stations (code, name, stage_order, is_active)
          VALUES (?,?,?,?)
        `,
          [code, name, order, isActive]
        );
        stageIds.push(result.insertId);
      }
    }

    // حط باقي المحطات inactive لو مش موجودة باللستة
    if (stageIds.length > 0) {
      await conn.execute(
        `
        UPDATE stations
        SET is_active = 0
        WHERE id NOT IN (${stageIds.map(() => "?").join(",")})
      `,
        stageIds
      );
    }

    // =======================
    // 2) تحديث BROKEN_REASONS
    // =======================
    const reasonIds = [];

    for (let i = 0; i < brokenReasons.length; i++) {
      const r = brokenReasons[i];
      const order = i + 1;
      const label = r.label;
      const isActive = r.isActive ? 1 : 0;

      if (r.id) {
        reasonIds.push(Number(r.id));
        await conn.execute(
          `
          UPDATE broken_reasons
          SET label = ?, sort_order = ?, is_active = ?
          WHERE id = ?
        `,
          [label, order, isActive, r.id]
        );
      } else {
        const [result] = await conn.execute(
          `
          INSERT INTO broken_reasons (label, sort_order, is_active)
          VALUES (?,?,?)
        `,
          [label, order, isActive]
        );
        reasonIds.push(result.insertId);
      }
    }

    if (reasonIds.length > 0) {
      await conn.execute(
        `
        UPDATE broken_reasons
        SET is_active = 0
        WHERE id NOT IN (${reasonIds.map(() => "?").join(",")})
      `,
        reasonIds
      );
    }

    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error("Rollback error in /api/workflow:", rollbackErr);
      }
    }
    console.error("POST /api/workflow error:", e);
    res.status(500).json({ ok: false, error: e.message || "Server error" });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
