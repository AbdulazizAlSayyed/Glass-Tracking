/* ================================
   js/auth.js (FINAL / SINGLE SOURCE)
   - Handles: login, logout, auth guard, redirects
   - No conflicts with login.js / logout.js / redirection.js
================================ */

// =============================
// 1) Helpers
// =============================
function getBasePath() {
  // Examples:
  // /index.html              -> /
  // /frontend/index.html     -> /frontend/
  const parts = window.location.pathname.split("/").filter(Boolean);

  // If last part looks like a file, remove it
  const last = parts[parts.length - 1] || "";
  if (last.endsWith(".html")) parts.pop();

  return "/" + (parts.length ? parts.join("/") + "/" : "");
}

function getToken() {
  return localStorage.getItem("token");
}

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

function clearAuth() {
  try {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("role");
    localStorage.removeItem("station_id");
    sessionStorage.clear();
  } catch (e) {
    console.warn("clearAuth error:", e);
  }
}

function isLoginPage() {
  const p = window.location.pathname.toLowerCase();
  const file = p.split("/").pop() || "";
  return p === "/" || file === "" || file === "index.html";
}

function getAuthHeaders(extra = {}) {
  const token = getToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

function isAuthenticated() {
  return !!(getToken() && getCurrentUser());
}

// =============================
// 2) Optional: Role / Page rules
//    (اتركها فاضية حالياً لتفادي أي Redirects غلط)
// =============================
const ROLE_ALLOWED_PAGES = {
  // مثال إذا بدك لاحقاً:
  // admin: ["dashboard.html", "orders.html", "activation.html", "live-tracking.html"],
  // intake: ["activation.html", "plan-intake.html"],
  // station: ["station.html"]
};

// صفحات إضافية مسموحة حسب الـ flow (مثلاً activation → plan-intake)
const HOME_FLOW_ALLOW = {
  "activation.html": ["plan-intake.html"],
};

function isPageAllowedForUser(user, currentPage) {
  if (!user) return false;

  const page = (currentPage || "").toLowerCase();
  const role = String(user.role || "").toLowerCase();
  const home = String(user.homePage || "").toLowerCase();

  const roleList = ROLE_ALLOWED_PAGES[role];
  if (Array.isArray(roleList) && roleList.length) {
    const flowExtra = HOME_FLOW_ALLOW[home] || [];
    const allowed = new Set(
      [...roleList, home, ...flowExtra]
        .filter(Boolean)
        .map((x) => String(x).toLowerCase())
    );
    return allowed.has(page);
  }

  // إذا ما في قواعد → اسمح بكل الصفحات طالما المستخدم مسجّل دخول
  return true;
}

// =============================
// 3) Handle logout param EARLY
// =============================
(function () {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("logout") === "1") {
      clearAuth();

      // إذا مش بصفحة اللوجين، رجّع عليها
      if (!isLoginPage()) {
        window.location.replace(getBasePath() + "index.html?logout=1");
      }
    }
  } catch (e) {
    console.warn("logout param handler error:", e);
  }
})();

// =============================
// 4) Auto-redirect if already logged in (ONLY on login page)
// =============================
(function () {
  try {
    if (!isLoginPage()) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("logout") === "1") return; // لا تعيد التوجيه بعد logout

    const token = getToken();
    const user = getCurrentUser();

    if (token && user) {
      const home = user.homePage || "dashboard.html";
      window.location.replace(getBasePath() + home);
    }
  } catch (e) {
    console.warn("Auth redirect error:", e);
  }
})();

// =============================
// 5) Protect non-login pages automatically
// =============================
function protectPage() {
  if (isLoginPage()) return true;

  if (!isAuthenticated()) {
    clearAuth();
    window.location.replace(getBasePath() + "index.html?logout=1");
    return false;
  }

  const user = getCurrentUser();
  const currentPage = (
    window.location.pathname.split("/").pop() || ""
  ).toLowerCase();

  if (!isPageAllowedForUser(user, currentPage)) {
    const home = user?.homePage || "dashboard.html";
    window.location.replace(getBasePath() + home);
    return false;
  }

  return true;
}

// =============================
// 6) Login handler (index.html)
// =============================
async function handleLoginSubmit(event) {
  event.preventDefault();

  const usernameEl = document.getElementById("username");
  const passwordEl = document.getElementById("password");
  const errorEl = document.getElementById("loginError");
  const loginBtn = document.getElementById("loginBtn");

  const username = (usernameEl?.value || "").trim();
  const password = (passwordEl?.value || "").trim();

  if (errorEl) {
    errorEl.style.color = "#dc2626";
    errorEl.textContent = "";
  }

  if (!username || !password) {
    if (errorEl) errorEl.textContent = "Please enter username and password.";
    return;
  }

  const originalBtnText = loginBtn?.textContent || "Login";
  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.textContent = "Logging in...";
  }

  try {
    const apiUrl = new URL(
      getBasePath() + "api/auth/login",
      window.location.origin
    ).toString();

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

    // Save auth
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));

    // Redirect to home page
    const home = data.user?.homePage || "dashboard.html";
    window.location.replace(getBasePath() + home);
  } catch (e) {
    console.error("Login error:", e);
    if (errorEl) {
      errorEl.style.color = "#dc2626";
      errorEl.textContent = "Network error. Please check your connection.";
    }
  } finally {
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.textContent = originalBtnText;
    }
  }
}

// =============================
// 7) Logout helper
// =============================
function doLogout() {
  clearAuth();
  window.location.replace(getBasePath() + "index.html?logout=1");
}

// =============================
// 8) DOM Ready init
// =============================
function initAuth() {
  // Protect page (except login page)
  if (!protectPage()) return;

  // Show logout success message on login page
  if (isLoginPage()) {
    const params = new URLSearchParams(window.location.search);
    if (params.get("logout") === "1") {
      const errorEl = document.getElementById("loginError");
      if (errorEl) {
        errorEl.style.color = "#16a34a";
        errorEl.textContent = "Logged out successfully.";
      }
    }
  }

  // Hook login form if exists
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", handleLoginSubmit);
  }

  // Hook logout button if exists
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      doLogout();
    });
  }

  // Fill user chip if exists
  const user = getCurrentUser();
  const userChip = document.getElementById("userChip");
  if (userChip && user) {
    userChip.textContent = `User: ${user.username || user.name || "—"}`;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAuth);
} else {
  initAuth();
}

// =============================
// 9) Export to window (for other scripts)
// =============================
window.isAuthenticated = isAuthenticated;
window.getCurrentUser = getCurrentUser;
window.getAuthHeaders = getAuthHeaders;
window.doLogout = doLogout;
window.protectPage = protectPage;
