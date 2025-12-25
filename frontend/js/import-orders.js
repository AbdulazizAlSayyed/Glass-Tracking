// import-orders.js - FIXED VERSION
// Authentication check
(function () {
  try {
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user") || "null");
    const currentPage = window.location.pathname.split("/").pop();

    if (!token || !user) {
      console.log("No token or user found, redirecting to login");
      window.location.replace("index.html");
      return;
    }

    // Check if user should be on this page
    if (user.homePage && user.homePage !== currentPage) {
      console.log(`User should be on ${user.homePage}, redirecting...`);
      window.location.replace(user.homePage);
      return;
    }

    console.log("User authenticated:", user.username, "Role:", user.role);

    // Initialize the application
    initApp();
  } catch (error) {
    console.error("Auth check error:", error);
    window.location.replace("index.html");
  }
})();

function initApp() {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "null");

  if (!token || !user) {
    window.location.replace("index.html");
    return;
  }

  const els = {
    userChip: document.getElementById("userChip"),
    statImported: document.getElementById("statImported"),
    statDraft: document.getElementById("statDraft"),
    statLastImport: document.getElementById("statLastImport"),
    statWarnings: document.getElementById("statWarnings"),
    file: document.getElementById("noriaFile"),
    fileMeta: document.getElementById("fileMeta"),
    prf: document.getElementById("prfInput"),
    deliveryDate: document.getElementById("deliveryDateInput"),
    client: document.getElementById("clientInput"),
    orderNo: document.getElementById("orderNoInput"),
    previewBtn: document.getElementById("previewBtn"),
    resetBtn: document.getElementById("resetBtn"),
    importStatus: document.getElementById("importStatus"),
    previewCard: document.getElementById("previewCard"),
    pvOrderNo: document.getElementById("pvOrderNo"),
    pvClient: document.getElementById("pvClient"),
    pvLines: document.getElementById("pvLines"),
    pvPieces: document.getElementById("pvPieces"),
    checksBox: document.getElementById("checksBox"),
    previewBody: document.getElementById("previewBody"),
    createDraftBtn: document.getElementById("createDraftBtn"),
    closePreviewBtn: document.getElementById("closePreviewBtn"),
    recentBody: document.getElementById("recentOrdersBody"), // FIXED: was "amaniOrdersBody"
  };

  // ✅ ADD MISSING ELEMENTS HERE - BEFORE loadRecent is called
  els.refreshOrdersBtn = document.getElementById("refreshOrdersBtn");
  els.viewAllOrdersBtn = document.getElementById("viewAllOrdersBtn");
  els.statusFilter = document.getElementById("statusFilter");
  els.clientSearch = document.getElementById("clientSearch");
  els.orderNoSearch = document.getElementById("orderNoSearch");
  els.dateFilter = document.getElementById("dateFilter");
  els.allOrdersBody = document.getElementById("allOrdersBody");
  els.prevPageBtn = document.getElementById("prevPageBtn");
  els.nextPageBtn = document.getElementById("nextPageBtn");
  els.currentPage = document.getElementById("currentPage");
  els.totalPages = document.getElementById("totalPages");
  els.ordersFrom = document.getElementById("ordersFrom");
  els.ordersTo = document.getElementById("ordersTo");
  els.ordersTotal = document.getElementById("ordersTotal");
  els.pageSize = document.getElementById("pageSize");
  els.logoutBtn = document.getElementById("logoutBtn");

  // Set user info
  if (els.userChip) {
    els.userChip.textContent = `${user.username} (${user.role})`;
  }

  // Pagination variables
  let currentAllOrdersPage = 1;
  let allOrdersPageSize = 10;
  let totalAllOrders = 0;
  let totalAllPages = 1;

  // Helper functions
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
    const token = localStorage.getItem("token");
    if (!token) {
      console.error("No token found in localStorage");
      window.location.replace("index.html");
      return {};
    }

    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  function formDataHeaders() {
    const token = localStorage.getItem("token");
    return {
      Authorization: `Bearer ${token}`,
    };
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

  function setChecks(warnings) {
    if (!els.checksBox) return;

    if (!warnings || warnings.length === 0) {
      els.checksBox.className = "station-status-message success";
      els.checksBox.textContent = "No warnings ✅ All checks passed";
      return;
    }

    els.checksBox.className = "station-status-message info";
    const warningList = warnings.map((w) => `• ${esc(w)}`).join("<br/>");
    els.checksBox.innerHTML = `<strong>Warnings (${warnings.length}):</strong><br/>${warningList}`;
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

    // Auto-clear success messages after 5 seconds
    if (type === "success") {
      setTimeout(() => {
        if (els.importStatus.textContent === msg) {
          setStatus("Ready for next action", "info");
        }
      }, 5000);
    }
  }

  function getFile() {
    return els.file.files && els.file.files[0] ? els.file.files[0] : null;
  }

  function buildFormData() {
    const fd = new FormData();
    const f = getFile();
    if (f) fd.append("file", f);

    fd.append("orderNo", (els.orderNo.value || "").trim());
    fd.append("client", (els.client.value || "").trim());
    fd.append("prf", (els.prf.value || "").trim());
    fd.append("deliveryDate", (els.deliveryDate.value || "").trim());

    return fd;
  }

  async function loadSummary() {
    try {
      const res = await fetch("/api/orders/summary?mine=1", {
        headers: authHeaders(),
      });

      if (!res.ok) {
        console.error("Summary load failed:", res.status);
        return;
      }

      const data = await res.json();
      if (!data.ok) return;

      const s = data.summary || {};
      if (els.statImported) els.statImported.textContent = s.importedToday || 0;
      if (els.statDraft) els.statDraft.textContent = s.draftWaiting || 0;
      if (els.statWarnings)
        els.statWarnings.textContent = s.warningsDetected || 0;

      if (s.lastImport && els.statLastImport) {
        const date = new Date(s.lastImport);
        const timeStr = date.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        els.statLastImport.textContent = timeStr;
      } else if (els.statLastImport) {
        els.statLastImport.textContent = "—";
      }
    } catch (error) {
      console.error("loadSummary error:", error);
    }
  }

  async function loadRecent() {
    try {
      console.log("Loading recent orders...");

      if (!els.recentBody) {
        console.warn("recentBody element not found");
        return;
      }

      const res = await fetch("/api/orders/recent?mine=1&limit=10", {
        headers: authHeaders(),
        cache: "no-cache",
      });

      console.log("Recent orders response status:", res.status);

      if (!res.ok) {
        const errorText = await res.text();
        console.error("API Error:", errorText);

        els.recentBody.innerHTML = `
        <tr>
          <td colspan="6" style="color: #dc2626; padding: 12px;">
            <strong>API Error ${res.status}</strong><br/>
            ${
              res.status === 500
                ? "Server error. Please check database tables."
                : "Failed to load recent orders."
            }
            <br/><small>Click here to <a href="#" onclick="location.reload()">retry</a></small>
          </td>
        </tr>
      `;
        return;
      }

      const data = await res.json();
      console.log("Recent orders data:", data);

      if (!data.ok) {
        els.recentBody.innerHTML = `
        <tr>
          <td colspan="6" style="color: #f59e0b; padding: 12px;">
            ${data.error || "Unknown error"}
          </td>
        </tr>
      `;
        return;
      }

      if (!data.orders || data.orders.length === 0) {
        els.recentBody.innerHTML = `
        <tr>
          <td colspan="6" style="color: #6b7280; padding: 12px; text-align: center;">
            <div style="margin: 20px;">
              <div style="font-size: 48px; color: #d1d5db;">📭</div>
              <h3 style="margin: 10px 0;">No orders yet</h3>
              <p style="margin: 5px 0; color: #9ca3af;">Import your first order to get started</p>
              <small>Tables: orders, order_lines</small>
            </div>
          </td>
        </tr>
      `;
        return;
      }

      // ✅ عرض البيانات في الجدول
      els.recentBody.innerHTML = "";

      data.orders.forEach((order) => {
        const created = order.created_at
          ? new Date(order.created_at).toLocaleString([], {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—";

        const delivery = order.delivery_date
          ? new Date(order.delivery_date).toLocaleDateString()
          : "—";

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><strong>${esc(order.order_no)}</strong></td>
          <td>${esc(order.client)}</td>
          <td>${esc(created)}</td>
          <td>${esc(delivery)}</td>
          <td>${order.lines || 0}</td>
          <td>${statusPill(order.status)}</td>
        `;
        els.recentBody.appendChild(tr);
      });
    } catch (error) {
      console.error("loadRecent error:", error);
      if (els.recentBody) {
        els.recentBody.innerHTML = `
      <tr>
        <td colspan="6" style="color: #dc2626; padding: 12px;">
          <strong>Network Error</strong><br/>
          ${error.message}<br/>
          <small>Please check if the server is running and try again.</small>
        </td>
      </tr>
    `;
      }
    }
  }

  async function doPreview() {
    const file = getFile();
    if (!file) {
      setStatus("Please select a file first", "error");
      return;
    }

    // Basic validation
    if (!els.orderNo.value.trim()) {
      setStatus("Please enter order number", "error");
      els.orderNo.focus();
      return;
    }

    if (!els.client.value.trim()) {
      setStatus("Please enter client name", "error");
      els.client.focus();
      return;
    }

    setStatus("Uploading file for preview...", "info");

    const originalBtnText = els.previewBtn.textContent;
    els.previewBtn.disabled = true;
    els.previewBtn.textContent = "Processing...";

    try {
      const formData = buildFormData();
      const res = await fetch("/api/orders/import/preview", {
        method: "POST",
        headers: formDataHeaders(),
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setStatus(data.error || "Preview failed", "error");
        return;
      }

      const preview = data.preview;

      // Update preview card
      els.previewCard.style.display = "block";
      els.pvOrderNo.textContent = preview.orderNo || "—";
      els.pvClient.textContent = preview.client || "—";
      els.pvLines.textContent = preview.totalLines || 0;
      els.pvPieces.textContent = preview.totalPieces || 0;

      // Update checks
      setChecks(preview.warnings || []);

      // Update preview table
      els.previewBody.innerHTML = "";

      if (preview.linesPreview && preview.linesPreview.length > 0) {
        preview.linesPreview.forEach((line, index) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${esc(line.line_code || `L${index + 1}`)}</td>
            <td>${line.qty || 0}</td>
            <td>${esc(line.size || "—")}</td>
            <td>${esc(line.glass_type || "—")}</td>
            <td>${esc(line.notes || "—")}</td>
          `;
          els.previewBody.appendChild(tr);
        });
      } else {
        els.previewBody.innerHTML = `
          <tr>
            <td colspan="5" style="color: #6b7280; padding: 12px;">
              No lines to preview
            </td>
          </tr>
        `;
      }

      setStatus("Preview ready. Review and click 'Create Draft'", "success");

      // Scroll to preview section
      els.previewCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
      console.error("Preview error:", error);
      setStatus("Network error. Please try again.", "error");
    } finally {
      els.previewBtn.disabled = false;
      els.previewBtn.textContent = originalBtnText;
    }
  }

  async function createDraft() {
    if (
      !confirm("Create draft order? This will save the order to the database.")
    ) {
      return;
    }

    setStatus("Creating draft order...", "info");

    const originalBtnText = els.createDraftBtn.textContent;
    els.createDraftBtn.disabled = true;
    els.createDraftBtn.textContent = "Creating...";

    try {
      const formData = buildFormData();
      const res = await fetch("/api/orders/import", {
        method: "POST",
        headers: formDataHeaders(),
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setStatus(data.error || "Failed to create draft", "error");
        return;
      }

      // Success
      setStatus(
        `Draft created successfully! Order #${data.order.orderNo}`,
        "success"
      );

      // Reset form
      resetForm();

      // Reload data
      await Promise.all([
        loadSummary(),
        loadRecent(),
        loadAllOrders(1, allOrdersPageSize),
      ]);

      // Show success message for a moment
      setTimeout(() => {
        if (
          els.importStatus &&
          els.importStatus.textContent.includes("successfully")
        ) {
          setStatus("Ready for next import", "info");
        }
      }, 3000);
    } catch (error) {
      console.error("Create draft error:", error);
      setStatus("Network error. Please try again.", "error");
    } finally {
      els.createDraftBtn.disabled = false;
      els.createDraftBtn.textContent = originalBtnText;
    }
  }

  function resetForm() {
    els.file.value = "";
    els.fileMeta.textContent = "No file selected";
    els.prf.value = "";
    els.deliveryDate.value = "";
    els.client.value = "";
    els.orderNo.value = "";

    els.previewCard.style.display = "none";
    els.previewBody.innerHTML = "";
    if (els.checksBox) els.checksBox.textContent = "No checks yet";
    setStatus("Form reset. Ready for new import.", "info");
  }

  // Load all orders function
  async function loadAllOrders(page = 1, pageSize = 10) {
    try {
      // Check token first
      const token = localStorage.getItem("token");
      if (!token) {
        console.error("No authentication token found");
        window.location.replace("index.html");
        return;
      }
      const status = els.statusFilter ? els.statusFilter.value : "";
      const client = els.clientSearch ? els.clientSearch.value.trim() : "";
      const orderNo = els.orderNoSearch ? els.orderNoSearch.value.trim() : "";
      const dateRange = els.dateFilter ? els.dateFilter.value : "";

      let url = `/api/orders?page=${page}&limit=${pageSize}`;

      const params = [];
      if (status && status !== "all")
        params.push(`status=${encodeURIComponent(status)}`);
      if (client) params.push(`client=${encodeURIComponent(client)}`);
      if (orderNo) params.push(`orderNo=${encodeURIComponent(orderNo)}`);
      if (dateRange && dateRange !== "all")
        params.push(`dateRange=${dateRange}`);

      if (params.length > 0) {
        url += "&" + params.join("&");
      }

      console.log("Loading all orders:", url);

      const res = await fetch(url, {
        headers: authHeaders(),
      });

      if (!res.ok) {
        throw new Error(`Failed to load orders: ${res.status}`);
      }

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to load orders");
      }

      // Update pagination info
      currentAllOrdersPage = page;
      allOrdersPageSize = pageSize;
      totalAllOrders = data.pagination?.total || data.orders.length;
      totalAllPages = data.pagination?.totalPages || 1;

      // Update UI
      updatePaginationUI();
      renderAllOrders(data.orders || []);
    } catch (error) {
      if (
        error.message.includes("401") ||
        error.message.includes("Authentication")
      ) {
        console.error("Authentication failed, redirecting to login");
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.replace("index.html");
        return;
      }
      console.error("loadAllOrders error:", error);
      if (els.allOrdersBody) {
        els.allOrdersBody.innerHTML = `
            <tr>
                <td colspan="9" style="color:#dc2626; padding:20px; text-align:center;">
                    ❌ Failed to load orders: ${esc(error.message)}
                </td>
            </tr>
        `;
      }
      updatePaginationUI();
    }
  }

  function renderAllOrders(orders) {
    if (!els.allOrdersBody) return;

    els.allOrdersBody.innerHTML = "";

    if (!orders || orders.length === 0) {
      els.allOrdersBody.innerHTML = `
            <tr>
                <td colspan="9" style="color:#6b7280; padding:20px; text-align:center;">
                    📭 No orders found
                </td>
            </tr>
        `;
      return;
    }

    orders.forEach((order) => {
      const created = order.created_at
        ? new Date(order.created_at).toLocaleDateString() +
          " " +
          new Date(order.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "—";

      const delivery = order.delivery_date
        ? new Date(order.delivery_date).toLocaleDateString()
        : "—";

      const tr = document.createElement("tr");
      tr.innerHTML = `
            <td><strong>${esc(order.order_no)}</strong></td>
            <td>${esc(order.client)}</td>
            <td>${esc(order.prf || "—")}</td>
            <td>${esc(created)}</td>
            <td>${esc(delivery)}</td>
            <td>${order.total_lines || order.line_count || 0}</td>
            <td>${order.total_pieces || 0}</td>
            <td>${statusPill(order.status)}</td>
            <td>
                <div style="display:flex; gap:4px;">
                    <button class="btn btn-sm btn-ghost" onclick="window.viewOrderDetails(${
                      order.id
                    })" title="View Details">
                        👁️
                    </button>
                    <button class="btn btn-sm btn-ghost" onclick="window.editOrder(${
                      order.id
                    })" title="Edit" ${
        order.status !== "Draft" ? 'disabled style="opacity:0.5;"' : ""
      }>
                        ✏️
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="window.deleteOrder(${
                      order.id
                    }, '${esc(order.order_no)}')" title="Delete">
                        🗑️
                    </button>
                </div>
            </td>
        `;
      els.allOrdersBody.appendChild(tr);
    });
  }

  function updatePaginationUI() {
    if (!els.currentPage || !els.totalPages) return;

    els.currentPage.textContent = currentAllOrdersPage;
    els.totalPages.textContent = totalAllPages;

    const from = (currentAllOrdersPage - 1) * allOrdersPageSize + 1;
    const to = Math.min(
      currentAllOrdersPage * allOrdersPageSize,
      totalAllOrders
    );

    if (els.ordersFrom)
      els.ordersFrom.textContent = totalAllOrders > 0 ? from : 0;
    if (els.ordersTo) els.ordersTo.textContent = totalAllOrders > 0 ? to : 0;
    if (els.ordersTotal) els.ordersTotal.textContent = totalAllOrders;

    if (els.prevPageBtn) els.prevPageBtn.disabled = currentAllOrdersPage <= 1;
    if (els.nextPageBtn)
      els.nextPageBtn.disabled = currentAllOrdersPage >= totalAllPages;
    if (els.pageSize) els.pageSize.value = allOrdersPageSize;
  }

  // Make functions available globally for onclick handlers
  window.viewOrderDetails = async function (orderId) {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        headers: authHeaders(),
      });

      if (!res.ok) {
        throw new Error(`Failed to load order details: ${res.status}`);
      }

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to load order details");
      }

      const order = data.order;

      // Create modal content
      let linesHtml = "";
      if (order.lines && order.lines.length > 0) {
        linesHtml = `
                <h4>Order Lines (${order.lines.length})</h4>
                <div class="table-wrapper" style="max-height:300px; overflow:auto; margin-top:10px;">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Line Code</th>
                                <th>Qty</th>
                                <th>Size</th>
                                <th>Type</th>
                                <th>Notes</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${order.lines
                              .map(
                                (line) => `
                                <tr>
                                    <td>${esc(line.line_code)}</td>
                                    <td>${line.qty}</td>
                                    <td>${esc(line.size || "—")}</td>
                                    <td>${esc(line.glass_type || "—")}</td>
                                    <td>${esc(line.notes || "—")}</td>
                                </tr>
                            `
                              )
                              .join("")}
                        </tbody>
                    </table>
                </div>
            `;
      }

      const modalContent = `
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; margin-bottom:20px;">
                <div>
                    <div class="detail-row">
                        <strong>Order Number:</strong> ${esc(order.order_no)}
                    </div>
                    <div class="detail-row">
                        <strong>Client:</strong> ${esc(order.client)}
                    </div>
                    <div class="detail-row">
                        <strong>PRF:</strong> ${esc(order.prf || "—")}
                    </div>
                    <div class="detail-row">
                        <strong>Status:</strong> ${statusPill(order.status)}
                    </div>
                </div>
                <div>
                    <div class="detail-row">
                        <strong>Created By:</strong> User ID ${order.created_by}
                    </div>
                    <div class="detail-row">
                        <strong>Created Date:</strong> ${new Date(
                          order.created_at
                        ).toLocaleString()}
                    </div>
                    <div class="detail-row">
                        <strong>Delivery Date:</strong> ${
                          order.delivery_date
                            ? new Date(order.delivery_date).toLocaleDateString()
                            : "—"
                        }
                    </div>
                    <div class="detail-row">
                        <strong>Last Updated:</strong> ${
                          order.updated_at
                            ? new Date(order.updated_at).toLocaleString()
                            : "—"
                        }
                    </div>
                </div>
            </div>
            
            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin-bottom:20px;">
                <div class="card">
                    <div class="stat-label">Total Lines</div>
                    <div class="stat-value">${order.total_lines || 0}</div>
                </div>
                <div class="card">
                    <div class="stat-label">Total Pieces</div>
                    <div class="stat-value">${order.total_pieces || 0}</div>
                </div>
                <div class="card">
                    <div class="stat-label">Order ID</div>
                    <div class="stat-value">${order.id}</div>
                </div>
            </div>
            
            ${linesHtml}
            
            <div style="margin-top:20px; padding-top:20px; border-top:1px solid #e5e7eb;">
                <div style="display:flex; gap:10px; justify-content:flex-end;">
                    <button class="btn btn-ghost" onclick="window.closeOrderModal()">Close</button>
                    ${
                      order.status === "Draft"
                        ? `<button class="btn btn-primary" onclick="window.activateOrder(${order.id})">Activate Order</button>`
                        : `<button class="btn btn-ghost" onclick="window.changeOrderStatus(${order.id})">Change Status</button>`
                    }
                    <button class="btn btn-danger" onclick="window.deleteOrder(${
                      order.id
                    }, '${esc(order.order_no)}')">Delete Order</button>
                </div>
            </div>
        `;

      const modal = document.getElementById("orderDetailsModal");
      if (modal) {
        const orderNoElement = document.getElementById("modalOrderNo");
        const contentElement = document.getElementById("orderDetailsContent");

        if (orderNoElement) orderNoElement.textContent = order.order_no;
        if (contentElement) contentElement.innerHTML = modalContent;
        modal.style.display = "block";
      } else {
        alert(`Order #${order.order_no} details loaded.`);
      }
    } catch (error) {
      console.error("viewOrderDetails error:", error);
      alert(`Failed to load order details: ${error.message}`);
    }
  };

  window.closeOrderModal = function () {
    const modal = document.getElementById("orderDetailsModal");
    if (modal) {
      modal.style.display = "none";
    }
  };

  window.deleteOrder = async function (orderId, orderNo) {
    if (
      !confirm(
        `Are you sure you want to delete order #${orderNo}? This action cannot be undone!`
      )
    ) {
      return;
    }

    try {
      const deleteOrderRes = await fetch(`/api/orders/${orderId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });

      if (!deleteOrderRes.ok) {
        throw new Error(`Failed to delete order: ${deleteOrderRes.status}`);
      }

      const data = await deleteOrderRes.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to delete order");
      }

      alert(`Order #${orderNo} deleted successfully!`);

      // Refresh data
      loadAllOrders(currentAllOrdersPage, allOrdersPageSize);
      loadSummary();
      loadRecent();
    } catch (error) {
      console.error("deleteOrder error:", error);
      alert(`Failed to delete order: ${error.message}`);
    }
  };

  window.activateOrder = async function (orderId) {
    if (
      !confirm("Activate this order? It will move from Draft to Active status.")
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ status: "Active" }),
      });

      if (!res.ok) {
        throw new Error(`Failed to activate order: ${res.status}`);
      }

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to activate order");
      }

      alert("Order activated successfully!");

      // Refresh
      window.closeOrderModal();
      loadAllOrders(currentAllOrdersPage, allOrdersPageSize);
      loadSummary();
      loadRecent();
    } catch (error) {
      console.error("activateOrder error:", error);
      alert(`Failed to activate order: ${error.message}`);
    }
  };

  window.changeOrderStatus = async function (orderId) {
    const newStatus = prompt(
      "Enter new status (Draft, Active, Paused, Completed, Cancelled):"
    );

    if (
      !newStatus ||
      !["Draft", "Active", "Paused", "Completed", "Cancelled"].includes(
        newStatus
      )
    ) {
      alert(
        "Invalid status. Please enter one of: Draft, Active, Paused, Completed, Cancelled"
      );
      return;
    }

    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        throw new Error(`Failed to change status: ${res.status}`);
      }

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to change status");
      }

      alert(`Order status changed to ${newStatus}!`);

      // Refresh
      window.closeOrderModal();
      loadAllOrders(currentAllOrdersPage, allOrdersPageSize);
      loadSummary();
      loadRecent();
    } catch (error) {
      console.error("changeOrderStatus error:", error);
      alert(`Failed to change status: ${error.message}`);
    }
  };

  window.editOrder = function (orderId) {
    alert(`Edit order ${orderId} - Feature coming soon!`);
  };

  // Helper: Debounce function for search
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Event Listeners
  if (els.file) {
    els.file.addEventListener("change", () => {
      const file = getFile();
      if (!file) {
        els.fileMeta.textContent = "No file selected";
        return;
      }

      const fileSizeKB = Math.round(file.size / 1024);
      els.fileMeta.textContent = `${file.name} (${fileSizeKB} KB)`;
      setStatus("File selected. Click 'Preview' to continue.", "success");
    });
  }

  if (els.previewBtn) {
    els.previewBtn.addEventListener("click", doPreview);
  }

  if (els.createDraftBtn) {
    els.createDraftBtn.addEventListener("click", createDraft);
  }

  if (els.resetBtn) {
    els.resetBtn.addEventListener("click", resetForm);
  }

  if (els.closePreviewBtn) {
    els.closePreviewBtn.addEventListener("click", () => {
      els.previewCard.style.display = "none";
      setStatus("Preview closed", "info");
    });
  }

  // Initialize date field with today's date
  if (els.deliveryDate) {
    const today = new Date().toISOString().split("T")[0];
    els.deliveryDate.value = today;
    els.deliveryDate.min = today;
  }

  // Auto-focus on order number field
  if (els.orderNo) {
    setTimeout(() => els.orderNo.focus(), 100);
  }

  // Add event listeners for order management
  if (els.refreshOrdersBtn) {
    els.refreshOrdersBtn.addEventListener("click", () => {
      loadAllOrders(currentAllOrdersPage, allOrdersPageSize);
      loadSummary();
      loadRecent();
    });
  }

  if (els.viewAllOrdersBtn) {
    els.viewAllOrdersBtn.addEventListener("click", () => {
      loadAllOrders(1, 100); // Load first 100 orders
    });
  }

  if (els.statusFilter) {
    els.statusFilter.addEventListener("change", () => {
      loadAllOrders(1, allOrdersPageSize);
    });
  }

  if (els.clientSearch) {
    els.clientSearch.addEventListener(
      "input",
      debounce(() => {
        loadAllOrders(1, allOrdersPageSize);
      }, 500)
    );
  }

  if (els.orderNoSearch) {
    els.orderNoSearch.addEventListener(
      "input",
      debounce(() => {
        loadAllOrders(1, allOrdersPageSize);
      }, 500)
    );
  }

  if (els.dateFilter) {
    els.dateFilter.addEventListener("change", () => {
      loadAllOrders(1, allOrdersPageSize);
    });
  }

  if (els.prevPageBtn) {
    els.prevPageBtn.addEventListener("click", () => {
      if (currentAllOrdersPage > 1) {
        loadAllOrders(currentAllOrdersPage - 1, allOrdersPageSize);
      }
    });
  }

  if (els.nextPageBtn) {
    els.nextPageBtn.addEventListener("click", () => {
      if (currentAllOrdersPage < totalAllPages) {
        loadAllOrders(currentAllOrdersPage + 1, allOrdersPageSize);
      }
    });
  }

  if (els.pageSize) {
    els.pageSize.addEventListener("change", () => {
      const newSize = parseInt(els.pageSize.value);
      loadAllOrders(1, newSize);
    });
  }

  // Add logout functionality
  if (els.logoutBtn) {
    els.logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (confirm("Are you sure you want to logout?")) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.replace("index.html");
      }
    });
  }

  // Load initial data
  loadSummary();
  loadRecent();
  loadAllOrders(1, 10);

  console.log("Import Orders page initialized successfully");
}
