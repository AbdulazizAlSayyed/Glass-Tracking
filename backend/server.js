require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");

const authRoutes = require("./routes/auth");
const piecesRoutes = require("./routes/pieces");
const stationsRoutes = require("./routes/stations");
const ordersRoutes = require("./routes/orders");
const { authRequired } = require("./middleware/auth");
const intakeRoutes = require("./routes/intake");
const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// ✅ Frontend path
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
app.use(express.static(FRONTEND_DIR));

// ✅ Root
app.get("/", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

// ✅ API routes
app.use("/api/auth", authRoutes);
app.use("/api/intake", authRequired, intakeRoutes);

app.use("/api/pieces", authRequired, piecesRoutes);
app.use("/api/stations", authRequired, stationsRoutes);
app.use("/api/orders", authRequired, ordersRoutes);

// ✅ Who am I (from DB) - user chip
// ✅ Who am I (from DB) - user chip
app.get("/api/auth/me", authRequired, async (req, res, next) => {
  const conn = await require("./db").getConnection();
  try {
    const userId = req.user?.userId ?? req.user?.id;

    const [rows] = await conn.execute(
      `SELECT 
         id, 
         username, 
         role, 
         home_page AS homePage
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }

    // 👇 this is what frontend will get
    res.json({ ok: true, user: rows[0] });
  } catch (e) {
    next(e);
  } finally {
    conn.release();
  }
});

// ✅ open any frontend page
app.get("/:file", (req, res, next) => {
  const filePath = path.join(FRONTEND_DIR, req.params.file);
  res.sendFile(filePath, (err) => {
    if (err) next();
  });
});

// Error handler
app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({ ok: false, error: err.message || "Server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () =>
  console.log(`API+Frontend running on http://localhost:${PORT}`)
);
