(() => {
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const token = localStorage.getItem("token");

  if (!token) window.location.replace("/index.html?logout=1");

  const els = {
    plannerStatus: document.getElementById("plannerStatus"),

    kpiDraft: document.getElementById("kpiDraft"),
    kpiActive: document.getElementById("kpiActive"),
    kpiPaused: document.getElementById("kpiPaused"),
    kpiPieces: document.getElementById("kpiPieces"),

    statusFilter: document.getElementById("statusFilter"),
    searchInput: document.getElementById("searchInput"),
    draftOnlyToggle: document.getElementById("draftOnlyToggle"),

    ordersBody: document.getElementById("ordersBody"),

    // modal
    reviewModal: document.getElementById("reviewModal"),
    closeModalBtn: document.getElementById("closeModalBtn"),
    cancelBtn: document.getElementById("cancelBtn"),
    activateBtn: document.getElementById("activateBtn"),
    modalOrderId: document.getElementById("modalOrderId"),
    modalMeta: document.getElementById("modalMeta"),
    modalStatus: document.getElementById("modalStatus"),
    modalTotals: document.getElementById("modalTotals"),
    linesBody: document.getElementById("linesBody"),
  };

  let currentOrder = null; // {id, order_no, client, ...}
  let currentLines = []; // lines from API

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
    const map = { info: "#6b7280", success: "#16a34a", error: "#dc2626" };
    els.plannerStatus.className = `station-status-message ${type}`;
    els.plannerStatus.style.color = map[type] || map.info;
    els.plannerStatus.textContent = msg;
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
    if (s === "cancelled")
      return `<span class="status-pill status-delayed">Cancelled</span>`;
    return `<span class="status-pill status-not-started">${esc(
      status || "—"
    )}</span>`;
  }

  function fmtDT(v) {
    if (!v) return "—";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toISOString().slice(0, 16).replace("T", " ");
  }

  function fmtDate(v) {
    if (!v) return "—";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toISOString().slice(0, 10);
  }

  // ---------- API ----------
  async function loadKpis() {
    const res = await fetch("/api/intake/kpis", { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return;

    els.kpiDraft.textContent = Number(data.kpis?.draft || 0);
    els.kpiActive.textContent = Number(data.kpis?.active || 0);
    els.kpiPaused.textContent = Number(data.kpis?.paused || 0);
    els.kpiPieces.textContent = Number(data.kpis?.piecesToday || 0);
  }

  async function loadOrders() {
    const status = els.statusFilter?.value || "all";
    const q = (els.searchInput?.value || "").trim();
    const draftOnly = els.draftOnlyToggle?.checked ? "1" : "0";

    const url = `/api/intake/orders?status=${encodeURIComponent(
      status
    )}&q=${encodeURIComponent(q)}&draftOnly=${draftOnly}&page=1&limit=50`;

    setStatus("Loading orders…", "info");
    const res = await fetch(url, { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      setStatus(data.error || "Failed to load orders.", "error");
      return;
    }

    const rows = data.orders || [];
    els.ordersBody.innerHTML = "";

    if (!rows.length) {
      els.ordersBody.innerHTML = `<tr><td colspan="9" style="padding:12px; color:#6b7280;">No orders found.</td></tr>`;
      setStatus("No orders found.", "info");
      return;
    }

    for (const o of rows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(o.order_no)}</td>
        <td>${esc(o.client)}</td>
        <td>${esc(o.prf || "—")}</td>
        <td>${esc(fmtDT(o.created_at))}</td>
        <td>${esc(fmtDate(o.delivery_date))}</td>
        <td>${Number(o.total_lines || 0)}</td>
        <td>${Number(o.activated_lines || 0)}</td>
        <td>${statusPill(o.status)}</td>
        <td>
          <button class="btn btn-primary btn-sm" data-action="open" data-id="${
            o.id
          }">Open</button>
        </td>
      `;
      els.ordersBody.appendChild(tr);
    }

    // actions
    els.ordersBody
      .querySelectorAll("button[data-action='open']")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = Number(btn.getAttribute("data-id"));
          const order = rows.find((x) => Number(x.id) === id);
          if (order) openModal(order);
        });
      });

    setStatus("Orders loaded ✅", "success");
  }

  async function loadOrderLines(orderId) {
    const res = await fetch(`/api/intake/orders/${orderId}/lines`, {
      headers: authHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok)
      throw new Error(data.error || "Failed to load lines");
    return data.lines || [];
  }

  // ---------- Modal ----------
  function showModal() {
    els.reviewModal.style.display = "flex";
  }
  function hideModal() {
    els.reviewModal.style.display = "none";
    currentOrder = null;
    currentLines = [];
    els.linesBody.innerHTML = "";
  }

  function computeTotalsFromUI() {
    const rows = els.linesBody.querySelectorAll("tr[data-lineid]");
    let selectedLines = 0;
    let piecesToActivate = 0;

    rows.forEach((r) => {
      const go = r.querySelector("input[data-role='go']")?.checked;
      const qty = Number(r.querySelector("input[data-role='qty']")?.value || 0);
      if (go && qty > 0) {
        selectedLines++;
        piecesToActivate += qty;
      }
    });

    els.modalTotals.textContent = `Selected lines: ${selectedLines} | Pieces to activate now: ${piecesToActivate}`;
  }

  function renderLines(lines) {
    els.linesBody.innerHTML = "";

    for (const ln of lines) {
      const totalQty = Number(ln.qty || 0);
      const activated = Number(ln.activated_qty || 0);
      const remaining = Math.max(0, totalQty - activated);

      const desc =
        [ln.glass_type, ln.size].filter(Boolean).join(" / ") || ln.notes || "—";

      const tr = document.createElement("tr");
      tr.setAttribute("data-lineid", ln.id);

      tr.innerHTML = `
        <td>${esc(ln.line_code || "—")}</td>
        <td>${esc(ln.line_code || "—")}</td>
        <td>${esc(desc)}</td>
        <td>${totalQty}</td>
        <td>${activated}</td>
        <td style="min-width:140px;">
          <input class="input" data-role="qty" type="number" min="0" max="${remaining}" value="${remaining}"
            style="padding:6px 10px; width:120px;" />
          <div style="font-size:0.75rem; color:#6b7280; margin-top:4px;">Remaining: ${remaining}</div>
        </td>
        <td style="min-width:120px;">
          <select class="input" data-role="priority" style="padding:6px 10px;">
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </td>
        <td style="text-align:center;">
          <input type="checkbox" data-role="go" ${
            remaining > 0 ? "checked" : ""
          } ${remaining <= 0 ? "disabled" : ""}/>
        </td>
      `;

      els.linesBody.appendChild(tr);
    }

    // totals listeners
    els.linesBody.querySelectorAll("input,select").forEach((el) => {
      el.addEventListener("change", computeTotalsFromUI);
      el.addEventListener("input", computeTotalsFromUI);
    });

    computeTotalsFromUI();
  }

  async function openModal(order) {
    try {
      currentOrder = order;

      els.modalOrderId.textContent = order.order_no || order.id;
      els.modalMeta.textContent = `${order.client || "—"} • PRF: ${
        order.prf || "—"
      } • Delivery: ${fmtDate(order.delivery_date)}`;
      els.modalStatus.textContent = "Loading lines…";

      showModal();

      currentLines = await loadOrderLines(order.id);

      if (!currentLines.length) {
        els.linesBody.innerHTML = `<tr><td colspan="8" style="padding:10px; color:#6b7280;">No lines found for this order.</td></tr>`;
        els.modalStatus.textContent = "No lines.";
        return;
      }

      renderLines(currentLines);
      els.modalStatus.textContent =
        "Select lines + qty then click “Send to Factory”.";
    } catch (e) {
      console.error(e);
      els.modalStatus.textContent = "Failed to load order lines.";
    }
  }

  async function sendToFactory() {
    if (!currentOrder) return;

    const rows = els.linesBody.querySelectorAll("tr[data-lineid]");
    const payloadLines = [];

    rows.forEach((r) => {
      const lineId = Number(r.getAttribute("data-lineid"));
      const go = r.querySelector("input[data-role='go']")?.checked ? 1 : 0;
      const activateQty = Number(
        r.querySelector("input[data-role='qty']")?.value || 0
      );
      const priority = String(
        r.querySelector("select[data-role='priority']")?.value || "normal"
      );

      payloadLines.push({ lineId, go, activateQty, priority });
    });

    els.modalStatus.textContent = "Sending to factory…";

    const res = await fetch("/api/intake/activate", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: currentOrder.id, lines: payloadLines }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      els.modalStatus.textContent = data.error || "Activation failed.";
      return;
    }

    els.modalStatus.textContent = `✅ Done. Created pieces: ${data.createdPieces}`;
    setStatus(
      `✅ Activated order ${currentOrder.order_no}. Created pieces: ${data.createdPieces}`,
      "success"
    );

    // refresh page data
    await loadKpis();
    await loadOrders();

    // refresh modal lines (show new activated counts)
    currentLines = await loadOrderLines(currentOrder.id);
    renderLines(currentLines);
  }

  // ---------- UI wiring ----------
  function debounce(fn, ms = 250) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  els.statusFilter?.addEventListener("change", loadOrders);
  els.draftOnlyToggle?.addEventListener("change", loadOrders);
  els.searchInput?.addEventListener("input", debounce(loadOrders, 300));

  els.closeModalBtn?.addEventListener("click", hideModal);
  els.cancelBtn?.addEventListener("click", hideModal);

  els.reviewModal?.addEventListener("click", (e) => {
    if (e.target === els.reviewModal) hideModal();
  });

  els.activateBtn?.addEventListener("click", sendToFactory);

  // initial
  els.reviewModal.style.display = "none";
  loadKpis();
  loadOrders();
  setStatus("Waiting for action…", "info");
})();
