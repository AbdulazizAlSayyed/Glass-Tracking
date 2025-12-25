(() => {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "null");

  const els = {
    orderNo: document.getElementById("ioOrderNo"),
    subtitle: document.getElementById("ioSubtitle"),
    status: document.getElementById("ioStatus"),

    sumOrder: document.getElementById("ioSummaryOrder"),
    sumClient: document.getElementById("ioSummaryClient"),
    sumPrf: document.getElementById("ioSummaryPrf"),
    sumDelivery: document.getElementById("ioSummaryDelivery"),

    bulkAllBtn: document.getElementById("ioBulkAllBtn"),
    bulkThicknessSelect: document.getElementById("ioBulkThicknessSelect"),
    bulkThicknessBtn: document.getElementById("ioBulkThicknessBtn"),

    totals: document.getElementById("ioTotals"),
    linesBody: document.getElementById("ioLinesBody"),
    activateBtn: document.getElementById("ioActivateBtn"),
  };

  const params = new URLSearchParams(window.location.search);
  const orderId = parseInt(params.get("orderId") || "0", 10);

  let currentOrderMeta = null;

  function authHeaders(json = false) {
    const h = { Authorization: `Bearer ${token}` };
    if (json) h["Content-Type"] = "application/json";
    return h;
  }

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDate(d) {
    if (!d) return "—";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "—";
    return dt.toISOString().slice(0, 10);
  }

  function setStatus(msg, type = "info") {
    if (!els.status) return;
    const colors = {
      info: "#6b7280",
      success: "#16a34a",
      error: "#dc2626",
    };
    els.status.style.color = colors[type] || colors.info;
    els.status.textContent = msg;
  }

  // -------- Load meta from sessionStorage (from activation.js) --------
  function loadMetaFromSession() {
    try {
      const raw = sessionStorage.getItem("intakeCurrentOrder");
      if (!raw) return;
      const o = JSON.parse(raw);
      if (!o || !o.id || o.id !== orderId) return;
      currentOrderMeta = o;

      els.orderNo.textContent = o.order_no || o.id;
      els.sumOrder.textContent = o.order_no || o.id;
      els.sumClient.textContent = o.client || "—";
      els.sumPrf.textContent = o.prf || "—";
      els.sumDelivery.textContent = formatDate(o.delivery_date);
    } catch (e) {
      console.warn("meta parse error", e);
    }
  }

  function fallbackMetaIfNeeded() {
    if (currentOrderMeta) return;
    els.orderNo.textContent = orderId || "—";
    els.sumOrder.textContent = orderId || "—";
  }

  // -------- Load lines --------
  async function loadLines() {
    if (!orderId || Number.isNaN(orderId)) {
      setStatus("Missing orderId in URL.", "error");
      return;
    }

    try {
      setStatus("Loading lines…", "info");
      els.linesBody.innerHTML =
        '<tr><td colspan="8" style="padding:12px; color:#6b7280;">Loading…</td></tr>';

      const res = await fetch(`/api/intake/orders/${orderId}/lines`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        els.linesBody.innerHTML = `
          <tr>
            <td colspan="8" style="padding:12px; color:#dc2626;">
              Failed to load lines: ${esc(data.error || res.status)}
            </td>
          </tr>`;
        setStatus("Failed to load lines.", "error");
        return;
      }

      const lines = data.lines || [];
      if (!lines.length) {
        els.linesBody.innerHTML = `
          <tr>
            <td colspan="8" style="padding:12px; color:#6b7280;">
              No lines found for this order.
            </td>
          </tr>`;
        setStatus("No lines for this order.", "info");
        return;
      }

      renderLines(lines);
      setStatus("Ready – choose qty then click “Send to Factory”.", "success");
    } catch (e) {
      console.error("loadLines", e);
      els.linesBody.innerHTML = `
        <tr>
          <td colspan="8" style="padding:12px; color:#dc2626;">
            Exception while loading lines: ${esc(e.message || e)}
          </td>
        </tr>`;
      setStatus("Exception while loading lines.", "error");
    }
  }

  function fillThicknessDropdown(lines) {
    const select = els.bulkThicknessSelect;
    if (!select) return;
    const seen = new Set();
    select.innerHTML = `<option value="">Activate by thickness…</option>`;

    lines.forEach((ln) => {
      const t = (ln.glass_type || "").trim();
      if (!t || seen.has(t)) return;
      seen.add(t);
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      select.appendChild(opt);
    });
  }

  function renderLines(lines) {
    els.linesBody.innerHTML = "";

    lines.forEach((ln) => {
      const remaining = Math.max(
        0,
        Number(ln.qty || 0) - Number(ln.activated_qty || 0)
      );

      const tr = document.createElement("tr");
      tr.dataset.lineId = ln.id;
      tr.dataset.totalQty = ln.qty || 0;
      tr.dataset.activated = ln.activated_qty || 0;
      tr.dataset.remaining = remaining;
      tr.dataset.thickness = ln.glass_type || "";

      tr.innerHTML = `
        <td>${esc(ln.line_code || "—")}</td>
        <td>${esc(ln.line_code || "—")}</td>
        <td>${esc(ln.glass_type || ln.size || "—")}</td>
        <td>${Number(ln.qty || 0)}</td>
        <td>${Number(ln.activated_qty || 0)}</td>
        <td>
          <input type="number"
                 class="input io-activate-input"
                 min="0"
                 max="${remaining}"
                 value="0"
                 style="max-width:80px;" />
          <div style="font-size:0.7rem; color:#6b7280;">
            Remaining: ${remaining}
          </div>
        </td>
        <td>
          <select class="input io-priority-select" style="max-width:90px;">
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </td>
        <td style="text-align:center;">
          <input type="checkbox" class="io-go-checkbox" />
        </td>
      `;

      els.linesBody.appendChild(tr);
    });

    els.linesBody
      .querySelectorAll(".io-activate-input, .io-go-checkbox")
      .forEach((el) => {
        el.addEventListener("input", recalcTotals);
        el.addEventListener("change", recalcTotals);
      });

    fillThicknessDropdown(lines);
    recalcTotals();
  }

  function recalcTotals() {
    const rows = els.linesBody.querySelectorAll("tr");
    let lines = 0;
    let pieces = 0;

    rows.forEach((tr) => {
      const input = tr.querySelector(".io-activate-input");
      const chk = tr.querySelector(".io-go-checkbox");
      if (!input || !chk || !chk.checked) return;
      const v = Number(input.value || 0);
      if (v > 0) {
        lines++;
        pieces += v;
      }
    });

    if (els.totals) {
      els.totals.textContent = `Selected lines: ${lines} | Pieces to activate now: ${pieces}`;
    }
  }

  // -------- Bulk actions --------
  function bulkActivateAll() {
    const rows = els.linesBody.querySelectorAll("tr");
    rows.forEach((tr) => {
      const remaining = Number(tr.dataset.remaining || 0);
      const input = tr.querySelector(".io-activate-input");
      const chk = tr.querySelector(".io-go-checkbox");
      if (!input || !chk) return;

      if (remaining > 0) {
        input.value = remaining;
        chk.checked = true;
      } else {
        input.value = 0;
      }
    });

    recalcTotals();
    setStatus("All remaining pieces selected for activation.", "info");
  }

  function bulkActivateByThickness() {
    const select = els.bulkThicknessSelect;
    if (!select || !select.value) {
      setStatus("Choose a thickness first.", "error");
      return;
    }

    const target = select.value;
    let affectedLines = 0;
    let affectedPieces = 0;

    const rows = els.linesBody.querySelectorAll("tr");
    rows.forEach((tr) => {
      const thickness = (tr.dataset.thickness || "").trim();
      if (thickness !== target) return;

      const remaining = Number(tr.dataset.remaining || 0);
      const input = tr.querySelector(".io-activate-input");
      const chk = tr.querySelector(".io-go-checkbox");
      if (!input || !chk) return;

      if (remaining > 0) {
        input.value = remaining;
        chk.checked = true;
        affectedLines++;
        affectedPieces += remaining;
      }
    });

    if (affectedLines === 0) {
      setStatus(`No remaining pieces found for thickness "${target}".`, "info");
    } else {
      setStatus(
        `Selected ${affectedLines} line(s) – ${affectedPieces} piece(s) for thickness "${target}".`,
        "success"
      );
    }

    recalcTotals();
  }

  // -------- Send to Factory --------
  async function sendToFactory() {
    if (!orderId) return;

    const rows = els.linesBody.querySelectorAll("tr");
    const lines = [];

    rows.forEach((tr) => {
      const lineId = Number(tr.dataset.lineId || 0);
      const input = tr.querySelector(".io-activate-input");
      const chk = tr.querySelector(".io-go-checkbox");
      const prioSel = tr.querySelector(".io-priority-select");
      if (!lineId || !input || !chk) return;

      const qty = Number(input.value || 0);
      const go = chk.checked && qty > 0;
      const priority = prioSel ? prioSel.value : "normal";

      lines.push({
        lineId,
        activateQty: qty,
        priority,
        go,
      });
    });

    const toSend = lines.filter((x) => x.go && x.activateQty > 0);
    if (!toSend.length) {
      setStatus("Select at least one line with qty > 0.", "error");
      return;
    }

    setStatus("Sending to factory…", "info");

    try {
      const res = await fetch("/api/intake/activate", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          orderId,
          lines: toSend,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        console.error("activate error:", res.status, data);
        setStatus(data.error || "Activation failed (server error).", "error");
        return;
      }

      setStatus(
        `Activation done ✅ Pieces created: ${
          data.createdPieces || 0
        } (lines: ${data.touchedLines || 0}).`,
        "success"
      );

      // بعد ما يخلص رجّع المستخدم على قائمة الـ Intake
      setTimeout(() => {
        window.location.href = "activation.html";
      }, 800);
    } catch (e) {
      console.error("sendToFactory", e);
      setStatus("Activation failed (network/server).", "error");
    }
  }

  // -------- Init --------
  function init() {
    if (!orderId || Number.isNaN(orderId)) {
      setStatus("Missing or invalid orderId.", "error");
      return;
    }

    loadMetaFromSession();
    fallbackMetaIfNeeded();

    els.bulkAllBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      bulkActivateAll();
    });
    els.bulkThicknessBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      bulkActivateByThickness();
    });
    els.activateBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      sendToFactory();
    });

    loadLines();
  }

  init();
})();
