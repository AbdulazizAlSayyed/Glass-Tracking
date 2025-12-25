require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");

const authRoutes = require("./routes/auth");
const piecesRoutes = require("./routes/pieces");
const stationsRoutes = require("./routes/stations");
const ordersRoutes = require("./routes/orders");
const intakeRoutes = require("./routes/intake");
const { authRequired } = require("./middleware/auth");
const managerRoutes = require("./routes/manager");

const app = express();

// CORS configuration
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? ["http://your-domain.com"]
        : ["http://localhost:3000", "http://localhost:8080"],
    credentials: true,
  })
);

app.use(express.json());
app.use(morgan("dev"));
app.use(express.urlencoded({ extended: true }));

// Frontend path
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
app.use(express.static(FRONTEND_DIR));

// Root
app.get("/", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    message: "Glass Tracking API is running",
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/orders", authRequired, ordersRoutes);
app.use("/api/intake", authRequired, intakeRoutes);
app.use("/api/pieces", authRequired, piecesRoutes);
app.use("/api/stations", authRequired, stationsRoutes);
app.use("/api/manager", authRequired, managerRoutes);

// Who am I
app.get("/api/auth/me", authRequired, async (req, res, next) => {
  const pool = require("./db");
  let conn;
  try {
    conn = await pool.getConnection();
    const userId = req.user?.userId ?? req.user?.id;

    if (!userId) {
      return res.status(400).json({
        ok: false,
        error: "User ID not found in token",
      });
    }

    const [rows] = await conn.execute(
      `SELECT 
         id, 
         username, 
         role, 
         home_page AS homePage,
         station_id AS stationId
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        error: "User not found",
      });
    }

    res.json({
      ok: true,
      user: rows[0],
    });
  } catch (e) {
    console.error("Error in /api/auth/me:", e);
    next(e);
  } finally {
    if (conn) conn.release();
  }
});

// Fallback route for frontend pages
app.get("/:file", (req, res, next) => {
  const allowedPages = [
    "index.html",
    "dashboard.html",
    "import-orders.html",
    "station.html",
    "activation.html",
    "manager.html",
  ];

  if (!allowedPages.includes(req.params.file)) {
    return next();
  }

  const filePath = path.join(FRONTEND_DIR, req.params.file);
  res.sendFile(filePath, (err) => {
    if (err) next();
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Route not found",
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err);
  const status = err.status || 500;
  const message =
    process.env.NODE_ENV === "development"
      ? err.message
      : "Internal server error";

  res.status(status).json({
    ok: false,
    error: message,
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 API+Frontend running on http://localhost:${PORT}`);
  console.log(`📁 Frontend directory: ${FRONTEND_DIR}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
});
