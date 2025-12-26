// ===== Auth context =====
const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("user") || "null");

// ===== Logout button =====
const logoutBtn = document.getElementById("logoutBtn");
logoutBtn?.addEventListener("click", () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "/index.html?logout=1";
});

function authHeaders() {
  return { Authorization: `Bearer ${token}` };
}

// ===== Global data coming from backend =====
let DASHBOARD = {
  kpis: {},
  orders: [],
  stageLoad: [],
  alerts: [],
  audit: [],
};

const chipUser = document.getElementById("chipUser");
const chipFactory = document.getElementById("chipFactory");
const chipLastUpdate = document.getElementById("chipLastUpdate");

function setLastUpdateNow() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (chipLastUpdate) chipLastUpdate.textContent = `Last update: ${hh}:${mm}`;
}

function pillForStatus(status) {
  const s = (status || "").toLowerCase();
  if (s.includes("delayed")) return "status-pill status-delayed";
  if (s.includes("completed")) return "status-pill status-completed";
  if (s.includes("active")) return "status-pill status-in-progress";
  return "status-pill status-not-started";
}

// =========================
// KPIs
// =========================
function renderKpis() {
  const k = DASHBOARD.kpis || {};

  document.getElementById("kpiOrdersToday").textContent = k.ordersToday ?? 0;
  document.getElementById("kpiActiveOrders").textContent = k.activeOrders ?? 0;
  document.getElementById("kpiWipPieces").textContent = k.wipPieces ?? 0;
  document.getElementById("kpiCompletedToday").textContent =
    k.completedToday ?? 0;
  document.getElementById("kpiBrokenToday").textContent = k.brokenToday ?? 0;
  document.getElementById("kpiDeliveryReady").textContent =
    k.deliveryReady ?? 0;

  const chip = document.getElementById("kpiOrdersTodayChip");
  if (chip) {
    const v = Number(k.ordersToday || 0);
    chip.textContent = v
      ? `+${Math.max(1, Math.floor(v / 2))} vs yesterday`
      : "No change";
  }

  document.getElementById("urgentDraft").textContent = k.draftOrders ?? 0;
  document.getElementById("urgentLate").textContent = k.delayedOrders ?? 0;
  document.getElementById("urgentReadyDelivery").textContent =
    k.deliveryReady ?? 0;

  const st = DASHBOARD.stageLoad || [];
  if (st.length) {
    const maxBrokenStage = st.reduce(
      (best, s) => (Number(s.broken) > Number(best.broken) ? s : best),
      st[0]
    );
    document.getElementById(
      "urgentBreakStage"
    ).textContent = `${maxBrokenStage.stage} (${maxBrokenStage.broken})`;
  } else {
    document.getElementById("urgentBreakStage").textContent = "—";
  }
}

// =========================
// Recent orders
// =========================
function renderRecentOrders() {
  const body = document.getElementById("recentOrdersBody");
  const search = (document.getElementById("orderSearch").value || "")
    .trim()
    .toLowerCase();

  const orders = (DASHBOARD.orders || []).filter((o) =>
    `${o.orderNo} ${o.client}`.toLowerCase().includes(search)
  );

  const list = orders.slice(0, 10);

  body.innerHTML =
    list
      .map(
        (o) => `
      <tr class="${o.status === "Delayed" ? "row-delayed" : ""}">
        <td><strong>${o.orderNo}</strong></td>
        <td>${o.client}</td>
        <td>${o.qty}</td>
        <td>${o.stage}</td>
        <td>
          <div class="order-progress">
            <div class="mini-bar"><span style="width:${
              o.progressPct || 0
            }%;"></span></div>
            <div class="pct">${o.progressPct || 0}%</div>
          </div>
        </td>
        <td><span class="${pillForStatus(o.status)}">${o.status}</span></td>
        <td>${o.due || "—"}</td>
        <td>${o.lastUpdate || "—"}</td>
        <td>
          <button class="link-btn" data-open-order="${
            o.orderNo
          }" type="button">Open</button>
        </td>
      </tr>
    `
      )
      .join("") ||
    `<tr><td colspan="9" style="color:#6b7280; font-size:.85rem;">No orders found.</td></tr>`;
}

// =========================
// Stage load
// =========================
function renderStageLoad() {
  const body = document.getElementById("stageLoadBody");
  const data = DASHBOARD.stageLoad || [];

  if (!data.length) {
    body.innerHTML = `
      <tr><td colspan="5" style="color:#6b7280; font-size:.85rem;">No stages data.</td></tr>`;
    return;
  }

  const maxLoad = Math.max(
    ...data.map((s) => Number(s.waiting) + Number(s.inProgress))
  );

  body.innerHTML = data
    .map((s) => {
      const load = Number(s.waiting) + Number(s.inProgress);
      const pct = maxLoad ? Math.round((load / maxLoad) * 100) : 0;
      const brokenCell =
        Number(s.broken) > 3
          ? `<span class="pill red">${s.broken}</span>`
          : `<span class="pill">${s.broken}</span>`;
      return `
        <tr>
          <td><strong>${s.stage}</strong></td>
          <td>${s.waiting}</td>
          <td>${s.inProgress}</td>
          <td>${brokenCell}</td>
          <td>
            <div class="mini-bar" title="Load ${pct}%"><span style="width:${pct}%;"></span></div>
          </td>
        </tr>
      `;
    })
    .join("");
}

// =========================
// Alerts
// =========================
function renderAlerts() {
  const listEl = document.getElementById("alertsList");
  const data = DASHBOARD.alerts || [];

  if (!data.length) {
    listEl.innerHTML =
      '<div style="color:#6b7280; font-size:.8rem;">No alerts for now.</div>';
    return;
  }

  listEl.innerHTML = data
    .map(
      (a) => `
      <div class="alert-item alert-${a.type}">
        <div class="alert-dot alert-${a.type}-dot"></div>
        <div>
          <div class="alert-title">${a.title}</div>
          <div class="alert-meta">${a.meta}</div>
        </div>
      </div>
    `
    )
    .join("");
}

// =========================
// Audit
// =========================
function renderAudit() {
  const body = document.getElementById("auditBody");
  const data = DASHBOARD.audit || [];

  if (!data.length) {
    body.innerHTML = `<tr><td colspan="4" style="color:#6b7280; font-size:.85rem;">No recent activity.</td></tr>`;
    return;
  }

  body.innerHTML = data
    .slice(0, 6)
    .map(
      (x) => `
      <tr>
        <td>${x.time}</td>
        <td>${x.user}</td>
        <td><span class="pill blue">${x.action}</span></td>
        <td>${x.target}</td>
      </tr>
    `
    )
    .join("");
}

// =========================
// Order modal
// =========================
const orderModal = document.getElementById("orderModal");
const modalCloseBtn = document.getElementById("modalCloseBtn");

function openOrderModal(orderNo) {
  const o = (DASHBOARD.orders || []).find((x) => x.orderNo === orderNo);
  if (!o) return;

  document.getElementById("modalTitle").textContent = `Order #${o.orderNo}`;
  document.getElementById("modalMeta").textContent = `${o.client} • Qty: ${
    o.qty
  } • Progress: ${o.progressPct || 0}%`;

  const statusPill = document.getElementById("modalStatusPill");
  statusPill.textContent = o.status;
  statusPill.className =
    "pill " +
    (o.status === "Delayed"
      ? "red"
      : o.status === "Completed"
      ? "green"
      : "blue");

  const stagePill = document.getElementById("modalStagePill");
  stagePill.textContent = `Stage: ${o.stage || "—"}`;
  stagePill.className = "pill blue";

  const duePill = document.getElementById("modalDuePill");
  duePill.textContent = `Due: ${o.due || "—"}`;
  duePill.className = "pill";

  const brokenPill = document.getElementById("modalBrokenPill");
  brokenPill.textContent = `Broken today: ${o.brokenToday || 0}`;
  brokenPill.className = "pill " + (o.brokenToday ? "red" : "green");

  const tl = document.getElementById("modalTimeline");
  const stages = (DASHBOARD.stageLoad || []).map((x) => x.stage);
  const safeStages = stages.length
    ? stages
    : ["Cutting", "Grinding", "Washing", "Furnace", "Packing", "Delivery"];

  tl.innerHTML = safeStages
    .map((st) => {
      const cls = st === o.stage ? "pill blue" : "pill";
      return `
        <div class="tl-item">
          <div class="tl-left">
            <div class="tl-stage">${st}</div>
            <div class="tl-meta">Stage snapshot</div>
          </div>
          <div class="tl-right">
            <span class="${cls}">—</span>
          </div>
        </div>
      `;
    })
    .join("");

  orderModal.classList.add("active");
}

function closeOrderModal() {
  orderModal.classList.remove("active");
}

modalCloseBtn?.addEventListener("click", closeOrderModal);

document.getElementById("recentOrdersBody")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-open-order]");
  if (!btn) return;
  openOrderModal(btn.dataset.openOrder);
});

document
  .getElementById("orderSearch")
  ?.addEventListener("input", renderRecentOrders);

// ===== Quick actions =====
function openFilteredOrders(status) {
  window.location.href = `orders.html?status=${encodeURIComponent(status)}`;
}
window.openFilteredOrders = openFilteredOrders;

function scrollToAlerts() {
  document
    .getElementById("alertsSection")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}
window.scrollToAlerts = scrollToAlerts;

// ===== Fetch dashboard from backend =====
async function loadDashboard() {
  try {
    if (!user || !token) {
      window.location.replace("/index.html?logout=1");
      return;
    }

    if (chipUser) chipUser.textContent = `User: ${user.username || "Manager"}`;
    if (chipFactory) chipFactory.textContent = "Factory: Tripoli";

    const res = await fetch("/api/manager/dashboard", {
      headers: authHeaders(),
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      console.error("Dashboard API error:", data);
      return;
    }

    DASHBOARD.kpis = data.kpis || {};
    DASHBOARD.orders = data.orders || [];
    DASHBOARD.stageLoad = data.stageLoad || [];
    DASHBOARD.alerts = data.alerts || [];
    DASHBOARD.audit = data.audit || [];

    setLastUpdateNow();
    renderKpis();
    renderRecentOrders();
    renderStageLoad();
    renderAlerts();
    renderAudit();
  } catch (err) {
    console.error("loadDashboard failed:", err);
  }
}

document.getElementById("refreshBtn")?.addEventListener("click", loadDashboard);

// ===== Init =====
loadDashboard();
