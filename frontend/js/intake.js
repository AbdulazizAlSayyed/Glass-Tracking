(() => {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "null");

  const els = {
    userChip: document.getElementById("userChip"),
    plannerStatus: document.getElementById("plannerStatus"),

    kpiDraft: document.getElementById("kpiDraft"),
    kpiActive: document.getElementById("kpiActive"),
    kpiPaused: document.getElementById("kpiPaused"),
    kpiPieces: document.getElementById("kpiPieces"),

    statusFilter: document.getElementById("statusFilter"),
    searchInput: document.getElementById("searchInput"),
    draftOnlyToggle: document.getElementById("draftOnlyToggle"),
    refreshBtn: document.getElementById("refreshBtn"),

    ordersBody: document.getElementById("ordersBody"),
  };

  function authHeaders() {
    return { Authorization: `Bearer ${token}` };
  }

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDate(d) {
    if (!d) return "—";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "—";
    return dt.toISOString().slice(0, 10);
  }

  function formatDateTime(d) {
    if (!d) return "—";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "—";
    return dt.toISOString().slice(0, 16).replace("T", " ");
  }

  function statusPill(status) {
    const s = String(status || "").toLowerCase();
    if (s === "draft")
      return `<span class="status-pill status-not-started">Draft</span>`;
    if (s === "active")
      return `<span class="status-pill status-in-progress">Active</span>`;
    if (s === "paused")
      return `<span class="status-pill status-delayed">Paused</span>`;
    if (s === "completed")
      return `<span class="status-pill status-completed">Completed</span>`;
    return `<span class="status-pill status-not-started">${esc(
      status || "—"
    )}</span>`;
  }

  function setPlannerStatus(msg, type = "info") {
    if (!els.plannerStatus) return;
    const colors = {
      info: "#6b7280",
      success: "#16a34a",
      error: "#dc2626",
    };
    els.plannerStatus.style.color = colors[type] || colors.info;
    els.plannerStatus.textContent = msg;
  }

  async function loadKpis() {
    try {
      const res = await fetch("/api/intake/kpis", {
        headers: authHeaders(),
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) return;

      const k = data.kpis || {};
      els.kpiDraft.textContent = Number(k.draft || 0);
      els.kpiActive.textContent = Number(k.active || 0);
      els.kpiPaused.textContent = Number(k.paused || 0);
      els.kpiPieces.textContent = Number(k.piecesToday || 0);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadOrders() {
    try {
      setPlannerStatus("Loading orders…", "info");

      const status = els.statusFilter.value || "all";
      const q = (els.searchInput.value || "").trim();
      const draftOnly = els.draftOnlyToggle.checked ? "1" : "0";

      const params = new URLSearchParams({
        status,
        q,
        draftOnly,
        page: "1",
        limit: "50",
      });

      const res = await fetch(`/api/intake/orders?${params.toString()}`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));

      els.ordersBody.innerHTML = "";

      if (!res.ok || !data.ok) {
        els.ordersBody.innerHTML = `
          <tr>
            <td colspan="9" style="color:#dc2626; padding:12px;">
              Failed to load orders: ${esc(data.error || res.status)}
            </td>
          </tr>`;
        setPlannerStatus("Failed to load orders.", "error");
        return;
      }

      const orders = data.orders || [];
      if (!orders.length) {
        els.ordersBody.innerHTML = `
          <tr>
            <td colspan="9" style="color:#6b7280; padding:12px;">
              No orders found for this filter.
            </td>
          </tr>`;
        setPlannerStatus("No orders for current filters.", "info");
        return;
      }

      orders.forEach((o) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${esc(o.order_no)}</td>
          <td>${esc(o.client)}</td>
          <td>${esc(o.prf || "—")}</td>
          <td>${formatDateTime(o.created_at)}</td>
          <td>${formatDate(o.delivery_date)}</td>
          <td>${Number(o.total_lines || 0)}</td>
          <td>${Number(o.activated_lines || 0)}</td>
          <td>${statusPill(o.status)}</td>
          <td>
            <button class="btn btn-primary btn-sm" data-order-id="${
              o.id
            }">Open</button>
          </td>
        `;
        els.ordersBody.appendChild(tr);
      });

      // زر Open → افتح صفحة جديدة
      els.ordersBody
        .querySelectorAll("button[data-order-id]")
        .forEach((btn) => {
          btn.addEventListener("click", () => {
            const orderId = Number(btn.getAttribute("data-order-id"));
            const order = (orders || []).find((x) => x.id === orderId);
            if (!order) return;

            // نحفظ بيانات الـ order في sessionStorage
            sessionStorage.setItem("intakeCurrentOrder", JSON.stringify(order));

            // نروح على صفحة التخطيط الكاملة
            window.location.href = `intake-order.html?orderId=${orderId}`;
          });
        });

      setPlannerStatus("Orders loaded ✅", "success");
    } catch (e) {
      console.error(e);
      els.ordersBody.innerHTML = `
        <tr>
          <td colspan="9" style="color:#dc2626; padding:12px;">
            Exception while loading orders: ${esc(e.message || e)}
          </td>
        </tr>`;
      setPlannerStatus("Exception while loading orders.", "error");
    }
  }

  function init() {
    if (els.userChip && user) {
      els.userChip.textContent = `User: ${user.username || "—"}`;
    }

    els.statusFilter?.addEventListener("change", loadOrders);
    els.draftOnlyToggle?.addEventListener("change", loadOrders);
    els.searchInput?.addEventListener("keyup", (e) => {
      if (e.key === "Enter") loadOrders();
    });
    els.refreshBtn?.addEventListener("click", loadOrders);

    loadKpis();
    loadOrders();
  }

  init();
})();
