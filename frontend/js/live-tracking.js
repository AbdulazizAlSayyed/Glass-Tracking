(function () {
  // ✅ auth (if you use auth.js like orders.html)
  if (window.protectPage && !window.protectPage()) return;

  const el = (id) => document.getElementById(id);

  const STAGES = [
    "CUTTING",
    "GRINDING",
    "WASHING",
    "FURNACE",
    "LOADING",
    "DELIVERY",
  ];
  const REFRESH_SECONDS = 15;

  let allOrders = [];
  let timer = null;
  let countdown = REFRESH_SECONDS;

  function getAuthHeadersSafe() {
    if (window.getAuthHeaders) return window.getAuthHeaders();
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function getBasePathSafe() {
    if (window.getBasePath) return window.getBasePath();
    return "/"; // assumes same origin
  }

  function fmtTime(v) {
    const d = v ? new Date(v) : new Date();
    return d.toLocaleString();
  }

  function normalizeOrder(o) {
    // be tolerant with field names
    return {
      id: o.id ?? o.order_id ?? o.orderId,
      orderNo: o.order_no ?? o.orderNo ?? o.number ?? o.code ?? "—",
      client: o.client ?? o.customer ?? "—",
      pieces: o.pieces ?? o.pieces_count ?? o.qty ?? 0,
      stage: (o.stage ?? o.current_stage ?? o.station ?? "")
        .toString()
        .toUpperCase(),
      status: (o.status ?? "").toString().toLowerCase(), // draft/active/completed...
      isDelayed: !!(o.is_delayed ?? o.delayed ?? o.has_issue ?? o.problem),
    };
  }

  function pillClass(order) {
    // delayed > completed > in progress
    if (order.isDelayed) return "order-pill delayed";
    if (order.status === "completed") return "order-pill completed";
    return "order-pill in-progress";
  }

  function groupByStage(list) {
    const map = {};
    STAGES.forEach((s) => (map[s] = []));
    list.forEach((o) => {
      const st = STAGES.includes(o.stage) ? o.stage : "CUTTING";
      map[st].push(o);
    });
    return map;
  }

  function applyFilters(list) {
    const q = (el("searchInput").value || "").trim().toLowerCase();
    const stage = el("stageFilter").value;
    const includeCompleted = el("includeCompleted").checked;

    return list.filter((o) => {
      if (!includeCompleted && o.status === "completed") return false;
      if (stage !== "all" && o.stage !== stage) return false;
      if (!q) return true;

      return (
        String(o.orderNo).toLowerCase().includes(q) ||
        String(o.client).toLowerCase().includes(q)
      );
    });
  }

  function renderStages(grouped) {
    const container = el("stagesContainer");
    container.innerHTML = "";

    STAGES.forEach((stage) => {
      const orders = grouped[stage] || [];

      const col = document.createElement("div");
      col.className = "stage-column";

      col.innerHTML = `
        <div class="stage-header">
          <div class="stage-title">${stage}</div>
          <div class="stage-count">${orders.length} orders</div>
        </div>
        <div class="stage-list" style="overflow:auto; max-height:340px; padding-right:4px;">
          ${
            orders.length
              ? orders
                  .map(
                    (o) => `
                  <button class="${pillClass(o)}" data-id="${o.id}">
                    ${o.orderNo} · ${o.pieces} pcs · ${o.client}
                    ${o.isDelayed ? " (Delayed)" : ""}
                  </button>`
                  )
                  .join("")
              : `<button class="order-pill empty" type="button">No active orders</button>`
          }
        </div>
      `;

      container.appendChild(col);
    });

    // click => open details by id ✅
    container.querySelectorAll(".order-pill[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        if (!id) return;
        window.location.href = `order-details.html?id=${encodeURIComponent(
          id
        )}`;
      });
    });
  }

  function refreshUI() {
    const filtered = applyFilters(allOrders);
    const grouped = groupByStage(filtered);
    renderStages(grouped);
  }

  async function fetchLive() {
    const base = getBasePathSafe();
    const url = new URL(
      base + "api/live-tracking",
      window.location.origin
    ).toString();

    const res = await fetch(url, { headers: getAuthHeadersSafe() });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.ok === false) {
      el("stagesContainer").innerHTML = `
        <div class="stage-column">
          <div class="stage-header">
            <div class="stage-title">Error</div>
            <div class="stage-count">—</div>
          </div>
          <button class="order-pill delayed" type="button">Failed to load live tracking</button>
        </div>
      `;
      return;
    }

    const rawList = Array.isArray(data.orders)
      ? data.orders
      : Array.isArray(data)
      ? data
      : [];
    allOrders = rawList.map(normalizeOrder);

    el("lastUpdated").textContent =
      "Last update: " + fmtTime(data.updatedAt || Date.now());
    refreshUI();
  }

  function startCountdown() {
    if (timer) clearInterval(timer);
    countdown = REFRESH_SECONDS;

    timer = setInterval(() => {
      countdown--;
      el("refreshBadge").textContent = `Auto-refresh: ${countdown}s`;
      if (countdown <= 0) {
        countdown = REFRESH_SECONDS;
        fetchLive().catch(console.error);
      }
    }, 1000);
  }

  function initHeader() {
    // chips
    const user = JSON.parse(localStorage.getItem("user") || "null");
    el("userChip").textContent = `User: ${user?.username || "—"}`;
    el("chipFactory").textContent = `Factory: ${user?.factory || "Tripoli"}`;

    // logout
    el("logoutBtn").addEventListener("click", () => {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.replace("/index.html?logout=1");
    });

    // refresh now
    el("refreshNowBtn").addEventListener("click", () =>
      fetchLive().catch(console.error)
    );
  }

  function bindFilters() {
    ["searchInput", "stageFilter", "includeCompleted"].forEach((id) => {
      el(id).addEventListener("input", refreshUI);
      el(id).addEventListener("change", refreshUI);
    });

    el("resetBtn").addEventListener("click", () => {
      el("searchInput").value = "";
      el("stageFilter").value = "all";
      el("includeCompleted").checked = false;
      refreshUI();
    });
  }

  initHeader();
  bindFilters();
  fetchLive().catch(console.error);
  startCountdown();
})();
