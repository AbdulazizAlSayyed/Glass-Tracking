// public/js/import-orders.js
document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const currentPage = window.location.pathname.split("/").pop();

  if (!token || !user) {
    window.location.replace("index.html");
    return;
  }

  if (user.homePage && user.homePage !== currentPage) {
    window.location.replace(user.homePage);
    return;
  }

  initImportOrdersPage(user);
});

function initImportOrdersPage(user) {
  const els = {
    // Header / logout
    userChip: document.getElementById("userChip"),
    logoutBtn: document.getElementById("logoutBtn"),

    // Stats
    statImported: document.getElementById("statImported"),
    statDraft: document.getElementById("statDraft"),
    statLastImport: document.getElementById("statLastImport"),
    statWarnings: document.getElementById("statWarnings"),

    // Recent
    recentBody: document.getElementById("recentOrdersBody"),

    // Import form
    file: document.getElementById("noriaFile"),
    fileMeta: document.getElementById("fileMeta"),
    prf: document.getElementById("prfInput"),
    deliveryDate: document.getElementById("deliveryDateInput"),
    client: document.getElementById("clientInput"),
    orderNo: document.getElementById("orderNoInput"),
    previewBtn: document.getElementById("previewBtn"),
    resetBtn: document.getElementById("resetBtn"),
    importStatus: document.getElementById("importStatus"),

    // Preview
    previewCard: document.getElementById("previewCard"),
    pvOrderNo: document.getElementById("pvOrderNo"),
    pvClient: document.getElementById("pvClient"),
    pvLines: document.getElementById("pvLines"),
    pvPieces: document.getElementById("pvPieces"),
    checksBox: document.getElementById("checksBox"),
    previewBody: document.getElementById("previewBody"),
    createDraftBtn: document.getElementById("createDraftBtn"),
    closePreviewBtn: document.getElementById("closePreviewBtn"),

    // All Orders + filters + pagination
    allOrdersBody: document.getElementById("allOrdersBody"),
    statusFilter: document.getElementById("statusFilter"),
    clientSearch: document.getElementById("clientSearch"),
    orderNoSearch: document.getElementById("orderNoSearch"),
    refreshOrdersBtn: document.getElementById("refreshOrdersBtn"),

    allOrdersPrevBtn: document.getElementById("allOrdersPrevBtn"),
    allOrdersNextBtn: document.getElementById("allOrdersNextBtn"),
    allOrdersCurrentPage: document.getElementById("allOrdersCurrentPage"),
    allOrdersTotalPages: document.getElementById("allOrdersTotalPages"),
    allOrdersFrom: document.getElementById("allOrdersFrom"),
    allOrdersTo: document.getElementById("allOrdersTo"),
    allOrdersTotal: document.getElementById("allOrdersTotal"),
    allOrdersPageSize: document.getElementById("allOrdersPageSize"),

    // Modal
    modal: document.getElementById("orderDetailsModal"),
    modalOrderNo: document.getElementById("modalOrderNo"),
    modalContent: document.getElementById("orderDetailsContent"),
    modalCloseBtn: document.getElementById("modalCloseBtn"),
  };

  if (els.userChip)
    els.userChip.textContent = `User: ${user.username} (${user.role})`;

  // ---------- helpers ----------
  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function authHeaders() {
    const t = localStorage.getItem("token");
    return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
  }

  function formDataHeaders() {
    const t = localStorage.getItem("token");
    return { Authorization: `Bearer ${t}` };
  }

  function statusPill(status) {
    const s = String(status || "").toLowerCase();
    switch (s) {
      case "draft":
        return `<span class="status-pill status-not-started">Draft</span>`;
      case "active":
        return `<span class="status-pill status-in-progress">Active</span>`;
      case "paused":
        return `<span class="status-pill status-delayed">Paused</span>`;
      case "completed":
        return `<span class="status-pill status-completed">Completed</span>`;
      case "cancelled":
        return `<span class="status-pill status-cancelled">Cancelled</span>`;
      default:
        return `<span class="status-pill">${esc(status || "—")}</span>`;
    }
  }

  function setStatus(msg, type = "info") {
    if (!els.importStatus) return;
    const colors = {
      info: "#6b7280",
      success: "#16a34a",
      error: "#dc2626",
      warning: "#f59e0b",
    };
    els.importStatus.style.color = colors[type] || colors.info;
    els.importStatus.textContent = msg;
  }

  function setChecks(warnings) {
    if (!els.checksBox) return;
    if (!warnings || warnings.length === 0) {
      els.checksBox.className = "station-status-message success";
      els.checksBox.textContent = "No warnings ✅ All checks passed";
      return;
    }
    els.checksBox.className = "station-status-message info";
    els.checksBox.innerHTML =
      `<strong>Warnings (${warnings.length}):</strong><br/>` +
      warnings.map((w) => `• ${esc(w)}`).join("<br/>");
  }

  function getFile() {
    return els.file?.files && els.file.files[0] ? els.file.files[0] : null;
  }

  function buildFormData() {
    const fd = new FormData();
    const f = getFile();
    if (f) fd.append("file", f);
    fd.append("orderNo", (els.orderNo?.value || "").trim());
    fd.append("client", (els.client?.value || "").trim());
    fd.append("prf", (els.prf?.value || "").trim());
    fd.append("deliveryDate", (els.deliveryDate?.value || "").trim());
    return fd;
  }

  async function safeJson(res) {
    try {
      return await res.json();
    } catch {
      return {};
    }
  }

  function handle401() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.replace("index.html");
  }

  // ---------- API loaders ----------
  async function loadSummary() {
    try {
      const res = await fetch("/api/orders/summary?mine=1", {
        headers: authHeaders(),
      });
      if (res.status === 401) return handle401();
      const data = await safeJson(res);
      if (!res.ok || !data.ok) return;

      const s = data.summary || {};
      if (els.statImported) els.statImported.textContent = s.importedToday || 0;
      if (els.statDraft) els.statDraft.textContent = s.draftWaiting || 0;
      if (els.statWarnings)
        els.statWarnings.textContent = s.warningsDetected || 0;

      if (els.statLastImport) {
        if (s.lastImport) {
          const d = new Date(s.lastImport);
          els.statLastImport.textContent = d.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
        } else {
          els.statLastImport.textContent = "—";
        }
      }
    } catch (e) {
      console.error("loadSummary error:", e);
    }
  }

  async function loadRecent() {
    if (!els.recentBody) return;
    try {
      const res = await fetch("/api/orders/recent?mine=1&limit=10", {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (res.status === 401) return handle401();
      const data = await safeJson(res);

      if (!res.ok || !data.ok) {
        els.recentBody.innerHTML = `
          <tr><td colspan="6" style="color:#dc2626; padding:12px;">Failed to load recent orders</td></tr>
        `;
        return;
      }

      const orders = data.orders || [];
      if (!orders.length) {
        els.recentBody.innerHTML = `
          <tr><td colspan="6" style="color:#6b7280; padding:14px; text-align:center;">No recent orders</td></tr>
        `;
        return;
      }

      els.recentBody.innerHTML = "";
      orders.forEach((o) => {
        const created = o.created_at
          ? new Date(o.created_at).toLocaleString([], {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—";
        const delivery = o.delivery_date
          ? new Date(o.delivery_date).toLocaleDateString()
          : "—";

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><strong>${esc(o.order_no)}</strong></td>
          <td>${esc(o.client)}</td>
          <td>${esc(created)}</td>
          <td>${esc(delivery)}</td>
          <td>${Number(o.line_count || 0)}</td>
          <td>${statusPill(o.status)}</td>
        `;
        els.recentBody.appendChild(tr);
      });
    } catch (e) {
      console.error("loadRecent error:", e);
    }
  }

  // ---------- Import / preview ----------
  async function doPreview() {
    const file = getFile();
    if (!file) return setStatus("Please select a file first", "error");
    if (!els.orderNo?.value.trim())
      return setStatus("Please enter order number", "error");
    if (!els.client?.value.trim())
      return setStatus("Please enter client name", "error");

    setStatus("Uploading file for preview...", "info");
    els.previewBtn.disabled = true;

    try {
      const res = await fetch("/api/orders/import/preview", {
        method: "POST",
        headers: formDataHeaders(),
        body: buildFormData(),
      });
      if (res.status === 401) return handle401();
      const data = await safeJson(res);

      if (!res.ok || !data.ok) {
        setStatus(data.error || "Preview failed", "error");
        return;
      }

      const p = data.preview;
      els.previewCard.style.display = "block";
      els.pvOrderNo.textContent = p.orderNo || "—";
      els.pvClient.textContent = p.client || "—";
      els.pvLines.textContent = p.totalLines || 0;
      els.pvPieces.textContent = p.totalPieces || 0;

      setChecks(p.warnings || []);

      els.previewBody.innerHTML = "";
      const lines = p.linesPreview || [];
      if (!lines.length) {
        els.previewBody.innerHTML = `<tr><td colspan="5" style="color:#6b7280; padding:12px;">No lines to preview</td></tr>`;
      } else {
        lines.forEach((line, idx) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${esc(line.line_code || `L${idx + 1}`)}</td>
            <td>${Number(line.qty || 0)}</td>
            <td>${esc(line.size || "—")}</td>
            <td>${esc(line.glass_type || "—")}</td>
            <td>${esc(line.notes || "—")}</td>
          `;
          els.previewBody.appendChild(tr);
        });
      }

      setStatus("Preview ready ✅ Click 'Create Draft' to save", "success");
      els.previewCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (e) {
      console.error("doPreview error:", e);
      setStatus("Network error. Please try again.", "error");
    } finally {
      els.previewBtn.disabled = false;
    }
  }

  async function createDraft() {
    if (
      !confirm("Create draft order? This will save the order to the database.")
    )
      return;

    setStatus("Creating draft order...", "info");
    els.createDraftBtn.disabled = true;

    try {
      const res = await fetch("/api/orders/import", {
        method: "POST",
        headers: formDataHeaders(),
        body: buildFormData(),
      });
      if (res.status === 401) return handle401();
      const data = await safeJson(res);

      if (!res.ok || !data.ok) {
        setStatus(data.error || "Failed to create draft", "error");
        return;
      }

      setStatus(`Draft created ✅ Order #${data.order.orderNo}`, "success");
      resetForm();
      await Promise.all([
        loadSummary(),
        loadRecent(),
        loadAllOrders(1, allOrdersPageSize),
      ]);
    } catch (e) {
      console.error("createDraft error:", e);
      setStatus("Network error. Please try again.", "error");
    } finally {
      els.createDraftBtn.disabled = false;
    }
  }

  function resetForm() {
    if (els.file) els.file.value = "";
    if (els.fileMeta) els.fileMeta.textContent = "No file selected.";
    if (els.prf) els.prf.value = "";
    if (els.deliveryDate) els.deliveryDate.value = "";
    if (els.client) els.client.value = "";
    if (els.orderNo) els.orderNo.value = "";

    if (els.previewCard) els.previewCard.style.display = "none";
    if (els.previewBody) els.previewBody.innerHTML = "";
    if (els.checksBox) els.checksBox.textContent = "No checks yet.";

    setStatus("Form reset. Ready.", "info");
  }

  // ---------- All Orders (Detailed) ----------
  let currentAllOrdersPage = 1;
  let allOrdersPageSize = parseInt(els.allOrdersPageSize?.value || "10", 10);
  let totalAllOrders = 0;
  let totalAllPages = 1;

  async function loadAllOrders(page = 1, pageSize = 10) {
    try {
      const status = (els.statusFilter?.value || "all").trim();
      const client = (els.clientSearch?.value || "").trim();
      const orderNo = (els.orderNoSearch?.value || "").trim();

      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });

      if (status && status !== "all") params.set("status", status);
      if (client) params.set("client", client);
      if (orderNo) params.set("orderNo", orderNo);

      const res = await fetch(`/api/orders?${params.toString()}`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (res.status === 401) return handle401();
      const data = await safeJson(res);

      if (!res.ok || !data.ok)
        throw new Error(data.error || `Failed (${res.status})`);

      currentAllOrdersPage = data.pagination?.page || page;
      allOrdersPageSize = data.pagination?.limit || pageSize;
      totalAllOrders = data.pagination?.total || 0;
      totalAllPages = data.pagination?.totalPages || 1;

      renderAllOrders(data.orders || []);
      updatePaginationUI();
    } catch (e) {
      console.error("loadAllOrders error:", e);
      if (els.allOrdersBody) {
        els.allOrdersBody.innerHTML = `
          <tr><td colspan="9" style="color:#dc2626; padding:20px; text-align:center;">❌ ${esc(
            e.message
          )}</td></tr>
        `;
      }
      updatePaginationUI();
    }
  }

  function renderAllOrders(orders) {
    if (!els.allOrdersBody) return;

    if (!orders.length) {
      els.allOrdersBody.innerHTML = `<tr><td colspan="9" style="color:#6b7280; padding:20px; text-align:center;">📭 No orders found</td></tr>`;
      return;
    }

    els.allOrdersBody.innerHTML = "";
    orders.forEach((o) => {
      const created = o.created_at
        ? new Date(o.created_at).toLocaleString([], {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "—";
      const delivery = o.delivery_date
        ? new Date(o.delivery_date).toLocaleDateString()
        : "—";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${esc(o.order_no)}</strong></td>
        <td>${esc(o.client)}</td>
        <td>${esc(o.prf || "—")}</td>
        <td>${esc(created)}</td>
        <td>${esc(delivery)}</td>
        <td>${Number(o.total_lines || 0)}</td>
        <td>${Number(o.total_pieces || 0)}</td>
        <td>${statusPill(o.status)}</td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-sm btn-ghost" type="button" data-action="view" data-id="${
              o.id
            }" title="View">👁️</button>
            <button class="btn btn-sm btn-danger" type="button" data-action="delete" data-id="${
              o.id
            }" data-no="${esc(o.order_no)}" title="Delete">🗑️</button>
          </div>
        </td>
      `;
      els.allOrdersBody.appendChild(tr);
    });
  }

  function updatePaginationUI() {
    const from =
      totalAllOrders === 0
        ? 0
        : (currentAllOrdersPage - 1) * allOrdersPageSize + 1;
    const to = Math.min(
      currentAllOrdersPage * allOrdersPageSize,
      totalAllOrders
    );

    if (els.allOrdersCurrentPage)
      els.allOrdersCurrentPage.textContent = String(currentAllOrdersPage);
    if (els.allOrdersTotalPages)
      els.allOrdersTotalPages.textContent = String(totalAllPages);
    if (els.allOrdersFrom) els.allOrdersFrom.textContent = String(from);
    if (els.allOrdersTo) els.allOrdersTo.textContent = String(to);
    if (els.allOrdersTotal)
      els.allOrdersTotal.textContent = String(totalAllOrders);

    if (els.allOrdersPrevBtn)
      els.allOrdersPrevBtn.disabled = currentAllOrdersPage <= 1;
    if (els.allOrdersNextBtn)
      els.allOrdersNextBtn.disabled = currentAllOrdersPage >= totalAllPages;
    if (els.allOrdersPageSize)
      els.allOrdersPageSize.value = String(allOrdersPageSize);
  }

  // ---------- Modal / Details ----------
  async function viewOrderDetails(orderId) {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (res.status === 401) return handle401();
      const data = await safeJson(res);

      if (!res.ok || !data.ok)
        throw new Error(data.error || `Failed (${res.status})`);

      const order = data.order;
      const lines = data.lines || [];
      const pieces = data.pieces || [];

      const linesHtml = lines.length
        ? `
          <h4 style="margin-top:18px;">Order Lines (${lines.length})</h4>
          <div class="table-wrapper" style="max-height:280px; overflow:auto; margin-top:10px;">
            <table class="table">
              <thead>
                <tr>
                  <th>Line Code</th><th>Qty</th><th>Size</th><th>Type</th><th>Notes</th>
                </tr>
              </thead>
              <tbody>
                ${lines
                  .map(
                    (l) => `
                  <tr>
                    <td>${esc(l.line_code)}</td>
                    <td>${Number(l.qty || 0)}</td>
                    <td>${esc(l.size || "—")}</td>
                    <td>${esc(l.glass_type || "—")}</td>
                    <td>${esc(l.notes || "—")}</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        `
        : `<div style="margin-top:14px; color:#6b7280;">No lines</div>`;

      const piecesHtml = pieces.length
        ? `
          <h4 style="margin-top:18px;">Pieces (${pieces.length})</h4>
          <div class="table-wrapper" style="max-height:220px; overflow:auto; margin-top:10px;">
            <table class="table">
              <thead>
                <tr>
                  <th>Piece</th><th>Status</th><th>Station</th><th>Broken Notes</th>
                </tr>
              </thead>
              <tbody>
                ${pieces
                  .map(
                    (p) => `
                  <tr>
                    <td>${esc(p.piece_code || p.piece_number || "—")}</td>
                    <td>${esc(p.status || "—")}</td>
                    <td>${esc(p.station_name || "—")}</td>
                    <td>${esc(p.broken_notes || "—")}</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        `
        : `<div style="margin-top:14px; color:#6b7280;">No pieces (tables may not exist yet)</div>`;

      const delivery = order.delivery_date
        ? new Date(order.delivery_date).toLocaleDateString()
        : "—";
      const created = order.created_at
        ? new Date(order.created_at).toLocaleString()
        : "—";

      const modalHtml = `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:14px;">
          <div class="card">
            <div class="stat-label">Order</div>
            <div class="stat-value">${esc(order.order_no)}</div>
            <div style="margin-top:8px; color:#6b7280;">Client: ${esc(
              order.client
            )}</div>
            <div style="margin-top:4px; color:#6b7280;">PRF: ${esc(
              order.prf || "—"
            )}</div>
          </div>
          <div class="card">
            <div class="stat-label">Status</div>
            <div class="stat-value">${statusPill(order.status)}</div>
            <div style="margin-top:8px; color:#6b7280;">Delivery: ${esc(
              delivery
            )}</div>
            <div style="margin-top:4px; color:#6b7280;">Created: ${esc(
              created
            )}</div>
          </div>
        </div>

        ${linesHtml}
        ${piecesHtml}

        <div style="margin-top:18px; display:flex; justify-content:flex-end; gap:10px;">
          ${
            String(order.status) === "Draft"
              ? `<button class="btn btn-primary" type="button" id="activateBtn">Activate</button>`
              : `<button class="btn btn-ghost" type="button" id="changeStatusBtn">Change Status</button>`
          }
          <button class="btn btn-danger" type="button" id="deleteBtn">Delete</button>
        </div>
      `;

      if (els.modalOrderNo) els.modalOrderNo.textContent = order.order_no;
      if (els.modalContent) els.modalContent.innerHTML = modalHtml;
      if (els.modal) els.modal.style.display = "block";

      // bind modal buttons
      document
        .getElementById("deleteBtn")
        ?.addEventListener("click", () =>
          deleteOrder(order.id, order.order_no, true)
        );
      document
        .getElementById("activateBtn")
        ?.addEventListener("click", () => activateOrder(order.id));
      document
        .getElementById("changeStatusBtn")
        ?.addEventListener("click", () => changeOrderStatus(order.id));
    } catch (e) {
      console.error("viewOrderDetails error:", e);
      alert(`Failed to load order details: ${e.message}`);
    }
  }

  function closeModal() {
    if (els.modal) els.modal.style.display = "none";
  }

  async function deleteOrder(orderId, orderNo, closeAfter = false) {
    if (!confirm(`Delete order #${orderNo}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.status === 401) return handle401();
      const data = await safeJson(res);

      if (!res.ok || !data.ok)
        throw new Error(data.error || `Failed (${res.status})`);

      alert(`Order #${orderNo} deleted ✅`);
      if (closeAfter) closeModal();
      await Promise.all([
        loadSummary(),
        loadRecent(),
        loadAllOrders(currentAllOrdersPage, allOrdersPageSize),
      ]);
    } catch (e) {
      console.error("deleteOrder error:", e);
      alert(`Delete failed: ${e.message}`);
    }
  }

  async function activateOrder(orderId) {
    if (!confirm("Activate this order? Draft → Active")) return;
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ status: "Active" }),
      });
      if (res.status === 401) return handle401();
      const data = await safeJson(res);
      if (!res.ok || !data.ok)
        throw new Error(data.error || `Failed (${res.status})`);

      alert("Activated ✅");
      closeModal();
      await Promise.all([
        loadSummary(),
        loadRecent(),
        loadAllOrders(currentAllOrdersPage, allOrdersPageSize),
      ]);
    } catch (e) {
      console.error("activateOrder error:", e);
      alert(`Activate failed: ${e.message}`);
    }
  }

  async function changeOrderStatus(orderId) {
    const newStatus = prompt(
      "Enter new status: Draft, Active, Paused, Completed, Cancelled"
    );
    const allowed = ["Draft", "Active", "Paused", "Completed", "Cancelled"];
    if (!newStatus || !allowed.includes(newStatus))
      return alert("Invalid status");

    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.status === 401) return handle401();
      const data = await safeJson(res);
      if (!res.ok || !data.ok)
        throw new Error(data.error || `Failed (${res.status})`);

      alert("Status updated ✅");
      closeModal();
      await Promise.all([
        loadSummary(),
        loadRecent(),
        loadAllOrders(currentAllOrdersPage, allOrdersPageSize),
      ]);
    } catch (e) {
      console.error("changeOrderStatus error:", e);
      alert(`Change status failed: ${e.message}`);
    }
  }

  // ---------- debounce ----------
  function debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  // ---------- events ----------
  els.file?.addEventListener("change", () => {
    const f = getFile();
    if (!f) {
      els.fileMeta.textContent = "No file selected.";
      return;
    }
    els.fileMeta.textContent = `${f.name} (${Math.round(f.size / 1024)} KB)`;
    setStatus("File selected ✅ Click Preview", "success");
  });

  els.previewBtn?.addEventListener("click", doPreview);
  els.createDraftBtn?.addEventListener("click", createDraft);
  els.resetBtn?.addEventListener("click", resetForm);
  els.closePreviewBtn?.addEventListener("click", () => {
    els.previewCard.style.display = "none";
    setStatus("Preview closed.", "info");
  });

  els.logoutBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    if (!confirm("Logout?")) return;
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.replace("index.html");
  });

  els.refreshOrdersBtn?.addEventListener("click", () =>
    loadAllOrders(1, allOrdersPageSize)
  );

  els.statusFilter?.addEventListener("change", () =>
    loadAllOrders(1, allOrdersPageSize)
  );
  els.clientSearch?.addEventListener(
    "input",
    debounce(() => loadAllOrders(1, allOrdersPageSize), 400)
  );
  els.orderNoSearch?.addEventListener(
    "input",
    debounce(() => loadAllOrders(1, allOrdersPageSize), 400)
  );

  els.allOrdersPrevBtn?.addEventListener("click", () => {
    if (currentAllOrdersPage > 1)
      loadAllOrders(currentAllOrdersPage - 1, allOrdersPageSize);
  });
  els.allOrdersNextBtn?.addEventListener("click", () => {
    if (currentAllOrdersPage < totalAllPages)
      loadAllOrders(currentAllOrdersPage + 1, allOrdersPageSize);
  });
  els.allOrdersPageSize?.addEventListener("change", () => {
    allOrdersPageSize = parseInt(els.allOrdersPageSize.value, 10);
    loadAllOrders(1, allOrdersPageSize);
  });

  // table row actions (view/delete)
  els.allOrdersBody?.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");
    if (!id) return;

    if (action === "view") viewOrderDetails(Number(id));
    if (action === "delete")
      deleteOrder(Number(id), btn.getAttribute("data-no") || id);
  });

  els.modalCloseBtn?.addEventListener("click", closeModal);
  els.modal?.addEventListener("click", (e) => {
    if (e.target === els.modal) closeModal();
  });

  // ---------- initial load ----------
  loadSummary();
  loadRecent();
  loadAllOrders(1, allOrdersPageSize);
}
