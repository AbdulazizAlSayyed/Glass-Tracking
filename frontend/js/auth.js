// 1. Helper functions أولاً
// 2. Auto-redirect
// 3. DOM Ready handler
// 4. Login handler
// 5. Logout helper
// 6. Other helpers
// 7. Export to window

// =============================
// Helper: Get base path
// =============================
function getBasePath() {
  const pathParts = window.location.pathname.split("/");
  const fileName = window.location.pathname.split("/").pop();
  if (fileName && fileName.includes(".html")) {
    pathParts.pop();
  }
  const base = pathParts.filter(Boolean).join("/");
  return base ? "/" + base + "/" : "/";
}

// =============================
// Auto-redirect if already logged in
// =============================
(function () {
  try {
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user") || "null");
    const path = window.location.pathname;
    const onLoginPage =
      path === "/" ||
      path.endsWith("/index.html") ||
      path === "/index.html" ||
      path.endsWith("/");

    if (token && user && onLoginPage) {
      const basePath = getBasePath();
      const home = user.homePage || "dashboard.html";
      window.location.replace(basePath + home);
    }
  } catch (e) {
    console.warn("Auth redirect error:", e);
  }
})();

// =============================
// DOM Ready handler
// =============================
function initAuth() {
  const loginForm = document.getElementById("loginForm");
  const logoutBtn = document.getElementById("logoutBtn");

  if (loginForm) {
    loginForm.addEventListener("submit", handleLoginSubmit);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      doLogout();
    });
  }
}

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

    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));

    const home = data.user?.homePage || "dashboard.html";
    window.location.href = basePath + home;
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
// Logout helper
// =============================
function doLogout() {
  try {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("role");
    localStorage.removeItem("station_id");
    sessionStorage.clear();
    document.cookie.split(";").forEach((cookie) => {
      const eqPos = cookie.indexOf("=");
      const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
      document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
    });
  } catch (e) {
    console.warn("Logout clean error:", e);
  }

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
function requireAuth() {
  if (!isAuthenticated()) {
    const basePath = getBasePath();
    window.location.href = basePath + "index.html";
    return false;
  }

  const user = getCurrentUser();
  const currentPage = window.location.pathname.split("/").pop();

  if (user && user.homePage && user.homePage !== currentPage) {
    const basePath = getBasePath();
    window.location.href = basePath + user.homePage;
    return false;
  }

  return true;
}

// =============================
// Export functions to global scope
// =============================
window.isAuthenticated = isAuthenticated;
window.getCurrentUser = getCurrentUser;
window.requireAuth = requireAuth;
window.getAuthHeaders = getAuthHeaders;
