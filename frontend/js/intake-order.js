// frontend/js/intake-order.js
(() => {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "null");

  if (!token || !user) {
    window.location.replace("/index.html?logout=1");
    return;
  }

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  });

  const els = {
    ioOrderNo: document.getElementById("ioOrderNo"),
    ioStatus: document.getElementById("ioStatus"),
    ioSummaryOrder: document.getElementById("ioSummaryOrder"),
    ioSummaryClient: document.getElementById("ioSummaryClient"),
    ioSummaryPrf: document.getElementById("ioSummaryPrf"),
    ioSummaryDelivery: document.getElementById("ioSummaryDelivery"),

    ioBulkAllBtn: document.getElementById("ioBulkAllBtn"),
    ioBulkThicknessSelect: document.getElementById("ioBulkThicknessSelect"),
    ioBulkThicknessBtn: document.getElementById("ioBulkThicknessBtn"),
    ioTotals: document.getElementById("ioTotals"),

    ioLinesBody: document.getElementById("ioLinesBody"),
    ioActivateBtn: document.getElementById("ioActivateBtn"),
  };

  const esc = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const setStatus = (msg, type = "info") => {
    if (!els.ioStatus) return;
    els.ioStatus.textContent = msg;
    els.ioStatus.className = `station-status-message ${type}`;
  };

  const formatDate = (d) => {
    if (!d) return "—";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "—";
    return dt.toISOString().slice(0, 10);
  };

  const getOrderId = () => {
    const p = new URLSearchParams(window.location.search);
    return Number(p.get("orderId") || 0);
  };

  const state = {
    orderId: 0,
    order: null,
    lines: [],
    selections: new Map(), // lineId -> { go, activateQty }
  };

  function renderOrderSummary() {
    const o = state.order || {};
    const orderNo = o.order_no || o.orderNo || "—";

    if (els.ioOrderNo) els.ioOrderNo.textContent = `Order: ${orderNo}`;
    if (els.ioSummaryOrder) els.ioSummaryOrder.textContent = orderNo;
    if (els.ioSummaryClient) els.ioSummaryClient.textContent = o.client || "—";
    if (els.ioSummaryPrf) els.ioSummaryPrf.textContent = o.prf || "—";
    if (els.ioSummaryDelivery)
      els.ioSummaryDelivery.textContent = formatDate(
        o.delivery_date || o.deliveryDate
      );
  }

  function computeRemaining(line) {
    const total = Number(line.qty || 0);
    const activated = Number(line.activated_qty || 0);
    return Math.max(0, total - activated);
  }

  function updateTotals() {
    let selectedLines = 0;
    let pieces = 0;

    state.lines.forEach((l) => {
      const sel = state.selections.get(l.id) || { go: false, activateQty: 0 };
      if (sel.go && sel.activateQty > 0) {
        selectedLines++;
        pieces += sel.activateQty;
      }
    });

    if (els.ioTotals) {
      els.ioTotals.textContent = `Selected lines: ${selectedLines} | Pieces to activate now: ${pieces}`;
    }
  }

  function renderThicknessOptions() {
    const set = new Set();
    state.lines.forEach((l) => {
      const t = String(l.glass_type || "").trim();
      if (t) set.add(t);
    });

    const list = Array.from(set).sort();
    if (els.ioBulkThicknessSelect) {
      els.ioBulkThicknessSelect.innerHTML = `<option value="">Activate by thickness…</option>`;
      list.forEach((t) => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        els.ioBulkThicknessSelect.appendChild(opt);
      });
    }
  }

  function renderLines() {
    if (!els.ioLinesBody) return;
    els.ioLinesBody.innerHTML = "";

    state.lines.forEach((l) => {
      const remaining = computeRemaining(l);

      if (!state.selections.has(l.id)) {
        state.selections.set(l.id, { go: false, activateQty: 0 });
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(l.id)}</td>
        <td>${esc(l.line_code || "—")}</td>
        <td>${esc(l.glass_type || l.size || l.notes || "—")}</td>
        <td>${Number(l.qty || 0)}</td>
        <td>${Number(l.activated_qty || 0)}</td>
        <td style="min-width:160px;">
          <input type="number" class="input" style="max-width:140px;"
                 min="0" max="${remaining}"
                 value="0"
                 data-qty="${l.id}"
                 placeholder="0..${remaining}" />
          <div style="color:#6b7280; font-size:0.72rem; margin-top:4px;">
            Remaining: ${remaining}
          </div>
        </td>
        <td>
          <input type="checkbox" data-go="${l.id}" />
        </td>
      `;
      els.ioLinesBody.appendChild(tr);
    });

    updateTotals();
  }

  function bindTableHandlers() {
    if (!els.ioLinesBody) return;

    els.ioLinesBody.addEventListener("input", (e) => {
      const inp = e.target.closest("[data-qty]");
      if (!inp) return;

      const lineId = Number(inp.getAttribute("data-qty"));
      const line = state.lines.find((x) => Number(x.id) === lineId);
      if (!line) return;

      const remaining = computeRemaining(line);
      let v = parseInt(inp.value || "0", 10);
      if (!Number.isFinite(v) || v < 0) v = 0;
      if (v > remaining) v = remaining;
      inp.value = String(v);

      const sel = state.selections.get(lineId) || { go: false, activateQty: 0 };
      sel.activateQty = v;
      state.selections.set(lineId, sel);

      updateTotals();
    });

    els.ioLinesBody.addEventListener("change", (e) => {
      const cb = e.target.closest("[data-go]");
      if (!cb) return;

      const lineId = Number(cb.getAttribute("data-go"));
      const sel = state.selections.get(lineId) || { go: false, activateQty: 0 };
      sel.go = cb.checked;
      state.selections.set(lineId, sel);

      updateTotals();
    });
  }

  function bulkActivateAllRemaining() {
    state.lines.forEach((l) => {
      const remaining = computeRemaining(l);
      state.selections.set(l.id, { go: remaining > 0, activateQty: remaining });

      const qtyInp = els.ioLinesBody?.querySelector(`[data-qty="${l.id}"]`);
      const goCb = els.ioLinesBody?.querySelector(`[data-go="${l.id}"]`);
      if (qtyInp) qtyInp.value = String(remaining);
      if (goCb) goCb.checked = remaining > 0;
    });

    updateTotals();
  }

  function bulkActivateByThickness() {
    const t = String(els.ioBulkThicknessSelect?.value || "").trim();
    if (!t) return;

    state.lines.forEach((l) => {
      const same = String(l.glass_type || "").trim() === t;
      const remaining = computeRemaining(l);
      const go = same && remaining > 0;

      state.selections.set(l.id, { go, activateQty: go ? remaining : 0 });

      const qtyInp = els.ioLinesBody?.querySelector(`[data-qty="${l.id}"]`);
      const goCb = els.ioLinesBody?.querySelector(`[data-go="${l.id}"]`);
      if (qtyInp) qtyInp.value = String(go ? remaining : 0);
      if (goCb) goCb.checked = go;
    });

    updateTotals();
  }

  async function loadLines() {
    try {
      setStatus("Loading lines…", "info");

      const res = await fetch(`/api/intake/orders/${state.orderId}/lines`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.replace("/index.html?logout=1");
        return;
      }

      if (!res.ok || !data.ok) {
        setStatus(`Failed to load lines: ${data.error || res.status}`, "error");
        if (els.ioLinesBody) {
          els.ioLinesBody.innerHTML = `<tr><td colspan="7" style="color:#dc2626; padding:12px;">Failed to load lines.</td></tr>`;
        }
        return;
      }

      state.lines = data.lines || [];
      renderThicknessOptions();
      renderLines();
      setStatus("Select lines + qty then click Send to Factory.", "success");
    } catch (e) {
      console.error(e);
      setStatus("Exception while loading lines.", "error");
    }
  }

  async function activate() {
    const lines = [];
    state.lines.forEach((l) => {
      const sel = state.selections.get(l.id);
      if (!sel || !sel.go || sel.activateQty <= 0) return;
      lines.push({ lineId: l.id, activateQty: sel.activateQty, go: true });
    });

    if (!lines.length) {
      setStatus("Select at least 1 line and quantity.", "error");
      return;
    }

    setStatus("Sending to factory…", "info");

    const res = await fetch("/api/intake/activate", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ orderId: state.orderId, lines }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.replace("/index.html?logout=1");
      return;
    }

    if (!res.ok || !data.ok) {
      setStatus(`Activate failed: ${data.error || res.status}`, "error");
      return;
    }

    setStatus(
      `Done ✅ Created pieces: ${Number(data.createdPieces || 0)}`,
      "success"
    );

    // ✅ رجّعك على intake بعد 700ms
    setTimeout(() => {
      window.location.href = "activation.html";
    }, 700);
  }

  function init() {
    state.orderId = getOrderId();
    if (!state.orderId) {
      setStatus("Missing orderId. Go back and open the order again.", "error");
      return;
    }

    const meta = JSON.parse(
      sessionStorage.getItem("intakeCurrentOrder") || "null"
    );
    state.order = meta || { order_no: `#${state.orderId}` };
    renderOrderSummary();

    bindTableHandlers();

    els.ioBulkAllBtn?.addEventListener("click", bulkActivateAllRemaining);
    els.ioBulkThicknessBtn?.addEventListener("click", bulkActivateByThickness);
    els.ioActivateBtn?.addEventListener("click", activate);

    loadLines();
  }

  init();
})();
