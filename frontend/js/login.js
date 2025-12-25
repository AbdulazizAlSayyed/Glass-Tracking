/**
 * معالج تسجيل الدخول
 * فقط لصفحة index.html
 */

(function () {
  // إذا لم نكن في صفحة index، نخرج
  if (!window.location.pathname.includes("index.html")) return;

  // التحقق من وجود بيانات مصادقة مسبقة
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "null");

  if (token && user) {
    // إذا كان مسجلاً دخوله بالفعل، نوجهه لصفحته الرئيسية
    const homePage = user.homePage || "dashboard.html";
    window.location.replace("/" + homePage);
    return;
  }

  // معالجة رسائل URL
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has("logout")) {
    const msg = urlParams.get("msg") || "You have been logged out successfully";
    showToast(msg, "success");
  }
  if (urlParams.has("expired")) {
    showToast("Your session has expired. Please login again.", "warning");
  }

  // إعداد النموذج
  document.addEventListener("DOMContentLoaded", function () {
    const loginForm = document.getElementById("loginForm");
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    const loginError = document.getElementById("loginError");
    const loginBtn = loginForm?.querySelector('button[type="submit"]');

    if (!loginForm) return;

    // التركيز على حقل اسم المستخدم
    if (usernameInput) {
      setTimeout(() => usernameInput.focus(), 100);
    }

    // إضافة دعم Enter للتنقل بين الحقول
    usernameInput?.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        passwordInput.focus();
      }
    });

    passwordInput?.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        doLogin();
      }
    });

    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      doLogin();
    });

    async function doLogin() {
      const username = usernameInput.value.trim();
      const password = passwordInput.value.trim();

      // التحقق من الإدخال
      if (!username || !password) {
        showError("Please enter both username and password.");
        usernameInput.focus();
        return;
      }

      // تعطيل الزر وإظهار المؤشر
      if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.innerHTML =
          '<span class="spinner-border spinner-border-sm"></span> Signing in...';
      }

      // إخفاء الأخطاء القديمة
      if (loginError) loginError.textContent = "";

      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ username, password }),
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
          showError(data.error || "Login failed. Please try again.");

          // إظهار رسالة تفصيلية في console
          console.error("Login failed:", {
            status: response.status,
            error: data.error,
          });

          // اهتزاز النموذج (تأثير مرئي)
          loginForm.classList.add("shake");
          setTimeout(() => loginForm.classList.remove("shake"), 500);
          return;
        }

        // ✅ حفظ البيانات
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));

        // ✅ عرض رسالة نجاح
        showToast("Login successful! Redirecting...", "success");

        // ✅ التوجيه للصفحة الرئيسية بعد تأخير بسيط
        const homePage = data.user.homePage || "dashboard.html";
        setTimeout(() => {
          window.location.href = "/" + homePage;
        }, 800);
      } catch (error) {
        console.error("Network error:", error);
        showError("Network error. Please check your connection.");
      } finally {
        // إعادة تفعيل الزر
        if (loginBtn) {
          loginBtn.disabled = false;
          loginBtn.textContent = "Login";
        }
      }
    }

    function showError(message) {
      if (loginError) {
        loginError.textContent = message;
        loginError.style.opacity = "1";
      }
    }

    function showToast(message, type = "info") {
      // إنشاء toast ديناميكي
      const toast = document.createElement("div");
      toast.className = `login-toast login-toast-${type}`;
      toast.textContent = message;
      toast.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 20px;
                border-radius: 4px;
                color: white;
                background: ${
                  type === "success"
                    ? "#10b981"
                    : type === "warning"
                    ? "#f59e0b"
                    : "#3b82f6"
                };
                z-index: 9999;
                animation: slideIn 0.3s ease;
            `;

      document.body.appendChild(toast);

      setTimeout(() => {
        toast.style.animation = "slideOut 0.3s ease";
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }
  });
})();

// إضافة أنيميشن للـ CSS
const style = document.createElement("style");
style.textContent = `
    .shake {
        animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
    }
    @keyframes shake {
        10%, 90% { transform: translateX(-1px); }
        20%, 80% { transform: translateX(2px); }
        30%, 50%, 70% { transform: translateX(-2px); }
        40%, 60% { transform: translateX(2px); }
    }
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);
