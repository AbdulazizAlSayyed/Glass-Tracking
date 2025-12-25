const mysql = require("mysql2/promise");
require("dotenv").config();

// Create connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "glass_tracking",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

// اختبار الاتصال وإظهار الأخطاء
pool
  .getConnection()
  .then((connection) => {
    console.log("✅ Connected to MySQL database:", process.env.DB_NAME);

    // اختبار استعلام بسيط للتحقق من الجداول
    return connection.query("SHOW TABLES").then(([rows]) => {
      console.log(
        "📊 Tables in database:",
        rows.map((r) => Object.values(r)[0]).join(", ")
      );
      connection.release();
    });
  })
  .catch((err) => {
    console.error("❌ Database connection failed:");
    console.error("   Error:", err.message);
    console.error("   Host:", process.env.DB_HOST || "localhost");
    console.error("   Database:", process.env.DB_NAME || "glass_tracking");
    console.error("   User:", process.env.DB_USER || "root");
    console.error("\nPlease check:");
    console.error("1. MySQL service is running");
    console.error("2. Database exists: CREATE DATABASE glass_tracking;");
    console.error("3. User has proper permissions");
    console.error("4. Check .env file configuration");
  });

module.exports = pool;
