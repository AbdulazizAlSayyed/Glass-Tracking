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

  function setStatus(msg, type = "info") {
    if (!els.plannerStatus) return;
    els.plannerStatus.textContent = msg;
    els.plannerStatus.className = `station-status-message ${type}`;
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

  async function loadMe() {
    try {
      const res = await fetch("/api/auth/me", { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) return;
      const u = data.user || {};
      els.userChip.textContent = `User: ${u.username || u.name || "—"}`;
    } catch (e) {
      console.error("loadMe failed:", e);
    }
  }

  async function loadKpis() {
    try {
      const res = await fetch("/api/intake/kpis", { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) return;

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
      els.ordersBody.innerHTML = `
        <tr>
          <td colspan="9" style="padding:12px; color:#6b7280;">Loading…</td>
        </tr>`;

      const status = els.statusFilter.value || "all";
      const q = (els.searchInput.value || "").trim();
      const draftOnly = els.draftOnlyToggle.checked ? "1" : "0";

      const params = new URLSearchParams();
      if (status && status !== "all") params.set("status", status);
      if (q) params.set("q", q);
      if (draftOnly === "1") params.set("draftOnly", "1");

      const url =
        "/api/intake/orders" +
        (params.toString() ? "?" + params.toString() : "");

      const res = await fetch(url, { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        els.ordersBody.innerHTML = `
          <tr>
            <td colspan="9" style="color:#dc2626; padding:12px;">
              Failed to load orders: ${esc(data.error || res.status)}
            </td>
          </tr>`;
        setStatus("Failed to load orders.", "error");
        return;
      }

      const orders = data.orders || [];
      if (!orders.length) {
        els.ordersBody.innerHTML = `
          <tr>
            <td colspan="9" style="color:#6b7280; padding:12px;">
              No orders match your filters.
            </td>
          </tr>`;
        setStatus("No orders in this view.", "info");
        return;
      }

      els.ordersBody.innerHTML = "";
      orders.forEach((o) => {
        const created = o.created_at
          ? new Date(o.created_at).toISOString().slice(0, 10)
          : "—";
        const delivery = o.delivery_date
          ? new Date(o.delivery_date).toISOString().slice(0, 10)
          : "—";

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${esc(o.order_no)}</td>
          <td>${esc(o.client)}</td>
          <td>${esc(o.prf || "—")}</td>
          <td>${esc(created)}</td>
          <td>${esc(delivery)}</td>
          <td>${Number(o.total_lines || 0)}</td>
          <td>${Number(o.activated_lines || 0)}</td>
          <td>${statusPill(o.status)}</td>
          <td>
            <button class="btn btn-primary btn-small"
                    data-plan-order="${o.id}" type="button">
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
        <tr>
          <td colspan="9" style="color:#dc2626; padding:12px;">
            Exception while loading orders: ${esc(e.message || e)}
          </td>
        </tr>`;
      setStatus("Exception while loading orders.", "error");
    }
  }

  function handleOrderClick(e) {
    const btn = e.target.closest("[data-plan-order]");
    if (!btn) return;

    const orderId = Number(btn.dataset.planOrder || 0);
    if (!orderId) return;

    // نحفظ meta بـ sessionStorage لصفحة plan-intake.html
    const tr = btn.closest("tr");
    if (!tr) return;
    const cells = tr.querySelectorAll("td");

    const meta = {
      id: orderId,
      order_no: cells[0]?.textContent?.trim() || "",
      client: cells[1]?.textContent?.trim() || "",
      prf: cells[2]?.textContent?.trim() || "",
      delivery_date: cells[4]?.textContent?.trim() || "",
    };

    sessionStorage.setItem("intakeCurrentOrder", JSON.stringify(meta));

    window.location.href = `plan-intake.html?orderId=${orderId}`;
  }

  function init() {
    if (!user || !token) {
      window.location.replace("/index.html?logout=1");
      return;
    }

    loadMe();
    loadKpis();
    loadOrders();

    els.statusFilter?.addEventListener("change", loadOrders);
    els.searchInput?.addEventListener("input", () => {
      // small debounce ممكن بعدين
      loadOrders();
    });
    els.draftOnlyToggle?.addEventListener("change", loadOrders);
    els.refreshBtn?.addEventListener("click", loadOrders);
    els.ordersBody?.addEventListener("click", handleOrderClick);

    setStatus("Waiting for action…", "info");
  }

  init();
})();
