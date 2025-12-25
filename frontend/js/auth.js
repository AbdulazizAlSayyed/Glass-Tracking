// =============================
// Auto-redirect if already logged in
// =============================
(function () {
  try {
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user") || "null");

    // بس لو هو على صفحة index / أو /index.html
    const path = window.location.pathname;
    const onLoginPage =
      path === "/" ||
      path.endsWith("/index.html") ||
      path === "/index.html" ||
      path.endsWith("/");

    if (token && user && onLoginPage) {
      // حساب المسار الأساسي للتطبيق
      const basePath = getBasePath();
      const home = user.homePage || "dashboard.html";
      window.location.replace(basePath + home);
    }
  } catch (e) {
    console.warn("Auth redirect error:", e);
  }
})();

// =============================
// Helper: Get base path
// =============================
function getBasePath() {
  // إذا كان التطبيق يعمل على مسار فرعي
  const pathParts = window.location.pathname.split("/");
  // إزالة اسم الملف الحالي
  const fileName = window.location.pathname.split("/").pop();
  if (fileName && fileName.includes(".html")) {
    pathParts.pop();
  }

  const base = pathParts.filter(Boolean).join("/");
  return base ? "/" + base + "/" : "/";
}

// =============================
// DOM Ready handler
// =============================
function initAuth() {
  const loginForm = document.getElementById("loginForm");
  const logoutBtn = document.getElementById("logoutBtn");

  // ----- Login form -----
  if (loginForm) {
    loginForm.addEventListener("submit", handleLoginSubmit);
  }

  // ----- Logout button (header) -----
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      doLogout();
    });
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAuth);
} else {
  initAuth();
}

// =============================
// Login handler
// =============================
async function handleLoginSubmit(event) {
  event.preventDefault();

  const usernameEl = document.getElementById("username");
  const passwordEl = document.getElementById("password");
  const errorEl = document.getElementById("loginError");
  const loginBtn = document.getElementById("loginBtn");

  const username = (usernameEl?.value || "").trim();
  const password = (passwordEl?.value || "").trim();

  // Reset error
  if (errorEl) {
    errorEl.style.color = "#dc2626";
    errorEl.textContent = "";
  }

  // Validation
  if (!username || !password) {
    if (errorEl) errorEl.textContent = "Please enter username and password.";
    return;
  }

  // Disable button and show loading
  const originalBtnText = loginBtn?.textContent || "Login";
  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.textContent = "Logging in...";
  }

  try {
    const basePath = getBasePath();
    const apiUrl = basePath.replace(/\/$/, "") + "/api/auth/login";

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      const errorMsg =
        data.error ||
        (res.status === 401
          ? "Invalid credentials"
          : res.status === 403
          ? "User account is disabled"
          : "Login failed. Please try again.");

      if (errorEl) {
        errorEl.style.color = "#dc2626";
        errorEl.textContent = errorMsg;
      }
      return;
    }

    // ✅ Save token + user (with homePage)
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));

    // Redirect to user homePage or dashboard
    const home = data.user?.homePage || "dashboard.html";
    window.location.href = basePath + home;
  } catch (e) {
    console.error("Login error:", e);
    if (errorEl) {
      errorEl.style.color = "#dc2626";
      errorEl.textContent = "Network error. Please check your connection.";
    }
  } finally {
    // Re-enable button
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.textContent = originalBtnText;
    }
  }
}

// =============================
// Logout helper
// =============================
function doLogout() {
  try {
    // Clear all auth data
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("role");
    localStorage.removeItem("station_id");

    // Clear session storage
    sessionStorage.clear();

    // Clear any cookies
    document.cookie.split(";").forEach((cookie) => {
      const eqPos = cookie.indexOf("=");
      const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
      document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
    });
  } catch (e) {
    console.warn("Logout clean error:", e);
  }

  // Redirect to login page
  const basePath = getBasePath();
  window.location.replace(basePath + "index.html?logout=1");
}

// =============================
// Helper: get auth headers for API calls
// =============================
function getAuthHeaders(extra = {}) {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

// =============================
// Helper: Check if user is authenticated
// =============================
function isAuthenticated() {
  try {
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user") || "null");
    return !!(token && user);
  } catch (e) {
    return false;
  }
}

// =============================
// Helper: Get current user info
// =============================
function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch (e) {
    return null;
  }
}

// =============================
// Helper: Protect route - use in other pages
// =============================
function requireAuth(redirectTo = "index.html") {
  if (!isAuthenticated()) {
    const basePath = getBasePath();
    window.location.href = basePath + redirectTo;
    return false;
  }
  return true;
}
