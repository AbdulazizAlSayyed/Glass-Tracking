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
const activationRoutes = require("./routes/activation");
const liveTrackingRoutes = require("./routes/liveTrackingRoutes");
const reportsRoutes = require("./routes/reportsRoutes");
const deliveryRoutes = require("./routes/delivery");
const usersRoutes = require("./routes/users");

// ... middlewares زي json, cors, الخ

const app = express();

app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? ["http://your-domain.com"]
        : [
            "http://localhost:3000",
            "http://localhost:8080",
            "http://localhost:4000",
          ],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

// Frontend
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
app.use(express.static(FRONTEND_DIR));

app.get("/", (req, res) => res.sendFile(path.join(FRONTEND_DIR, "index.html")));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    message: "Glass Tracking API is running",
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/orders", authRequired, ordersRoutes);
app.use("/api/intake", authRequired, intakeRoutes);
app.use("/api/pieces", authRequired, piecesRoutes);
app.use("/api/stations", authRequired, stationsRoutes);
app.use("/api/manager", authRequired, managerRoutes);
app.use("/api/activation", authRequired, activationRoutes);
app.use("/api/live-tracking", liveTrackingRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/delivery", deliveryRoutes);
app.use("/api/users", usersRoutes);

// frontend pages fallback
app.get("/:file", (req, res, next) => {
  const allowedPages = [
    "index.html",
    "dashboard.html",
    "import-orders.html",
    "station.html",
    "activation.html",
    "manager.html",
  ];
  if (!allowedPages.includes(req.params.file)) return next();

  const filePath = path.join(FRONTEND_DIR, req.params.file);
  res.sendFile(filePath, (err) => (err ? next() : null));
});

// 404
app.use((req, res) =>
  res.status(404).json({ ok: false, error: "Route not found" })
);

// error handler
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err);
  const status = err.status || 500;
  const message =
    process.env.NODE_ENV === "development"
      ? err.message
      : "Internal server error";

  res.status(status).json({ ok: false, error: message });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 API+Frontend running on http://localhost:${PORT}`);
  console.log(`📁 Frontend directory: ${FRONTEND_DIR}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
});
