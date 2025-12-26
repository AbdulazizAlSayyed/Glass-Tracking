/* ================================
   js/auth.js (UPDATED / SINGLE SOURCE)
   - Works for: index.html login + all protected pages (activation, plan-intake, etc.)
   - Fixes the big issue: DON'T force-redirect by homePage (so plan-intake.html won’t bounce back)
   - Still supports optional role/page restrictions if you want later
================================ */

// =============================
// 1) Helpers
// =============================
function getBasePath() {
  const pathParts = window.location.pathname.split("/");
  const fileName = window.location.pathname.split("/").pop();
  if (fileName && fileName.includes(".html")) pathParts.pop();
  const base = pathParts.filter(Boolean).join("/");
  return base ? "/" + base + "/" : "/";
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
  const token = getToken();
  const user = getCurrentUser();
  return !!(token && user);
}

// Optional (future): role/page restrictions
// If you don't want restrictions, keep this as empty object.
const ROLE_ALLOWED_PAGES = {
  // مثال (عدّلها إذا بدك):
  // admin: ["dashboard.html", "orders.html", "activation.html", "plan-intake.html", "live-tracking.html"],
  // intake: ["activation.html", "plan-intake.html"],
  // station: ["station.html"]
};

// Extra allowed pages by "flow" (important for activation -> plan-intake)
const HOME_FLOW_ALLOW = {
  "activation.html": ["plan-intake.html"],
  // add more flows if needed
  // "orders.html": ["order-details.html"]
};

function isPageAllowedForUser(user, currentPage) {
  if (!user) return false;

  const page = (currentPage || "").toLowerCase();
  const role = String(user.role || "").toLowerCase();
  const home = String(user.homePage || "").toLowerCase();

  // If role rules exist → enforce them
  const roleList = ROLE_ALLOWED_PAGES[role];
  if (Array.isArray(roleList) && roleList.length) {
    // also allow homePage + flow pages automatically
    const flowExtra = HOME_FLOW_ALLOW[home] || [];
    const allowed = new Set(
      [...roleList, home, ...flowExtra]
        .filter(Boolean)
        .map((x) => String(x).toLowerCase())
    );
    return allowed.has(page);
  }

  // No role rules → allow all pages when authenticated
  // (This is what prevents plan-intake redirect problems.)
  return true;
}

// =============================
// 2) Handle logout param EARLY
// =============================
(function () {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("logout") === "1") {
      clearAuth();

      // Stay on login page if already there
      if (!isLoginPage()) {
        const basePath = getBasePath();
        window.location.replace(basePath + "index.html?logout=1");
      }
    }
  } catch (e) {
    console.warn("logout param handler error:", e);
  }
})();

// =============================
// 3) Auto-redirect if already logged in (only on login page)
// =============================
(function () {
  try {
    if (!isLoginPage()) return;

    const token = getToken();
    const user = getCurrentUser();

    // IMPORTANT: if logout=1, do not redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get("logout") === "1") return;

    if (token && user) {
      const basePath = getBasePath();
      const home = user.homePage || "dashboard.html";
      window.location.replace(basePath + home);
    }
  } catch (e) {
    console.warn("Auth redirect error:", e);
  }
})();

// =============================
// 4) Protect non-login pages automatically
// =============================
function protectPage() {
  if (isLoginPage()) return true;

  if (!isAuthenticated()) {
    clearAuth();
    const basePath = getBasePath();
    window.location.replace(basePath + "index.html?logout=1");
    return false;
  }

  const user = getCurrentUser();
  const currentPage = (
    window.location.pathname.split("/").pop() || ""
  ).toLowerCase();

  if (!isPageAllowedForUser(user, currentPage)) {
    const basePath = getBasePath();
    const home = user?.homePage || "dashboard.html";
    window.location.replace(basePath + home);
    return false;
  }

  return true;
}

// =============================
// 5) Login handler
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
    const basePath = getBasePath();
    const apiUrl = new URL(
      basePath + "api/auth/login",
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

    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));

    const home = data.user?.homePage || "dashboard.html";
    window.location.replace(basePath + home);
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
// 6) Logout helper
// =============================
function doLogout() {
  clearAuth();
  const basePath = getBasePath();
  window.location.replace(basePath + "index.html?logout=1");
}

// =============================
// 7) DOM Ready init
// =============================
function initAuth() {
  // Protect page (except login page)
  if (!protectPage()) return;

  const user = getCurrentUser();

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
// Export to window
// =============================
window.isAuthenticated = isAuthenticated;
window.getCurrentUser = getCurrentUser;
window.getAuthHeaders = getAuthHeaders;
window.doLogout = doLogout;
window.protectPage = protectPage;
