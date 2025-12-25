// =============================
// Order Details Page Logic
// =============================

const API_BASE = "/api/orders";

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("id");

  if (!orderId) {
    alert("Invalid order id");
    return;
  }

  loadOrderDetails(orderId);
});

// =============================
// LOAD ORDER DETAILS
// =============================
async function loadOrderDetails(orderId) {
  try {
    const res = await fetch(`${API_BASE}/${orderId}`);
    const data = await res.json();

    if (!data.ok) {
      alert("Order not found");
      return;
    }

    renderOrderInfo(data.order);
    renderLines(data.lines);
    renderPieces(data.pieces);
  } catch (err) {
    console.error("Order Details Error:", err);
  }
}

// =============================
// ORDER INFO
// =============================
function renderOrderInfo(order) {
  document.getElementById("orderNo").textContent = order.order_no;
  document.getElementById("client").textContent = order.client;
  document.getElementById("prf").textContent = order.prf || "-";
  document.getElementById("deliveryDate").textContent =
    order.delivery_date || "-";
  document.getElementById("status").textContent = order.status;
  document.getElementById("createdAt").textContent = order.created_at;
}

// =============================
// RENDER LINES
// =============================
function renderLines(lines) {
  const tbody = document.getElementById("linesTableBody");
  tbody.innerHTML = "";

  if (!lines.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No lines found</td></tr>`;
    return;
  }

  lines.forEach((ln) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${ln.line_code}</td>
      <td>${ln.qty}</td>
      <td>${ln.size || "-"}</td>
      <td>${ln.glass_type || "-"}</td>
      <td>${ln.notes || "-"}</td>
    `;

    tbody.appendChild(tr);
  });
}

// =============================
// RENDER PIECES
// =============================
function renderPieces(pieces) {
  const tbody = document.getElementById("piecesTableBody");
  tbody.innerHTML = "";

  if (!pieces.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No glass pieces found</td></tr>`;
    return;
  }

  pieces.forEach((p) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${p.piece_code}</td>
      <td>${p.status}</td>
      <td>${p.station_name || "-"}</td>
      <td>${p.broken_reason || "-"}</td>
      <td>${p.created_at}</td>
    `;

    tbody.appendChild(tr);
  });
}
