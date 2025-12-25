// =========================
// Auth + API helper
// =========================
const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("user") || "null");

function apiHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

async function apiGet(url) {
  const res = await fetch(url, { headers: apiHeaders() });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function apiPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify(body || {}),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Request failed");
  return data;
}

// =========================
// Tabs (same as yours)
// =========================
const tabByGlass = document.getElementById("tabByGlass");
const tabByOrder = document.getElementById("tabByOrder");
const paneByGlass = document.getElementById("paneByGlass");
const paneByOrder = document.getElementById("paneByOrder");

tabByGlass?.addEventListener("click", () => {
  tabByGlass.classList.add("active");
  tabByOrder.classList.remove("active");
  paneByGlass.style.display = "block";
  paneByOrder.style.display = "none";
});

tabByOrder?.addEventListener("click", () => {
  tabByOrder.classList.add("active");
  tabByGlass.classList.remove("active");
  paneByGlass.style.display = "none";
  paneByOrder.style.display = "block";
});

// =========================
// Status helper
// =========================
const stationStatus = document.getElementById("stationStatus");
function showStatus(type, msg) {
  if (!stationStatus) return;
  stationStatus.textContent = msg;
  stationStatus.className = `station-status-message ${type}`;
}

const todayBadge = document.getElementById("todayPassedBadge");
function incTodayPassed() {
  if (!todayBadge) return;
  const text = todayBadge.textContent || "";
  const m = text.match(/Today:\s*(\d+)\s*passed/i);
  const n = m ? parseInt(m[1], 10) : 0;
  todayBadge.textContent = `Today: ${Number.isFinite(n) ? n + 1 : 1} passed`;
}

// =========================
// UI header fill
// =========================
const stationTitleEl = document.getElementById("stationTitle");
const stationUserEl = document.getElementById("stationUser");

function fillHeader() {
  if (stationTitleEl) {
    stationTitleEl.textContent =
      (user?.stationName ? user.stationName.toUpperCase() : "STATION") +
      " Station";
  }
  if (stationUserEl) {
    stationUserEl.textContent = `User: ${user?.username || "—"}`;
  }
}

// =========================
// State (real data from DB)
// =========================
let queue = []; // rows from /api/stations/my/queue
// each row: { piece_id, piece_code, piece_status, order_code, station_name }

function norm(s) {
  return (s || "").trim().toLowerCase();
}

function mapStatusToUi(piece_status) {
  // DB: not_started / in_process / completed / broken
  if (piece_status === "completed") return "completed";
  if (piece_status === "broken") return "broken";
  return "waiting"; // not_started أو in_process
}

function pillClass(uiStatus) {
  if (uiStatus === "waiting") return "status-not-started";
  if (uiStatus === "completed") return "status-completed";
  return "status-delayed"; // broken
}
function pillLabel(uiStatus) {
  if (uiStatus === "waiting") return "Waiting";
  if (uiStatus === "completed") return "Done";
  return "Broken";
}

// =========================
// Load queue from backend
// =========================
async function loadQueue() {
  showStatus("info", "Loading station queue...");
  const data = await apiGet("/api/stations/my/queue");
  queue = Array.isArray(data.data) ? data.data : [];
  renderOrdersList();
  showStatus("success", `Loaded ${queue.length} piece(s) in this station.`);
}

// =========================
// Orders list (group by order_code)
// =========================
const ordersBody = document.getElementById("ordersBody");
const orderSearchInput = document.getElementById("orderSearchInput");

function buildOrdersSummary() {
  const map = new Map(); // order_code -> { orderNo, pieces, pending, customer, due }
  for (const p of queue) {
    const orderNo = p.order_code || "—";
    if (!map.has(orderNo)) {
      map.set(orderNo, {
        orderNo,
        customer: "—", // إذا بعدين ضفت customer بالـDB منعدّلها
        due: "—", // إذا عندك due_date منعدّلها
        pieces: 0,
        pending: 0,
      });
    }
    const o = map.get(orderNo);
    o.pieces++;
    // queue أصلاً بس not_started/in_process، بس خلّينا عامة
    if (p.piece_status !== "completed" && p.piece_status !== "broken")
      o.pending++;
  }
  return Array.from(map.values());
}

function renderOrdersList() {
  if (!ordersBody) return;

  const q = norm(orderSearchInput?.value);
  const orders = buildOrdersSummary().filter((o) =>
    norm(o.orderNo).includes(q)
  );

  const rows = orders
    .map((o) => {
      return `
        <tr>
          <td><strong>${o.orderNo}</strong></td>
          <td>${o.customer}</td>
          <td>${o.pieces}</td>
          <td>
            <span class="status-pill ${
              o.pending ? "status-in-progress" : "status-completed"
            }">${o.pending}</span>
          </td>
          <td>${o.due}</td>
          <td>
            <button class="link-btn" data-open-order="${
              o.orderNo
            }" type="button">Open</button>
          </td>
        </tr>
      `;
    })
    .join("");

  ordersBody.innerHTML =
    rows ||
    `<tr><td colspan="6" style="color:#6b7280; font-size:0.85rem;">No orders found.</td></tr>`;
}

orderSearchInput?.addEventListener("input", renderOrdersList);

// =========================
// Order Modal (pieces in this station for that order)
// =========================
const orderModal = document.getElementById("orderModal");
const orderModalCloseBtn = document.getElementById("orderModalCloseBtn");
const orderModalTitle = document.getElementById("orderModalTitle");
const orderModalMeta = document.getElementById("orderModalMeta");
const orderPiecesBody = document.getElementById("orderPiecesBody");

const pieceSearchInput = document.getElementById("pieceSearchInput");
const pendingOnlyToggle = document.getElementById("pendingOnlyToggle");
const paginationLabel = document.getElementById("paginationLabel");
const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");

let currentOrderNo = null;
let currentPage = 1;
const pageSize = 12;

function openOrderModal(orderNo) {
  currentOrderNo = orderNo;
  currentPage = 1;

  if (pieceSearchInput) pieceSearchInput.value = "";
  if (pendingOnlyToggle) pendingOnlyToggle.checked = true;

  const pieces = queue.filter((p) => (p.order_code || "—") === orderNo);

  if (orderModalTitle) orderModalTitle.textContent = `Order #${orderNo}`;
  if (orderModalMeta)
    orderModalMeta.textContent = `${pieces.length} piece(s) in this station`;

  orderModal?.classList.add("active");
  renderOrderPieces();
}

function closeOrderModal() {
  orderModal?.classList.remove("active");
  currentOrderNo = null;
}
orderModalCloseBtn?.addEventListener("click", closeOrderModal);

function getFilteredPiecesForOrder() {
  const all = queue.filter((p) => (p.order_code || "—") === currentOrderNo);
  const q = norm(pieceSearchInput?.value);
  const pendingOnly = !!pendingOnlyToggle?.checked;

  return all.filter((p) => {
    const uiStatus = mapStatusToUi(p.piece_status);
    if (pendingOnly && uiStatus !== "waiting") return false;
    if (q && !norm(p.piece_code).includes(q)) return false;
    return true;
  });
}

function renderOrderPieces() {
  if (!currentOrderNo || !orderPiecesBody) return;

  const list = getFilteredPiecesForOrder();
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  currentPage = Math.min(currentPage, totalPages);

  const start = (currentPage - 1) * pageSize;
  const page = list.slice(start, start + pageSize);

  orderPiecesBody.innerHTML =
    page
      .map((p) => {
        const uiStatus = mapStatusToUi(p.piece_status);
        const disabled = uiStatus !== "waiting" ? "disabled" : "";
        return `
          <tr>
            <td><strong>${p.piece_code}</strong></td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td><span class="status-pill ${pillClass(uiStatus)}">${pillLabel(
          uiStatus
        )}</span></td>
            <td>
              <button class="btn btn-primary btn-small" data-piece-done="${
                p.piece_code
              }" type="button" ${disabled}>
                Done
              </button>
            </td>
            <td>
              <button class="btn btn-ghost btn-small" data-piece-broken="${
                p.piece_code
              }" type="button" ${disabled}>
                Broken
              </button>
            </td>
          </tr>
        `;
      })
      .join("") ||
    `<tr><td colspan="7" style="color:#6b7280; font-size:0.85rem;">No pieces match your filter.</td></tr>`;

  if (paginationLabel) {
    if (total === 0) paginationLabel.textContent = "Showing 0 of 0";
    else
      paginationLabel.textContent = `Showing ${start + 1}-${Math.min(
        start + pageSize,
        total
      )} of ${total}`;
  }

  if (prevPageBtn) prevPageBtn.disabled = currentPage <= 1;
  if (nextPageBtn) nextPageBtn.disabled = currentPage >= totalPages;
}

pieceSearchInput?.addEventListener("input", () => {
  currentPage = 1;
  renderOrderPieces();
});
pendingOnlyToggle?.addEventListener("change", () => {
  currentPage = 1;
  renderOrderPieces();
});
prevPageBtn?.addEventListener("click", () => {
  currentPage--;
  renderOrderPieces();
});
nextPageBtn?.addEventListener("click", () => {
  currentPage++;
  renderOrderPieces();
});

// Open order button click
ordersBody?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-open-order]");
  if (!btn) return;
  openOrderModal(btn.dataset.openOrder);
});

// Done/Broken inside modal
orderPiecesBody?.addEventListener("click", async (e) => {
  const doneBtn = e.target.closest("[data-piece-done]");
  const brokenBtnInline = e.target.closest("[data-piece-broken]");

  try {
    if (doneBtn) {
      const pieceCode = doneBtn.dataset.pieceDone;
      showStatus("info", `Moving ${pieceCode}...`);
      await apiPost("/api/pieces/scan-next", {
        pieceCode,
        notes: "DONE from order modal",
      });
      incTodayPassed();
      await loadQueue();
      renderOrderPieces();
      showStatus("success", `✅ ${pieceCode} moved to next stage.`);
      return;
    }

    if (brokenBtnInline) {
      const pieceCode = brokenBtnInline.dataset.pieceBroken;
      openBrokenModal(pieceCode);
      return;
    }
  } catch (err) {
    showStatus("error", err.message);
  }
});

// =========================
// By glass number (Find -> details -> Done/Broken)
// =========================
const glassNumberInput = document.getElementById("glassNumberInput");
const glassFindBtn = document.getElementById("glassFindBtn");

const pieceDetails = document.getElementById("pieceDetails");
const pieceTitle = document.getElementById("pieceTitle");
const pieceSubtitle = document.getElementById("pieceSubtitle");
const pieceStatusPill = document.getElementById("pieceStatusPill");
const pieceSize = document.getElementById("pieceSize");
const pieceType = document.getElementById("pieceType");
const pieceStage = document.getElementById("pieceStage");
const pieceNotes = document.getElementById("pieceNotes");

const pieceDoneBtn = document.getElementById("pieceDoneBtn");
const pieceBrokenBtn = document.getElementById("pieceBrokenBtn");

let currentPieceCode = null;

function clearPieceDetails() {
  currentPieceCode = null;
  if (pieceDetails) pieceDetails.style.display = "none";
}

function renderPieceDetailsFromQueueRow(p) {
  if (!p) return;

  currentPieceCode = p.piece_code;
  const uiStatus = mapStatusToUi(p.piece_status);

  if (pieceTitle) pieceTitle.textContent = `Glass #${p.piece_code}`;
  if (pieceSubtitle)
    pieceSubtitle.textContent = `Order #${p.order_code || "—"} • Line —`;

  if (pieceSize) pieceSize.textContent = "—";
  if (pieceType) pieceType.textContent = "—";
  if (pieceStage)
    pieceStage.textContent = user?.stationName || p.station_name || "—";
  if (pieceNotes) pieceNotes.textContent = "—";

  if (pieceStatusPill) {
    pieceStatusPill.className = `status-pill ${pillClass(uiStatus)}`;
    pieceStatusPill.textContent = pillLabel(uiStatus);
  }

  const enabled = uiStatus === "waiting";
  if (pieceDoneBtn) pieceDoneBtn.disabled = !enabled;
  if (pieceBrokenBtn) pieceBrokenBtn.disabled = !enabled;

  if (pieceDetails) pieceDetails.style.display = "block";
}

async function findGlass() {
  const glassNo = (glassNumberInput?.value || "").trim();
  if (!glassNo) {
    showStatus("error", "Please enter a glass number.");
    clearPieceDetails();
    return;
  }

  showStatus("info", "Searching in this station queue...");
  const found = queue.find((x) => norm(x.piece_code) === norm(glassNo));

  if (!found) {
    showStatus("error", `Glass ${glassNo} is not in YOUR station queue.`);
    clearPieceDetails();
    return;
  }

  renderPieceDetailsFromQueueRow(found);
  showStatus("success", `Glass ${glassNo} loaded. Choose Done or Broken.`);
}

glassFindBtn?.addEventListener("click", findGlass);
glassNumberInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") findGlass();
});

pieceDoneBtn?.addEventListener("click", async () => {
  if (!currentPieceCode) return;
  try {
    showStatus("info", `Moving ${currentPieceCode}...`);
    await apiPost("/api/pieces/scan-next", {
      pieceCode: currentPieceCode,
      notes: "DONE from find glass",
    });
    incTodayPassed();
    await loadQueue();

    // بعد التحديث: حاول نرجع نعرض نفس القطعة إذا لسه بالمحطة (غالباً رح تروح)
    const stillHere = queue.find(
      (x) => norm(x.piece_code) === norm(currentPieceCode)
    );
    if (stillHere) renderPieceDetailsFromQueueRow(stillHere);
    else clearPieceDetails();

    showStatus("success", `✅ ${currentPieceCode} moved to next stage.`);
  } catch (err) {
    showStatus("error", err.message);
  }
});

pieceBrokenBtn?.addEventListener("click", () => {
  if (!currentPieceCode) return;
  openBrokenModal(currentPieceCode);
});

// =========================
// Broken Modal (your UI) -> backend
// =========================
const brokenBtn = document.getElementById("brokenBtn");
const brokenModal = document.getElementById("brokenModal");
const brokenCloseBtn = document.getElementById("brokenCloseBtn");
const brokenCancelBtn = document.getElementById("brokenCancelBtn");
const brokenConfirmBtn = document.getElementById("brokenConfirmBtn");
const brokenGlassInput = document.getElementById("brokenGlassInput");
const brokenReason = document.getElementById("brokenReason");
const brokenNotes = document.getElementById("brokenNotes");

function openBrokenModal(prefillGlassNo = "") {
  brokenModal?.classList.add("active");
  if (brokenGlassInput) brokenGlassInput.value = prefillGlassNo;
  if (brokenNotes) brokenNotes.value = "";
  brokenGlassInput?.focus();
}
function closeBrokenModal() {
  brokenModal?.classList.remove("active");
}

brokenBtn?.addEventListener("click", () => openBrokenModal(""));
brokenCloseBtn?.addEventListener("click", closeBrokenModal);
brokenCancelBtn?.addEventListener("click", closeBrokenModal);

brokenConfirmBtn?.addEventListener("click", async () => {
  const pieceCode = (brokenGlassInput?.value || "").trim();
  const reason = brokenReason?.value || "—";
  const notesExtra = (brokenNotes?.value || "").trim();

  if (!pieceCode) {
    showStatus("error", "Please enter glass number.");
    return;
  }

  // تأكد إنها بالمحطة
  const found = queue.find((x) => norm(x.piece_code) === norm(pieceCode));
  if (!found) {
    showStatus("error", `Glass ${pieceCode} is not in YOUR station queue.`);
    closeBrokenModal();
    return;
  }

  try {
    const fullNotes = `Reason: ${reason}${
      notesExtra ? " | " + notesExtra : ""
    }`;
    showStatus("info", `Marking ${pieceCode} as broken...`);
    await apiPost("/api/pieces/broken", { pieceCode, notes: fullNotes });

    await loadQueue();
    // إذا كانت تفاصيل By glass مفتوحة على نفس القطعة
    if (currentPieceCode && norm(currentPieceCode) === norm(pieceCode))
      clearPieceDetails();

    showStatus("error", `⚠️ ${pieceCode} marked as BROKEN.`);
  } catch (err) {
    showStatus("error", err.message);
  } finally {
    closeBrokenModal();
  }
});
// ===== Logout =====
// ===== Logout =====
const logoutBtn = document.getElementById("logoutBtn");
logoutBtn?.addEventListener("click", () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.replace("/index.html");
});

// =========================
// Init
// =========================
fillHeader();
loadQueue().catch((e) => showStatus("error", e.message));
