// frontend/js/intake.js
(() => {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "null");

  const els = {
    userChip: document.getElementById("userChip"),
    logoutBtn: document.getElementById("logoutBtn"),

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

  const state = { orders: [] };

  const esc = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const setStatus = (msg, type = "info") => {
    if (!els.plannerStatus) return;
    els.plannerStatus.textContent = msg;
    els.plannerStatus.className = `station-status-message ${type}`;
  };

  function apiHeaders(extra = {}) {
    return {
      Authorization: `Bearer ${token}`,
      ...extra,
    };
  }

  async function apiGet(url) {
    const res = await fetch(url, { headers: apiHeaders(), cache: "no-store" });
    const data = await res.json().catch(() => ({}));

    // لو 401 رجع للّوجن
    if (res.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.replace("/index.html?logout=1");
      return null;
    }

    if (!res.ok || !data.ok)
      throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  const formatDate = (d) => {
    if (!d) return "—";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "—";
    return dt.toISOString().slice(0, 10);
  };

  const statusPill = (status) => {
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
  };

  const debounce = (fn, ms = 250) => {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  function fillHeader() {
    if (els.userChip)
      els.userChip.textContent = `User: ${user?.username || "—"}`;
  }

  async function loadKpis() {
    try {
      const data = await apiGet("/api/intake/kpis");
      if (!data) return;

      const k = data.kpis || {};
      els.kpiDraft.textContent = Number(k.draft || 0);
      els.kpiActive.textContent = Number(k.active || 0);
      els.kpiPaused.textContent = Number(k.paused || 0);
      els.kpiPieces.textContent = Number(k.piecesToday || 0);
    } catch (e) {
      console.error("loadKpis failed:", e);
    }
  }

  async function loadOrders() {
    try {
      setStatus("Loading intake queue…", "info");

      if (els.ordersBody) {
        els.ordersBody.innerHTML = `<tr><td colspan="9" style="padding:12px; color:#6b7280;">Loading…</td></tr>`;
      }

      const status = els.statusFilter?.value || "all";
      const q = (els.searchInput?.value || "").trim();
      const draftOnly = els.draftOnlyToggle?.checked ? "1" : "0";

      const params = new URLSearchParams();
      if (status && status !== "all") params.set("status", status);
      if (q) params.set("q", q);
      if (draftOnly === "1") params.set("draftOnly", "1");

      const url =
        "/api/intake/orders" + (params.toString() ? `?${params}` : "");
      const data = await apiGet(url);
      if (!data) return;

      state.orders = data.orders || [];

      if (!state.orders.length) {
        els.ordersBody.innerHTML = `<tr><td colspan="9" style="color:#6b7280; padding:12px;">No orders match your filters.</td></tr>`;
        setStatus("No orders in this view.", "info");
        return;
      }

      els.ordersBody.innerHTML = "";
      state.orders.forEach((o) => {
        const importDate = o.import_date ?? o.created_at ?? null;

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${esc(o.order_no)}</td>
          <td>${esc(o.client || "—")}</td>
          <td>${esc(o.prf || "—")}</td>
          <td>${esc(formatDate(importDate))}</td>
          <td>${esc(formatDate(o.delivery_date))}</td>
          <td>${Number(o.total_lines || 0)}</td>
          <td>${Number(o.activated_lines || 0)}</td>
          <td>${statusPill(o.status)}</td>
          <td>
            <button class="btn btn-primary btn-small" data-plan-order="${
              o.id
            }" type="button">
              Open Intake
            </button>
          </td>
        `;
        els.ordersBody.appendChild(tr);
      });

      setStatus("Ready – open an order to plan intake.", "success");
    } catch (e) {
      console.error("loadOrders failed:", e);
      els.ordersBody.innerHTML = `
        <tr><td colspan="9" style="color:#dc2626; padding:12px;">
          Failed to load orders: ${esc(e.message || e)}
        </td></tr>
      `;
      setStatus("Failed to load orders.", "error");
    }
  }

  function handleOrderClick(e) {
    const btn = e.target.closest("[data-plan-order]");
    if (!btn) return;

    const orderId = Number(btn.dataset.planOrder || 0);
    const order = (state.orders || []).find((x) => Number(x.id) === orderId);
    if (!order) return;

    sessionStorage.setItem("intakeCurrentOrder", JSON.stringify(order));

    // ✅ انت عندك intake-order
    window.location.href = `intake-order.html?orderId=${orderId}`;
  }

  function init() {
    if (!user || !token) {
      window.location.replace("/index.html?logout=1");
      return;
    }

    fillHeader();

    els.logoutBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.replace("/index.html?logout=1");
    });

    loadKpis();
    loadOrders();

    els.statusFilter?.addEventListener("change", loadOrders);
    els.draftOnlyToggle?.addEventListener("change", loadOrders);
    els.refreshBtn?.addEventListener("click", () => {
      loadKpis();
      loadOrders();
    });

    els.ordersBody?.addEventListener("click", handleOrderClick);

    const debounced = debounce(loadOrders, 250);
    els.searchInput?.addEventListener("input", debounced);

    setStatus("Waiting for action…", "info");
  }

  init();
})();
