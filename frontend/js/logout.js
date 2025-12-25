/**
 * معالج تسجيل الخروج
 * يجب إضافته في الصفحات التي تحتوي على زر logout
 */

document.addEventListener("DOMContentLoaded", function () {
  const logoutBtn = document.getElementById("logoutBtn");

  if (!logoutBtn) return;

  logoutBtn.addEventListener("click", async function (e) {
    e.preventDefault();

    // تأكيد من المستخدم
    const isConfirmed = confirm("Are you sure you want to logout?");
    if (!isConfirmed) return;

    // إضافة مؤقت للزر لمنع النقر المتكرر
    logoutBtn.disabled = true;
    logoutBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm" role="status"></span> Logging out...';

    try {
      // يمكنك إضافة استدعاء API لإلغاء التوكن إذا أردت
      // await fetch('/api/auth/logout', { method: 'POST' });

      // مسح البيانات المحلية
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      sessionStorage.clear();

      // توجيه لصفحة تسجيل الدخول مع رسالة
      window.location.replace(
        "/index.html?logout=1&msg=" +
          encodeURIComponent("You have been logged out successfully")
      );
    } catch (error) {
      console.error("Logout error:", error);
      logoutBtn.disabled = false;
      logoutBtn.textContent = "Logout";
      alert("Error during logout. Please try again.");
    }
  });

  // إضافة زر Logout ديناميكياً إذا لم يكن موجوداً
  function addLogoutButtonIfMissing() {
    if (document.querySelector(".logout-container")) return;

    const header = document.querySelector("header, .navbar, .main-header");
    if (header && !document.getElementById("logoutBtn")) {
      const logoutContainer = document.createElement("div");
      logoutContainer.className = "logout-container";
      logoutContainer.innerHTML = `
                <button id="logoutBtn" class="btn btn-outline-danger btn-sm">
                    <i class="fas fa-sign-out-alt"></i> Logout
                </button>
            `;
      header.appendChild(logoutContainer);

      // إعادة إرفاق الحدث للزر الجديد
      document
        .getElementById("logoutBtn")
        .addEventListener("click", arguments.callee);
    }
  }

  // تشغيل بعد 2 ثانية للتأكد من تحميل الصفحة
  setTimeout(addLogoutButtonIfMissing, 2000);
});
