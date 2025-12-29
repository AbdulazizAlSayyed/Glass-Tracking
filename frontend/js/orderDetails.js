const API_BASE = "/api/orders";
const token = localStorage.getItem("token");

function authHeaders() {
  return { Authorization: `Bearer ${token}` };
}

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("id");
  if (!orderId) return alert("Invalid order id");
  loadOrderDetails(orderId);
});

async function loadOrderDetails(orderId) {
  try {
    const res = await fetch(`${API_BASE}/${orderId}`, {
      headers: authHeaders(),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "index.html";
      return;
    }

    if (!res.ok || !data.ok) {
      alert(data.error || "Order not found");
      return;
    }

    renderOrderInfo(data.order);
    renderLines(data.lines || []);
    renderPieces(data.pieces || []);
  } catch (err) {
    console.error("Order Details Error:", err);
    alert("Network error");
  }
}

function renderOrderInfo(order) {
  document.getElementById("orderNo").textContent = order.order_no;
  document.getElementById("client").textContent = order.client;
  document.getElementById("prf").textContent = order.prf || "-";
  document.getElementById("deliveryDate").textContent =
    order.delivery_date || "-";
  document.getElementById("status").textContent = order.status;
  document.getElementById("createdAt").textContent = order.created_at || "-";
}

function renderLines(lines) {
  const tbody = document.getElementById("linesTableBody");
  tbody.innerHTML = "";

  if (!lines.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No lines found</td></tr>`;
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

function renderPieces(pieces) {
  const tbody = document.getElementById("piecesTableBody");
  tbody.innerHTML = "";

  if (!pieces.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No glass pieces found</td></tr>`;
    return;
  }

  pieces.forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.piece_code}</td>
      <td>${p.status}</td>
      <td>${p.station_name || "-"}</td>
      <td>${p.broken_notes || "-"}</td>
      <td>${p.created_at || "-"}</td>
    `;
    tbody.appendChild(tr);
  });
}
