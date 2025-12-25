document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("logoutBtn");

  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();

      // امسح كل شي له علاقة باللوجين
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("role");
      localStorage.removeItem("station_id");

      // إذا حاطط التوكن بالـ sessionStorage كمان:
      sessionStorage.clear();

      // رجّعو ع صفحة اللوجين

      window.location.replace("/index.html?logout=1");
    });
  }
});
