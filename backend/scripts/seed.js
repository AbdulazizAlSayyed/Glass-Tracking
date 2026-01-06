require("dotenv").config();
const bcrypt = require("bcryptjs");
const pool = require("../db");

async function main() {
  // 1) Stations
  const stations = [
    ["CUT-01", "Cutting", 1],
    ["EDG-01", "Machine Edging", 2],
    ["DRL-01", "Drilling", 3],
    ["TMP-01", "Tempering", 4],
    ["LAM-01", "Lamination", 5],
    ["AUT-01", "Autoclave", 6],
    ["DGL-01", "Double Glazing", 7],
    ["DLV-01", "Delivery", 8],
  ];

  for (const [code, name, order] of stations) {
    await pool.execute(
      `INSERT IGNORE INTO stations (code, name, stage_order) VALUES (?, ?, ?)`,
      [code, name, order]
    );
  }

  const [[cut]] = await pool.execute(
    `SELECT id FROM stations WHERE code='CUT-01' LIMIT 1`
  );
  const [[dlv]] = await pool.execute(
    `SELECT id FROM stations WHERE code='DLV-01' LIMIT 1`
  );

  // 2) Users (password = 123456)
  const pass = await bcrypt.hash("123456", 10);

  const users = [
    // username, hash, role, station_id, home_page
    ["admin", pass, "manager", null, "dashboard.html"],
    ["amani", pass, "order_creator", null, "import-orders.html"],
    ["ahmed", pass, "station", cut?.id || null, "station.html"],
    ["delivery", pass, "station", dlv?.id || null, "station.html"],
  ];

  for (const u of users) {
    await pool.execute(
      `INSERT IGNORE INTO users (username, password_hash, role, station_id, home_page, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      u
    );
  }

  console.log(
    "✅ Seed done. Users created (password=123456): admin, amani, ahmed, delivery"
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
