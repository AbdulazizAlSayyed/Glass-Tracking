(function () {
  if (!window.protectPage || !window.protectPage()) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  const el = (id) => document.getElementById(id);

  let allLines = [];
  let allPieces = [];

  function fmtDateOnly(v) {
    if (!v) return "—";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toISOString().slice(0, 10);
  }

  function fmtDateTime(v) {
    if (!v) return "—";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
  }

  function statusPillClass(status) {
    const s = String(status || "").toLowerCase();
    if (s === "active") return "pill blue";
    if (s === "completed") return "pill green";
    if (s === "cancelled") return "pill red";
    if (s === "draft") return "pill gray";
    if (s === "paused") return "pill gray";
    return "pill gray";
  }

  function uniqueSorted(arr) {
    return [...new Set(arr.filter(Boolean))].sort((a, b) =>
      String(a).localeCompare(String(b))
    );
  }

  function fillSelectOptions(selectEl, values) {
    const current = selectEl.value;
    selectEl.innerHTML =
      `<option value="all">All</option>` +
      values
        .map((v) => {
          const safe = String(v);
          return `<option value="${safe}">${safe}</option>`;
        })
        .join("");
    // حاول نرجع نفس القيمة إذا موجودة
    if ([...selectEl.options].some((o) => o.value === current))
      selectEl.value = current;
  }

  // ---------------- Renderers ----------------
  function renderLines() {
    const q = (el("lineSearch")?.value || "").trim().toLowerCase();
    const glassType = el("lineGlassType")?.value || "all";

    let filtered = allLines.slice();

    if (glassType !== "all") {
      filtered = filtered.filter(
        (l) =>
          String(l.glass_type || "").toLowerCase() === glassType.toLowerCase()
      );
    }

    if (q) {
      filtered = filtered.filter((l) => {
        const code = String(l.line_code || "").toLowerCase();
        const gt = String(l.glass_type || "").toLowerCase();
        const notes = String(l.notes || "").toLowerCase();
        return code.includes(q) || gt.includes(q) || notes.includes(q);
      });
    }

    if (!filtered.length) {
      el(
        "linesTableBody"
      ).innerHTML = `<tr class="empty-row"><td colspan="5">No matching lines</td></tr>`;
      return;
    }

    el("linesTableBody").innerHTML = filtered
      .map(
        (l) => `
      <tr>
        <td>${l.line_code ?? "—"}</td>
        <td>${l.qty ?? 0}</td>
        <td>${l.size ?? "<span class='muted'>—</span>"}</td>
        <td>${l.glass_type ?? "<span class='muted'>—</span>"}</td>
        <td>${l.notes ? l.notes : "<span class='muted'>—</span>"}</td>
      </tr>
    `
      )
      .join("");
  }

  function renderPieces() {
    const q = (el("pieceSearch")?.value || "").trim().toLowerCase();
    const status = el("pieceStatus")?.value || "all";
    const station = el("pieceStation")?.value || "all";

    let filtered = allPieces.slice();

    if (status !== "all") {
      filtered = filtered.filter(
        (p) => String(p.status || "").toLowerCase() === status.toLowerCase()
      );
    }

    if (station !== "all") {
      filtered = filtered.filter(
        (p) =>
          String(p.station_name || p.station || "").toLowerCase() ===
          station.toLowerCase()
      );
    }

    if (q) {
      filtered = filtered.filter((p) =>
        String(p.piece_code || "")
          .toLowerCase()
          .includes(q)
      );
    }

    if (!filtered.length) {
      el(
        "piecesTableBody"
      ).innerHTML = `<tr class="empty-row"><td colspan="5">No matching pieces</td></tr>`;
      return;
    }

    el("piecesTableBody").innerHTML = filtered
      .map((p) => {
        const stationName = p.station_name || p.station || "—";
        return `
        <tr>
          <td>${p.piece_code ?? "—"}</td>
          <td>${p.status ?? "—"}</td>
          <td>${stationName}</td>
          <td>${
            p.broken_notes ? p.broken_notes : "<span class='muted'>—</span>"
          }</td>
          <td>${fmtDateTime(p.created_at)}</td>
        </tr>
      `;
      })
      .join("");
  }

  // ---------------- Wire Filters ----------------
  function bindFilters() {
    // Lines
    el("lineSearch")?.addEventListener("input", renderLines);
    el("lineGlassType")?.addEventListener("change", renderLines);
    el("resetLinesBtn")?.addEventListener("click", () => {
      el("lineSearch").value = "";
      el("lineGlassType").value = "all";
      renderLines();
    });

    // Pieces
    el("pieceSearch")?.addEventListener("input", renderPieces);
    el("pieceStatus")?.addEventListener("change", renderPieces);
    el("pieceStation")?.addEventListener("change", renderPieces);
    el("resetPiecesBtn")?.addEventListener("click", () => {
      el("pieceSearch").value = "";
      el("pieceStatus").value = "all";
      el("pieceStation").value = "all";
      renderPieces();
    });
  }

  async function fetchOrder() {
    if (!id) return;

    const base = window.getBasePath ? window.getBasePath() : "/";
    const url = new URL(
      base + `api/orders/${encodeURIComponent(id)}`,
      window.location.origin
    ).toString();

    const res = await fetch(url, {
      headers: window.getAuthHeaders ? window.getAuthHeaders() : {},
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      el(
        "linesTableBody"
      ).innerHTML = `<tr class="empty-row"><td colspan="5">Failed to load</td></tr>`;
      el(
        "piecesTableBody"
      ).innerHTML = `<tr class="empty-row"><td colspan="5">Failed to load</td></tr>`;
      return;
    }

    const order = data.order || {};
    allLines = Array.isArray(data.lines) ? data.lines : [];
    allPieces = Array.isArray(data.pieces) ? data.pieces : [];

    // Info
    el("pageTitle").textContent = `Order #${order.order_no ?? "—"}`;
    el("pageSub").textContent = `${order.client ?? "—"} • ${fmtDateOnly(
      order.delivery_date
    )}`;

    el("orderNo").textContent = order.order_no ?? "—";
    el("client").textContent = order.client ?? "—";
    el("prf").textContent = order.prf ?? "—";
    el("deliveryDate").textContent = fmtDateOnly(order.delivery_date);
    el("createdAt").textContent = fmtDateTime(order.created_at);

    const status = order.status ?? "—";
    const sp = el("statusPill");
    sp.textContent = status;
    sp.className = statusPillClass(status);

    // ✅ Fill dropdown options dynamically
    const glassTypes = uniqueSorted(allLines.map((l) => l.glass_type));
    fillSelectOptions(el("lineGlassType"), glassTypes);

    const stations = uniqueSorted(
      allPieces.map((p) => p.station_name || p.station)
    );
    fillSelectOptions(el("pieceStation"), stations);

    // Render initial
    renderLines();
    renderPieces();
    bindFilters();
  }

  fetchOrder().catch((e) => console.error(e));
})();
