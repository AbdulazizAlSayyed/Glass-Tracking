(function () {
  if (window.protectPage && !window.protectPage()) return;

  const REFRESH_SECONDS = 15;
  const el = (id) => document.getElementById(id);

  let allStations = [];
  let timer = null;
  let countdown = REFRESH_SECONDS;

  function getAuthHeadersSafe() {
    if (window.getAuthHeaders) return window.getAuthHeaders();
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function getBasePathSafe() {
    if (window.getBasePath) return window.getBasePath();
    return "/";
  }

  function fmtTime(v) {
    const d = v ? new Date(v) : new Date();
    return d.toLocaleString();
  }

  function pillClass(order) {
    if (order.state === "delayed") return "order-pill delayed";
    return "order-pill in-progress";
  }

  function fillStationFilter() {
    const sel = el("stationFilter");
    if (!sel) return;

    const current = sel.value || "all";
    sel.innerHTML =
      `<option value="all">All</option>` +
      allStations
        .map((s) => `<option value="${s.id}">${s.name}</option>`)
        .join("");

    if ([...sel.options].some((o) => o.value === current)) sel.value = current;
  }

  function applyFilters(stations) {
    const q = (el("searchInput")?.value || "").trim().toLowerCase();
    const stationId = el("stationFilter")?.value || "all";
    const onlyDelayed = !!el("onlyDelayed")?.checked;

    return stations
      .filter(
        (st) => stationId === "all" || String(st.id) === String(stationId)
      )
      .map((st) => {
        let orders = Array.isArray(st.orders) ? st.orders : [];

        if (onlyDelayed) {
          orders = orders.filter((o) => o.state === "delayed");
        }

        if (q) {
          orders = orders.filter((o) => {
            return (
              String(o.orderNo || "")
                .toLowerCase()
                .includes(q) ||
              String(o.client || "")
                .toLowerCase()
                .includes(q)
            );
          });
        }

        return { ...st, orders };
      });
  }

  function renderStations(stations) {
    const container = el("stagesContainer");
    container.innerHTML = "";

    if (!stations.length) {
      container.innerHTML = `
        <div class="stage-column">
          <div class="stage-header">
            <div class="stage-title">No stations</div>
            <div class="stage-count">—</div>
          </div>
          <button class="order-pill empty" type="button">No active stations found</button>
        </div>
      `;
      return;
    }

    stations.forEach((st) => {
      const orders = Array.isArray(st.orders) ? st.orders : [];

      const col = document.createElement("div");
      col.className = "stage-column";

      col.innerHTML = `
        <div class="stage-header">
          <div class="stage-title">${st.name}</div>
          <div class="stage-count">${orders.length} orders</div>
        </div>

        <div class="stage-list">
          ${
            orders.length
              ? orders
                  .map(
                    (o) => `
                      <button class="${pillClass(o)}" data-order-id="${
                      o.orderId
                    }">
                        ${o.orderNo} · ${o.pieces} pcs · ${o.client}
                        ${o.state === "delayed" ? " (Delayed)" : ""}
                      </button>
                    `
                  )
                  .join("")
              : `<button class="order-pill empty" type="button">No active orders</button>`
          }
        </div>
      `;

      container.appendChild(col);
    });

    // click => open order details by id
    container.querySelectorAll("button[data-order-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-order-id");
        if (!id) return;
        window.location.href = `order-details.html?id=${encodeURIComponent(
          id
        )}`;
      });
    });
  }

  function refreshUI() {
    const filteredStations = applyFilters(allStations);
    renderStations(filteredStations);
  }

  async function fetchLive() {
    const base = getBasePathSafe();
    const url = new URL(base + "api/live-tracking", location.origin).toString();

    const res = await fetch(url, {
      headers: getAuthHeadersSafe(),
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.replace("/index.html?logout=1");
      return;
    }

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
      el("lastUpdated").textContent = "";
      return;
    }

    allStations = Array.isArray(data.stations) ? data.stations : [];
    allStations.sort(
      (a, b) => Number(a.stageOrder || 0) - Number(b.stageOrder || 0)
    );

    fillStationFilter();
    refreshUI();

    el("lastUpdated").textContent =
      "Last update: " + fmtTime(data.updatedAt || Date.now());
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

  function bindUI() {
    ["searchInput", "stationFilter", "onlyDelayed"].forEach((id) => {
      el(id)?.addEventListener("input", refreshUI);
      el(id)?.addEventListener("change", refreshUI);
    });

    el("refreshNowBtn")?.addEventListener("click", () =>
      fetchLive().catch(console.error)
    );

    el("resetBtn")?.addEventListener("click", () => {
      el("searchInput").value = "";
      el("stationFilter").value = "all";
      el("onlyDelayed").checked = false;
      refreshUI();
    });
  }

  bindUI();
  fetchLive().catch(console.error);
  startCountdown();
})();
