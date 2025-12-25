// =============================
// Orders Page Logic
// =============================

const API_BASE = "/api/orders";

let currentPage = 1;
let pageSize = 20;
let totalPages = 1;
let lastFilters = {};

// =============================
// Get Token
// =============================
function getToken() {
  const t = localStorage.getItem("jwt");
  if (!t) {
    alert("Session expired. Please login again.");
    window.location.href = "index.html";
  }
  return t;
}

document.addEventListener("DOMContentLoaded", () => {
  loadOrders();

  document.getElementById("searchInput").addEventListener("input", () => {
    currentPage = 1;
    loadOrders();
  });

  document.getElementById("statusFilter").addEventListener("change", () => {
    currentPage = 1;
    loadOrders();
  });

  document.getElementById("stageFilter").addEventListener("change", () => {
    currentPage = 1;
    loadOrders();
  });

  document.getElementById("dateFrom").addEventListener("change", () => {
    currentPage = 1;
    loadOrders();
  });

  document.getElementById("dateTo").addEventListener("change", () => {
    currentPage = 1;
    loadOrders();
  });

  document.getElementById("includeCompleted").addEventListener("change", () => {
    currentPage = 1;
    loadOrders();
  });

  document.getElementById("prevPage").addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      loadOrders();
    }
  });

  document.getElementById("nextPage").addEventListener("click", () => {
    if (currentPage < totalPages) {
      currentPage++;
      loadOrders();
    }
  });
});

// =============================
// MAIN LOAD FUNCTION
// =============================
async function loadOrders() {
  const search = document.getElementById("searchInput").value.trim();
  const status = document.getElementById("statusFilter").value;
  const stage = document.getElementById("stageFilter").value;
  const dateFrom = document.getElementById("dateFrom").value;
  const dateTo = document.getElementById("dateTo").value;
  const includeCompleted = document.getElementById("includeCompleted").checked
    ? "1"
    : "0";

  const params = new URLSearchParams({
    q: search,
    status,
    stage,
    from: dateFrom,
    to: dateTo,
    incCompleted: includeCompleted,
    page: currentPage,
    pageSize,
  });

  lastFilters = { search, status, stage, dateFrom, dateTo, includeCompleted };

  try {
    const res = await fetch(`${API_BASE}?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
    });

    if (res.status === 401) {
      alert("Unauthorized. Please login again.");
      localStorage.removeItem("jwt");
      window.location.href = "index.html";
      return;
    }

    const data = await res.json();

    if (!data.ok) {
      console.log(data);
      alert("Error loading orders");
      return;
    }

    renderOrders(data.orders);
    renderPagination(data.page, data.pageSize, data.total);
  } catch (err) {
    console.error("Load Orders Error:", err);
    alert("Network error while loading orders");
  }
}

// =============================
// RENDER ORDERS TABLE
// =============================
function renderOrders(list) {
  const tbody = document.getElementById("ordersTableBody");
  tbody.innerHTML = "";

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:15px;">No orders found</td></tr>`;
    return;
  }

  list.forEach((o) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${o.order_no}</td>
      <td>${o.client}</td>
      <td>${o.prf || "-"}</td>
      <td>${o.status}</td>
      <td>${o.qty || 0}</td>
      <td>${o.current_stage || "-"}</td>
      <td>${o.delivery_date || "-"}</td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="openDetails(${o.id})">
          View
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

// =============================
// PAGINATION
// =============================
function renderPagination(page, pageSize, total) {
  currentPage = page;

  totalPages = Math.ceil(total / pageSize);
  if (totalPages < 1) totalPages = 1;

  document.getElementById(
    "pageInfo"
  ).textContent = `Page ${page} of ${totalPages}`;
}

// =============================
// OPEN ORDER DETAILS PAGE
// =============================
function openDetails(id) {
  window.location.href = `order-details.html?id=${id}`;
}
