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
    lines: [], // now: pane-records
    selections: new Map(), // pane_key -> { go, activateQty }
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

  function computeRemaining(paneRow) {
    // backend now returns remaining_panes directly
    return Math.max(0, Number(paneRow.remaining_panes || 0));
  }

  function updateTotals() {
    let selectedRecords = 0;
    let panes = 0;

    state.lines.forEach((r) => {
      const key = r.pane_key;
      const sel = state.selections.get(key) || { go: false, activateQty: 0 };
      if (sel.go && sel.activateQty > 0) {
        selectedRecords++;
        panes += sel.activateQty;
      }
    });

    if (els.ioTotals) {
      els.ioTotals.textContent = `Selected records: ${selectedRecords} | Panes to activate now: ${panes}`;
    }
  }

  function renderSpecOptions() {
    const set = new Set();
    state.lines.forEach((r) => {
      const spec = String(r.pane_type || "").trim();
      if (spec && spec !== "—") set.add(spec);
    });

    const list = Array.from(set).sort();
    if (els.ioBulkThicknessSelect) {
      els.ioBulkThicknessSelect.innerHTML = `<option value="">Activate by spec…</option>`;
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

    state.lines.forEach((r) => {
      const remaining = computeRemaining(r);
      const key = r.pane_key;

      if (!state.selections.has(key)) {
        state.selections.set(key, { go: false, activateQty: 0 });
      }

      const activated = Number(r.activated_panes || 0);
      const needed = Number(r.needed_panes || 0);

      // ✅ Type/Size cell: top = pane_type, bottom = size (REAL)
      const typeLine = esc(r.pane_type || "—");
      const sizeLine = esc(r.size || "—");

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(r.line_id)}</td>
        <td>${esc(r.line_code || "—")}</td>
        <td>
          <div style="font-weight:700;">${typeLine}</div>
          <div style="color:#64748b; font-size:0.85rem; margin-top:2px;">${sizeLine}</div>
        </td>
        <td>${Number(r.qty_units || 0)}</td>
        <td>
          <div style="font-weight:600;">${activated} / ${needed}</div>
          <div style="color:#64748b; font-size:0.8rem;">Activated panes / Needed panes</div>
        </td>
        <td style="min-width:160px;">
          <input type="number" class="input" style="max-width:140px;"
                 min="0" max="${remaining}"
                 value="0"
                 data-qty="${esc(key)}"
                 placeholder="0..${remaining}" />
          <div style="color:#6b7280; font-size:0.72rem; margin-top:4px;">
            Remaining: ${remaining}
          </div>
        </td>
        <td>
          <input type="checkbox" data-go="${esc(key)}" />
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

      const key = String(inp.getAttribute("data-qty") || "");
      const row = state.lines.find((x) => String(x.pane_key) === key);
      if (!row) return;

      const remaining = computeRemaining(row);
      let v = parseInt(inp.value || "0", 10);
      if (!Number.isFinite(v) || v < 0) v = 0;
      if (v > remaining) v = remaining;
      inp.value = String(v);

      const sel = state.selections.get(key) || { go: false, activateQty: 0 };
      sel.activateQty = v;
      state.selections.set(key, sel);

      updateTotals();
    });

    els.ioLinesBody.addEventListener("change", (e) => {
      const cb = e.target.closest("[data-go]");
      if (!cb) return;

      const key = String(cb.getAttribute("data-go") || "");
      const sel = state.selections.get(key) || { go: false, activateQty: 0 };
      sel.go = cb.checked;
      state.selections.set(key, sel);

      updateTotals();
    });
  }

  function bulkActivateAllRemaining() {
    state.lines.forEach((r) => {
      const remaining = computeRemaining(r);
      const key = r.pane_key;

      state.selections.set(key, { go: remaining > 0, activateQty: remaining });

      const qtyInp = els.ioLinesBody?.querySelector(
        `[data-qty="${CSS.escape(key)}"]`
      );
      const goCb = els.ioLinesBody?.querySelector(
        `[data-go="${CSS.escape(key)}"]`
      );
      if (qtyInp) qtyInp.value = String(remaining);
      if (goCb) goCb.checked = remaining > 0;
    });

    updateTotals();
  }

  function bulkActivateBySpec() {
    const t = String(els.ioBulkThicknessSelect?.value || "").trim();
    if (!t) return;

    state.lines.forEach((r) => {
      const same = String(r.pane_type || "").trim() === t;
      const remaining = computeRemaining(r);
      const go = same && remaining > 0;

      const key = r.pane_key;

      state.selections.set(key, { go, activateQty: go ? remaining : 0 });

      const qtyInp = els.ioLinesBody?.querySelector(
        `[data-qty="${CSS.escape(key)}"]`
      );
      const goCb = els.ioLinesBody?.querySelector(
        `[data-go="${CSS.escape(key)}"]`
      );
      if (qtyInp) qtyInp.value = String(go ? remaining : 0);
      if (goCb) goCb.checked = go;
    });

    updateTotals();
  }

  async function loadLines() {
    try {
      setStatus("Loading records…", "info");

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
        setStatus(`Failed to load: ${data.error || res.status}`, "error");
        if (els.ioLinesBody) {
          els.ioLinesBody.innerHTML = `<tr><td colspan="7" style="color:#dc2626; padding:12px;">Failed to load.</td></tr>`;
        }
        return;
      }

      state.lines = data.lines || [];
      renderSpecOptions();
      renderLines();
      setStatus("Select records + qty then click Send to Factory.", "success");
    } catch (e) {
      console.error(e);
      setStatus("Exception while loading records.", "error");
    }
  }

  async function activate() {
    const lines = [];

    state.lines.forEach((r) => {
      const key = r.pane_key;
      const sel = state.selections.get(key);
      if (!sel || !sel.go || sel.activateQty <= 0) return;

      lines.push({
        lineId: r.line_id,
        paneLabel: r.pane_label, // "A" | "B" | null
        paneType: r.pane_type, // "6 MM F GRAY" etc
        activateQty: sel.activateQty,
        go: true,
      });
    });

    if (!lines.length) {
      setStatus("Select at least 1 record and quantity.", "error");
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
      `Done ✅ Created panes: ${Number(data.createdPieces || 0)}`,
      "success"
    );

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
    els.ioBulkThicknessBtn?.addEventListener("click", bulkActivateBySpec);
    els.ioActivateBtn?.addEventListener("click", activate);

    loadLines();
  }

  init();
})();
