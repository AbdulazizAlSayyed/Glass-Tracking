/**
 * إعادة توجيه ذكية حسب دور المستخدم
 * يمكن استخدامه في أي صفحة
 */

class SmartRedirect {
  constructor() {
    this.user = JSON.parse(localStorage.getItem("user") || "null");
    this.currentPage = window.location.pathname.split("/").pop();
  }

  // التوجيه للصفحة المناسبة حسب الدور
  redirectBasedOnRole() {
    if (!this.user) return "/index.html";

    const rolePages = {
      admin: "dashboard.html",
      operator: "activation.html",
      viewer: "dashboard.html",
    };

    return rolePages[this.user.role] || "dashboard.html";
  }

  // التحقق إذا كان المستخدم في الصفحة الصحيحة
  isOnCorrectPage() {
    if (!this.user) return false;

    const allowedPages = {
      admin: [
        "dashboard.html",
        "activation.html",
        "import.html",
        "users.html",
        "reports.html",
      ],
      operator: ["dashboard.html", "activation.html", "tracking.html"],
      viewer: ["dashboard.html", "view.html"],
    };

    const pages = allowedPages[this.user.role] || ["dashboard.html"];
    return pages.includes(this.currentPage);
  }

  // إذا لم يكن في الصفحة الصحيحة، قم بتوجيهه
  enforcePageAccess() {
    if (!this.isOnCorrectPage() && this.user) {
      const correctPage = this.redirectBasedOnRole();
      if (this.currentPage !== "index.html") {
        console.warn(
          `User ${this.user.username} redirected from ${this.currentPage} to ${correctPage}`
        );
        window.location.href = "/" + correctPage;
      }
    }
  }
}

// استخدام مباشر إذا تم تحميل الملف
if (typeof window !== "undefined") {
  const redirector = new SmartRedirect();
  redirector.enforcePageAccess();
}
