const router = require("express").Router();
const pool = require("../db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    console.log("=== LOGIN REQUEST ===");
    console.log("Request body:", JSON.stringify(req.body));

    const { username, password } = req.body;

    // التحقق من المدخلات
    if (!username || !password) {
      console.log("Missing credentials");
      return res.status(400).json({
        ok: false,
        error: "اسم المستخدم وكلمة المرور مطلوبان",
      });
    }

    const cleanUsername = username.trim();
    console.log("Searching for user:", cleanUsername);

    // استعلام قاعدة البيانات
    let queryResult;
    try {
      queryResult = await pool.execute(
        `SELECT 
          id, 
          username, 
          password_hash, 
          role, 
          is_active, 
          home_page, 
          station_id 
        FROM users 
        WHERE username = ? 
        LIMIT 1`,
        [cleanUsername]
      );
    } catch (dbError) {
      console.error("Database query error:", dbError);
      return res.status(500).json({
        ok: false,
        error: "خطأ في الاتصال بقاعدة البيانات",
        details:
          process.env.NODE_ENV === "development" ? dbError.message : undefined,
      });
    }

    const [rows] = queryResult;
    console.log("Database rows found:", rows.length);

    if (rows.length === 0) {
      console.log("User not found:", cleanUsername);
      return res.status(401).json({
        ok: false,
        error: "اسم المستخدم أو كلمة المرور غير صحيحة",
      });
    }

    const user = rows[0];
    console.log(
      "User found - ID:",
      user.id,
      "Role:",
      user.role,
      "Active:",
      user.is_active
    );

    // التحقق من حالة المستخدم
    if (user.is_active !== 1) {
      console.log("User is inactive:", user.username);
      return res.status(403).json({
        ok: false,
        error: "الحساب معطل. يرجى التواصل مع المسؤول.",
      });
    }

    // التحقق من كلمة المرور
    console.log("Comparing password...");
    let passwordMatch = false;
    try {
      passwordMatch = await bcrypt.compare(password, user.password_hash);
    } catch (bcryptError) {
      console.error("Bcrypt error:", bcryptError);
      return res.status(500).json({
        ok: false,
        error: "خطأ في التحقق من كلمة المرور",
      });
    }

    if (!passwordMatch) {
      console.log("Password incorrect for user:", user.username);
      return res.status(401).json({
        ok: false,
        error: "اسم المستخدم أو كلمة المرور غير صحيحة",
      });
    }

    console.log("Password matched successfully");

    // إنشاء التوكن
    const tokenPayload = {
      userId: user.id,
      username: user.username,
      role: user.role,
      stationId: user.station_id,
      homePage: user.home_page,
    };

    console.log("Token payload:", tokenPayload);

    const secret = process.env.JWT_SECRET || "dev-secret-change-this";
    const token = jwt.sign(tokenPayload, secret, {
      expiresIn: "7d",
    });

    console.log("Token generated successfully");

    // إرسال الرد
    const response = {
      ok: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        homePage: user.home_page,
        stationId: user.station_id,
      },
    };

    console.log("Sending success response");
    res.json(response);
  } catch (error) {
    console.error("❌ UNEXPECTED LOGIN ERROR:", error);
    console.error("Error stack:", error.stack);

    res.status(500).json({
      ok: false,
      error: "خطأ داخلي في الخادم",
      message:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// GET /api/auth/me - للحصول على معلومات المستخدم الحالي
router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        ok: false,
        error: "التوكن مطلوب",
      });
    }

    const token = authHeader.split(" ")[1];
    const secret = process.env.JWT_SECRET || "dev-secret-change-this";

    try {
      const decoded = jwt.verify(token, secret);

      // جلب معلومات محدثة من قاعدة البيانات
      const [rows] = await pool.execute(
        `SELECT id, username, role, is_active, home_page, station_id 
         FROM users 
         WHERE id = ?`,
        [decoded.userId]
      );

      if (rows.length === 0) {
        return res.status(404).json({
          ok: false,
          error: "المستخدم غير موجود",
        });
      }

      const user = rows[0];

      res.json({
        ok: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          homePage: user.home_page,
          stationId: user.station_id,
          isActive: user.is_active,
        },
      });
    } catch (jwtError) {
      return res.status(401).json({
        ok: false,
        error: "توكن غير صالح أو منتهي الصلاحية",
      });
    }
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({
      ok: false,
      error: "خطأ في الخادم",
    });
  }
});

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  res.json({
    ok: true,
    message: "تم تسجيل الخروج بنجاح",
  });
});

module.exports = router;
