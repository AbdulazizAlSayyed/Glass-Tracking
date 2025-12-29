let currentPage = 1;
let totalPages = 1;

const els = {
  searchInput: document.getElementById("searchInput"),
  statusFilter: document.getElementById("statusFilter"),
  stageFilter: document.getElementById("stageFilter"),
  dateFrom: document.getElementById("dateFrom"),
  dateTo: document.getElementById("dateTo"),
  includeCompleted: document.getElementById("includeCompleted"),
  body: document.getElementById("ordersTableBody"),
  prev: document.getElementById("prevPage"),
  next: document.getElementById("nextPage"),
  pageInfo: document.getElementById("pageInfo"),
};

function debounce(fn, ms = 350) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function rowEmpty(text) {
  return `<tr><td colspan="8" style="text-align:center; color:#6b7280;">${text}</td></tr>`;
}

function readUrlFilters() {
  const p = new URLSearchParams(location.search);

  // status from manager dashboard like ?status=Draft
  const status = p.get("status");
  if (status && els.statusFilter) els.statusFilter.value = status;

  const q = p.get("q");
  if (q && els.searchInput) els.searchInput.value = q;

  const stage = p.get("stage");
  if (stage && els.stageFilter) els.stageFilter.value = stage;

  const from = p.get("from");
  if (from && els.dateFrom) els.dateFrom.value = from;

  const to = p.get("to");
  if (to && els.dateTo) els.dateTo.value = to;

  const inc = p.get("incCompleted");
  if (inc && els.includeCompleted) els.includeCompleted.checked = inc === "1";
}

function buildQuery(page) {
  const q = (els.searchInput?.value || "").trim();
  const status = (els.statusFilter?.value || "all").trim();
  const stage = (els.stageFilter?.value || "all").trim();
  const from = (els.dateFrom?.value || "").trim();
  const to = (els.dateTo?.value || "").trim();
  const incCompleted = els.includeCompleted?.checked ? "1" : "0";

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", "10");

  if (q) params.set("q", q);
  if (status && status !== "all") params.set("status", status);
  if (stage && stage !== "all") params.set("stage", stage);
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  // important: backend expects incCompleted="0" to exclude completed
  params.set("incCompleted", incCompleted);

  return params.toString();
}

async function loadOrders(page = 1) {
  try {
    currentPage = page;

    if (els.body) els.body.innerHTML = rowEmpty("Loading...");

    const basePath = window.getBasePath ? window.getBasePath() : "/";
    const url = new URL(
      `${basePath}api/orders?${buildQuery(page)}`,
      location.origin
    ).toString();

    const res = await fetch(url, {
      headers: window.getAuthHeaders ? window.getAuthHeaders() : {},
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      throw new Error(
        data?.message || data?.error || `Server error (${res.status})`
      );
    }

    const orders = Array.isArray(data.orders) ? data.orders : [];
    totalPages = data.pagination?.totalPages || 1;

    if (!orders.length) {
      els.body.innerHTML = rowEmpty("No orders found");
    } else {
      els.body.innerHTML = orders
        .map((o) => {
          const stage = o.current_stage || "—";
          const delivery = o.delivery_date || "—";
          const prf = o.prf || "—";
          const pieces = o.total_pieces ?? o.totalPieces ?? 0;

          return `
            <tr>
              <td>${o.order_no ?? "—"}</td>
              <td>${o.client ?? "—"}</td>
              <td>${prf}</td>
              <td>${o.status ?? "—"}</td>
              <td>${pieces}</td>
              <td>${stage}</td>
              <td>${delivery}</td>
              <td>
                <a class="btn btn-primary btn-small" href="order-details.html?id=${encodeURIComponent(
                  o.id
                )}">Open</a>
              </td>
            </tr>
          `;
        })
        .join("");
    }

    if (els.pageInfo)
      els.pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    if (els.prev) els.prev.disabled = currentPage <= 1;
    if (els.next) els.next.disabled = currentPage >= totalPages;
  } catch (err) {
    console.error("orders.js error:", err);
    if (els.body)
      els.body.innerHTML = rowEmpty(err.message || "Error loading orders");
  }
}

const reloadDebounced = debounce(() => loadOrders(1), 350);

function wireEvents() {
  els.searchInput?.addEventListener("input", reloadDebounced);
  els.statusFilter?.addEventListener("change", () => loadOrders(1));
  els.stageFilter?.addEventListener("change", () => loadOrders(1));
  els.dateFrom?.addEventListener("change", () => loadOrders(1));
  els.dateTo?.addEventListener("change", () => loadOrders(1));
  els.includeCompleted?.addEventListener("change", () => loadOrders(1));

  els.prev?.addEventListener("click", () => {
    if (currentPage > 1) loadOrders(currentPage - 1);
  });

  els.next?.addEventListener("click", () => {
    if (currentPage < totalPages) loadOrders(currentPage + 1);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  readUrlFilters();
  wireEvents();
  loadOrders(1);
});
