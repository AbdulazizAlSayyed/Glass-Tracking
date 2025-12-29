// ===== helpers =====
const deliveryStatus = document.getElementById("deliveryStatus");
function showStatus(type, msg) {
  deliveryStatus.textContent = msg;
  deliveryStatus.className = `station-status-message ${type}`;
}

function nowString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function safeNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

// ===== API helper =====
const authToken = localStorage.getItem("token") || null;

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      ...(authToken ? { Authorization: "Bearer " + authToken } : {}),
    },
  });

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg = data?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  if (data && data.ok === false) {
    throw new Error(data.error || "API error");
  }
  return data;
}

// ===== UI refs =====
const ordersBody = document.getElementById("ordersBody");
const filterStatus = document.getElementById("filterStatus");
const searchOrders = document.getElementById("searchOrders");
const readyOnlyToggle = document.getElementById("readyOnlyToggle");

// Panel refs
const orderPanel = document.getElementById("orderPanel");
const panelOrderId = document.getElementById("panelOrderId");
const panelMeta = document.getElementById("panelMeta");
const panelSummary = document.getElementById("panelSummary");

const dnInput = document.getElementById("dnInput");
const driverInput = document.getElementById("driverInput");
const notesInput = document.getElementById("notesInput");

const tabGrouped = document.getElementById("tabGrouped");
const tabPieces = document.getElementById("tabPieces");
const paneGrouped = document.getElementById("paneGrouped");
const panePieces = document.getElementById("panePieces");

// grouped
const groupBody = document.getElementById("groupBody");
const selectedQty = document.getElementById("selectedQty");
const resetQtyBtn = document.getElementById("resetQtyBtn");
const confirmGroupedBtn = document.getElementById("confirmGroupedBtn");
const groupMsg = document.getElementById("groupMsg");

// pieces
const piecesBody = document.getElementById("piecesBody");
const selectedPiecesCount = document.getElementById("selectedPiecesCount");
const clearPiecesBtn = document.getElementById("clearPiecesBtn");
const confirmPiecesBtn = document.getElementById("confirmPiecesBtn");
const piecesMsg = document.getElementById("piecesMsg");

// history
const historyBody = document.getElementById("historyBody");

// track modal
const trackModal = document.getElementById("trackModal");
const trackCloseBtn = document.getElementById("trackCloseBtn");
const trackMeta = document.getElementById("trackMeta");
const trackBox = document.getElementById("trackBox");

// preview modal
const previewModal = document.getElementById("previewModal");
const previewCloseBtn = document.getElementById("previewCloseBtn");
const previewMeta = document.getElementById("previewMeta");
const previewSearch = document.getElementById("previewSearch");
const previewCount = document.getElementById("previewCount");
const previewBody = document.getElementById("previewBody");

// ===== Data from backend =====
let orders = []; // لستة الأوامر من /api/delivery/orders
let orderSummaryByNo = {}; // orderNo -> {total, ready, delivered, remaining}
let orderCustomerByNo = {}; // orderNo -> customer
let piecesByOrder = {}; // orderNo -> pieces[] (من /api/delivery/orders/:orderNo)
let deliveryNotes = {}; // orderNo -> history[] (حاليًا فاضية / من الAPI لاحقًا)

let currentOrderNo = null;
let currentPreviewGroupKey = null;

// ===== logic helpers =====
function computeOrderSummary(orderNo) {
  const cached = orderSummaryByNo[orderNo];
  if (cached) return cached;

  const list = piecesByOrder[orderNo] || [];
  const total = list.length;
  const ready = list.filter((p) => p.status === "ready").length;
  const delivered = list.filter((p) => p.status === "delivered").length;
  const remaining = total - delivered;
  const summary = { total, ready, delivered, remaining };
  orderSummaryByNo[orderNo] = summary;
  return summary;
}

function deliveryStatusText(orderNo) {
  const s = computeOrderSummary(orderNo);
  if (s.delivered === 0)
    return { text: "Not shipped", cls: "status-not-started" };
  if (s.remaining === 0) return { text: "Delivered", cls: "status-completed" };
  return { text: "Partially shipped", cls: "status-in-progress" };
}

async function submitDelivery(mode, payload) {
  const body = {
    orderNo: currentOrderNo,
    dnNo: dnInput.value || null,
    driver: (driverInput.value || "").trim(),
    notes: (notesInput.value || "").trim(),
    mode,
    ...payload,
  };

  const res = await apiFetch("/api/delivery/confirm", {
    method: "POST",
    body: JSON.stringify(body),
  });

  const data = res.data;
  // حدّث history المحلي من الـ API
  if (!deliveryNotes[currentOrderNo]) deliveryNotes[currentOrderNo] = [];
  deliveryNotes[currentOrderNo] = data.history.map((h) => ({
    dn: h.dn,
    date: h.date,
    driver: h.driver,
    delivered: h.delivered,
    notes: h.notes,
  }));

  // حدّث summary
  orderSummaryByNo[currentOrderNo] = data.summary;

  return data;
}

function nextDN(orderNo) {
  const arr = deliveryNotes[orderNo] || [];
  const n = arr.length + 1;
  return `DN-${String(n).padStart(4, "0")}`;
}

function groupKeyOf(p) {
  return `${p.line}|${p.size}|${p.type}`;
}

function buildGroups(orderNo) {
  const all = piecesByOrder[orderNo] || [];
  const map = new Map();

  for (const p of all) {
    const key = groupKeyOf(p);
    if (!map.has(key)) {
      map.set(key, {
        key,
        line: p.line,
        size: p.size,
        type: p.type,
        total: 0,
        ready: 0,
        delivered: 0,
        remaining: 0,
        readyStages: new Set(),
      });
    }
    const g = map.get(key);
    g.total++;
    if (p.status === "ready") {
      g.ready++;
      g.readyStages.add(p.currentStage || "—");
    }
    if (p.status === "delivered") g.delivered++;
  }

  for (const g of map.values()) {
    g.remaining = g.total - g.delivered;
  }

  return Array.from(map.values()).sort((a, b) =>
    (a.line + a.type).localeCompare(b.line + b.type)
  );
}

function setView(mode) {
  if (mode === "pieces") {
    tabPieces.classList.add("active");
    tabGrouped.classList.remove("active");
    panePieces.style.display = "block";
    paneGrouped.style.display = "none";
    piecesMsg.className = "station-status-message info";
    piecesMsg.textContent = "Only READY pieces can be delivered.";
  } else {
    tabGrouped.classList.add("active");
    tabPieces.classList.remove("active");
    paneGrouped.style.display = "block";
    panePieces.style.display = "none";
    groupMsg.className = "station-status-message info";
    groupMsg.textContent = "Only READY quantities can be delivered.";
  }
}

// ===== تحميل الأوامر من الـ backend =====
async function loadOrders() {
  try {
    showStatus("info", "Loading orders...");
    ordersBody.innerHTML =
      '<tr><td colspan="8" style="color:#6b7280; font-size:0.85rem;">Loading…</td></tr>';

    const res = await apiFetch("/api/delivery/orders");
    const data = res.data || [];

    orders = data;
    orderSummaryByNo = {};
    orderCustomerByNo = {};
    data.forEach((o) => {
      orderCustomerByNo[o.orderNo] = o.customer;
      orderSummaryByNo[o.orderNo] = {
        total: o.total,
        ready: o.ready,
        delivered: o.delivered,
        remaining: o.remaining,
      };
    });

    renderOrders();
    showStatus(
      "info",
      "Choose an order to prepare a Delivery Note (Grouped Qty or Pieces)."
    );
  } catch (err) {
    console.error("loadOrders error:", err);
    ordersBody.innerHTML =
      '<tr><td colspan="8" style="color:#b91c1c; font-size:0.85rem;">Error loading orders.</td></tr>';
    showStatus("error", "Error loading orders.");
  }
}

// ===== render orders =====
function renderOrders() {
  const st = filterStatus.value || "all";
  const q = (searchOrders.value || "").trim().toLowerCase();
  const readyOnly = !!readyOnlyToggle.checked;

  const rows = orders
    .filter((o) => {
      const s = computeOrderSummary(o.orderNo);

      if (readyOnly && s.ready === 0) return false;

      if (st !== "all") {
        if (st === "notshipped" && !(s.delivered === 0)) return false;
        if (st === "partial" && !(s.delivered > 0 && s.remaining > 0))
          return false;
        if (st === "delivered" && !(s.remaining === 0)) return false;
      }

      const searchText = `${o.orderNo} ${o.customer}`.toLowerCase();
      if (q && !searchText.includes(q)) return false;

      return true;
    })
    .map((o) => {
      const s = computeOrderSummary(o.orderNo);
      const delStat = deliveryStatusText(o.orderNo);

      return `
        <tr data-order="${o.orderNo}">
          <td><strong>${o.orderNo}</strong></td>
          <td>${o.customer}</td>
          <td>${s.total}</td>
          <td>${s.ready}</td>
          <td>${s.delivered}</td>
          <td>${s.remaining}</td>
          <td><span class="status-pill ${delStat.cls}">${
        delStat.text
      }</span></td>
          <td>
            <button class="btn ${
              s.ready > 0 ? "btn-primary" : "btn-ghost"
            }" data-open="${o.orderNo}" type="button">
              ${s.ready > 0 ? "Prepare delivery" : "View"}
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  ordersBody.innerHTML =
    rows ||
    `<tr><td colspan="8" style="color:#6b7280; font-size:0.85rem;">No matching orders.</td></tr>`;
}

filterStatus.addEventListener("change", renderOrders);
searchOrders.addEventListener("input", renderOrders);
readyOnlyToggle.addEventListener("change", renderOrders);

ordersBody.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-open]");
  if (!btn) return;
  openOrder(btn.dataset.open);
});

// ===== open panel / load one order =====
function updatePanelHeader(orderNo) {
  const summary = computeOrderSummary(orderNo);
  const customer = orderCustomerByNo[orderNo] || "";

  panelOrderId.textContent = orderNo;
  panelMeta.textContent = `${customer} • Grouped delivery supported • Partial delivery supported`;
  panelSummary.textContent = `Total: ${summary.total} • Ready: ${summary.ready} • Delivered: ${summary.delivered} • Remaining: ${summary.remaining}`;

  dnInput.value = nextDN(orderNo);
  driverInput.value = "";
  notesInput.value = "";
}

function renderHistory(orderNo) {
  const arr = deliveryNotes[orderNo] || [];
  historyBody.innerHTML =
    arr
      .map(
        (x) => `
        <tr>
          <td><strong>${x.dn}</strong></td>
          <td>${x.date}</td>
          <td>${x.driver || "—"}</td>
          <td>${x.delivered}</td>
          <td>${x.notes || "—"}</td>
        </tr>
      `
      )
      .join("") ||
    `<tr><td colspan="5" style="color:#6b7280; font-size:0.85rem;">No deliveries yet.</td></tr>`;
}

function renderGrouped(orderNo) {
  const groups = buildGroups(orderNo);

  groupBody.innerHTML =
    groups
      .map((g) => {
        const max = g.ready;
        const stages = Array.from(g.readyStages);
        const stageLabel =
          stages.length === 0 ? "—" : stages.length === 1 ? stages[0] : "Mixed";

        const inputHtml =
          max > 0
            ? `<input class="input" style="max-width:110px; padding:6px 10px;" type="number" min="0" max="${max}"
                 value="0" data-qty="${g.key}" />`
            : `<span class="status-pill status-not-started">No ready</span>`;

        const previewBtn =
          max > 0
            ? `<button class="btn btn-ghost btn-small" type="button" data-preview="${g.key}">Preview</button>`
            : `<span style="color:#6b7280; font-size:0.8rem;">—</span>`;

        return `
          <tr>
            <td><strong>${g.line}</strong></td>
            <td>${g.size}</td>
            <td>${g.type}</td>
            <td><span class="status-pill status-completed">${g.ready}</span></td>
            <td>${g.delivered}</td>
            <td>${g.remaining}</td>
            <td>
              ${inputHtml}
              <div style="font-size:0.75rem; color:#6b7280; margin-top:4px;">
                Ready stage: ${stageLabel}
              </div>
            </td>
            <td>${previewBtn}</td>
          </tr>
        `;
      })
      .join("") ||
    `<tr><td colspan="8" style="color:#6b7280; font-size:0.85rem;">No lines found.</td></tr>`;

  updateSelectedQty();
}

function pillForPieceStatus(status) {
  if (status === "ready")
    return `<span class="status-pill status-completed">READY</span>`;
  if (status === "delivered")
    return `<span class="status-pill status-in-progress">DELIVERED</span>`;
  return `<span class="status-pill status-not-started">IN PROGRESS</span>`;
}

function renderPieces(orderNo) {
  const all = piecesByOrder[orderNo] || [];
  const readyList = all
    .filter((p) => p.status === "ready")
    .sort((a, b) => a.glassNo.localeCompare(b.glassNo));

  piecesBody.innerHTML =
    readyList
      .map(
        (p) => `
        <tr>
          <td><strong>${p.glassNo}</strong></td>
          <td>${p.line}</td>
          <td>${p.size}</td>
          <td>${p.type}</td>
          <td>${pillForPieceStatus(p.status)}</td>
          <td><button class="btn btn-ghost btn-small" data-track="${
            p.glassNo
          }" type="button">Track</button></td>
          <td>
            <label style="font-size:0.8rem; display:flex; align-items:center; gap:6px;">
              <input type="checkbox" data-select="${p.glassNo}" />
              Deliver now
            </label>
          </td>
        </tr>
      `
      )
      .join("") ||
    `<tr><td colspan="7" style="color:#6b7280; font-size:0.85rem;">No READY pieces for delivery.</td></tr>`;

  updateSelectedPiecesCount();
}

async function openOrder(orderNo) {
  currentOrderNo = orderNo;
  orderPanel.style.display = "block";
  showStatus("info", `Loading ${orderNo} details…`);

  try {
    const res = await apiFetch(
      `/api/delivery/orders/${encodeURIComponent(orderNo)}`
    );
    const data = res.data || {};
    const pieces = data.pieces || [];
    const history = data.history || [];

    // خزن القطع و history
    piecesByOrder[orderNo] = pieces;
    deliveryNotes[orderNo] = history.map((h) => ({
      dn: h.dn,
      date: h.date,
      driver: h.driver,
      delivered: h.delivered,
      notes: h.notes,
    }));

    // نعيد حساب الـ summary من القطع
    delete orderSummaryByNo[orderNo];
    computeOrderSummary(orderNo);

    // لو ما كان عندنا اسم الزبون من قبل، خذه من الـ API
    if (data.order && data.order.customer) {
      orderCustomerByNo[orderNo] = data.order.customer;
    }

    updatePanelHeader(orderNo);
    renderGrouped(orderNo);
    renderPieces(orderNo);
    renderHistory(orderNo);

    setView("grouped");
    showStatus("info", `Opened ${orderNo}. Use Grouped (Qty) or Pieces view.`);
  } catch (err) {
    console.error("openOrder error:", err);
    showStatus("error", `Error loading order ${orderNo}.`);
  }
}

// ===== Tabs =====
tabGrouped.addEventListener("click", () => setView("grouped"));
tabPieces.addEventListener("click", () => setView("pieces"));

// ===== Grouped: selection + confirm =====
function getQtyInputs() {
  return Array.from(groupBody.querySelectorAll("input[data-qty]"));
}

function updateSelectedQty() {
  const inputs = getQtyInputs();
  let sum = 0;
  for (const inp of inputs) sum += safeNum(inp.value);
  selectedQty.textContent = String(sum);
}

groupBody.addEventListener("input", (e) => {
  const inp = e.target.closest("input[data-qty]");
  if (!inp) return;

  const max = safeNum(inp.getAttribute("max"));
  let v = safeNum(inp.value);

  if (v < 0) v = 0;
  if (v > max) v = max;

  inp.value = String(v);
  updateSelectedQty();
});

resetQtyBtn.addEventListener("click", () => {
  for (const inp of getQtyInputs()) inp.value = "0";
  updateSelectedQty();
  groupMsg.className = "station-status-message info";
  groupMsg.textContent = "Quantities reset.";
});

confirmGroupedBtn.addEventListener("click", async () => {
  if (!currentOrderNo) return;

  // Build groups payload
  const groups = [];
  const inputs = getQtyInputs();

  inputs.forEach((inp) => {
    const qty = safeNum(inp.value);
    if (!qty) return;

    const key = inp.dataset.qty; // line|size|type
    const [line, size, type] = key.split("|");
    groups.push({ line, size, type, qty });
  });

  if (!groups.length) {
    groupMsg.className = "station-status-message error";
    groupMsg.textContent =
      "No quantities selected. Enter qty to deliver then confirm.";
    return;
  }

  try {
    groupMsg.className = "station-status-message info";
    groupMsg.textContent = "Submitting delivery note…";

    const data = await submitDelivery("grouped", { groups });

    groupMsg.className = "station-status-message success";
    groupMsg.textContent = `✅ ${data.dnNo} confirmed. Delivered ${data.deliveredNow} piece(s).`;

    // أعد تحميل تفاصيل الطلب + لستة الأوامر
    await openOrder(currentOrderNo);
    await loadOrders();
  } catch (err) {
    console.error("confirmGrouped error:", err);
    groupMsg.className = "station-status-message error";
    groupMsg.textContent = err.message || "Error confirming delivery.";
  }
});

// ===== Pieces: selection + confirm =====
function getSelectedPieces() {
  return Array.from(
    piecesBody.querySelectorAll("input[data-select]:checked")
  ).map((cb) => cb.dataset.select);
}

function updateSelectedPiecesCount() {
  selectedPiecesCount.textContent = String(getSelectedPieces().length);
}

piecesBody.addEventListener("change", (e) => {
  if (e.target.matches("input[data-select]")) updateSelectedPiecesCount();
});

clearPiecesBtn.addEventListener("click", () => {
  piecesBody
    .querySelectorAll("input[data-select]")
    .forEach((cb) => (cb.checked = false));
  updateSelectedPiecesCount();
  piecesMsg.className = "station-status-message info";
  piecesMsg.textContent = "Selection cleared.";
});

confirmPiecesBtn.addEventListener("click", async () => {
  if (!currentOrderNo) return;

  const selected = getSelectedPieces();
  if (!selected.length) {
    piecesMsg.className = "station-status-message error";
    piecesMsg.textContent =
      "No pieces selected. Select at least one READY piece.";
    return;
  }

  try {
    piecesMsg.className = "station-status-message info";
    piecesMsg.textContent = "Submitting delivery note…";

    const data = await submitDelivery("pieces", { pieces: selected });

    piecesMsg.className = "station-status-message success";
    piecesMsg.textContent = `✅ ${data.dnNo} confirmed. Delivered ${data.deliveredNow} piece(s).`;

    await openOrder(currentOrderNo);
    await loadOrders();
    updateSelectedPiecesCount();
  } catch (err) {
    console.error("confirmPieces error:", err);
    piecesMsg.className = "station-status-message error";
    piecesMsg.textContent = err.message || "Error confirming delivery.";
  }
});

// ===== Track modal (piece) =====
trackCloseBtn.addEventListener("click", () =>
  trackModal.classList.remove("active")
);

piecesBody.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-track]");
  if (!btn || !currentOrderNo) return;

  const glassNo = btn.dataset.track;
  const all = piecesByOrder[currentOrderNo] || [];
  const p = all.find((x) => x.glassNo === glassNo);
  if (!p) return;

  trackMeta.textContent = `${glassNo} • Current stage: ${
    p.currentStage || "—"
  }`;
  trackBox.textContent = `This piece is currently at: ${p.currentStage || "—"}`;
  trackModal.classList.add("active");
});

// ===== Preview modal (group) =====
previewCloseBtn.addEventListener("click", () =>
  previewModal.classList.remove("active")
);

function openPreview(groupKey) {
  if (!currentOrderNo) return;

  currentPreviewGroupKey = groupKey;
  previewSearch.value = "";

  const all = piecesByOrder[currentOrderNo] || [];
  const ready = all
    .filter((p) => p.status === "ready" && groupKeyOf(p) === groupKey)
    .sort((a, b) => a.glassNo.localeCompare(b.glassNo));

  const [line, size, type] = groupKey.split("|");
  previewMeta.textContent = `${line} • ${size} • ${type} • READY: ${ready.length}`;

  renderPreviewRows(ready);
  previewModal.classList.add("active");
}

function renderPreviewRows(list) {
  const q = (previewSearch.value || "").trim().toLowerCase();
  const filtered = q
    ? list.filter((p) => p.glassNo.toLowerCase().includes(q))
    : list;

  previewCount.textContent = String(filtered.length);

  previewBody.innerHTML =
    filtered
      .slice(0, 200)
      .map(
        (p) => `
        <tr>
          <td><strong>${p.glassNo}</strong></td>
          <td>${p.currentStage || "—"}</td>
        </tr>
      `
      )
      .join("") ||
    `<tr><td colspan="2" style="color:#6b7280; font-size:0.85rem;">No results.</td></tr>`;
}

groupBody.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-preview]");
  if (!btn) return;
  openPreview(btn.dataset.preview);
});

previewSearch.addEventListener("input", () => {
  if (!currentOrderNo || !currentPreviewGroupKey) return;

  const all = piecesByOrder[currentOrderNo] || [];
  const ready = all
    .filter(
      (p) => p.status === "ready" && groupKeyOf(p) === currentPreviewGroupKey
    )
    .sort((a, b) => a.glassNo.localeCompare(b.glassNo));

  renderPreviewRows(ready);
});

// ===== initial =====
loadOrders();
