(() => {
  const token = localStorage.getItem("token");

  const els = {
    userChip: document.getElementById("userChip"),

    statImported: document.getElementById("statImported"),
    statDraft: document.getElementById("statDraft"),
    statLastImport: document.getElementById("statLastImport"),
    statWarnings: document.getElementById("statWarnings"),

    file: document.getElementById("noriaFile"),
    fileMeta: document.getElementById("fileMeta"),

    prf: document.getElementById("prfInput"),
    deliveryDate: document.getElementById("deliveryDateInput"),
    client: document.getElementById("clientInput"),
    orderNo: document.getElementById("orderNoInput"),

    previewBtn: document.getElementById("previewBtn"),
    resetBtn: document.getElementById("resetBtn"),

    importStatus: document.getElementById("importStatus"),

    previewCard: document.getElementById("previewCard"),
    pvOrderNo: document.getElementById("pvOrderNo"),
    pvClient: document.getElementById("pvClient"),
    pvLines: document.getElementById("pvLines"),
    pvPieces: document.getElementById("pvPieces"),
    checksBox: document.getElementById("checksBox"),
    previewBody: document.getElementById("previewBody"),

    createDraftBtn: document.getElementById("createDraftBtn"),
    closePreviewBtn: document.getElementById("closePreviewBtn"),

    recentBody: document.getElementById("amaniOrdersBody"),
  };

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function authHeaders() {
    return { Authorization: `Bearer ${token}` };
  }

  function statusPill(status) {
    const s = String(status || "").toLowerCase();
    if (s === "draft")
      return `<span class="status-pill status-not-started">Draft</span>`;
    if (s === "active")
      return `<span class="status-pill status-in-progress">Active</span>`;
    if (s === "cancelled")
      return `<span class="status-pill status-delayed">Cancelled</span>`;
    return `<span class="status-pill status-not-started">${esc(
      status || "—"
    )}</span>`;
  }

  function setChecks(warnings) {
    if (!warnings || !warnings.length) {
      els.checksBox.className = "station-status-message success";
      els.checksBox.textContent = "No warnings ✅";
      return;
    }
    els.checksBox.className = "station-status-message info";
    els.checksBox.innerHTML = warnings.map((w) => `• ${esc(w)}`).join("<br/>");
  }

  function setStatus(msg, type = "info") {
    const colors = { info: "#6b7280", success: "#16a34a", error: "#dc2626" };
    els.importStatus.style.color = colors[type] || colors.info;
    els.importStatus.textContent = msg;
  }

  function getFile() {
    return els.file.files && els.file.files[0] ? els.file.files[0] : null;
  }

  function buildFormData() {
    const fd = new FormData();
    const f = getFile();
    if (f) fd.append("file", f);

    fd.append("orderNo", (els.orderNo.value || "").trim());
    fd.append("client", (els.client.value || "").trim());
    fd.append("prf", (els.prf.value || "").trim());
    fd.append("deliveryDate", (els.deliveryDate.value || "").trim());
    return fd;
  }

  // ✅ load user from DB
  async function loadMe() {
    try {
      const res = await fetch("/api/auth/me", { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) return;

      const u = data.user || {};
      els.userChip.textContent = `User: ${u.username || u.name || "—"}`;
    } catch (e) {
      console.error("loadMe failed:", e);
    }
  }

  async function loadSummary() {
    try {
      const res = await fetch("/api/orders/summary?mine=1", {
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) return;

      const s = data.summary || {};
      els.statImported.textContent = Number(s.importedToday || 0);
      els.statDraft.textContent = Number(s.draftWaiting || 0);
      els.statWarnings.textContent = Number(s.warningsDetected || 0);

      if (s.lastImport) {
        const t = new Date(s.lastImport).toISOString().slice(11, 16);
        els.statLastImport.textContent = t;
      } else {
        els.statLastImport.textContent = "—";
      }
    } catch (e) {
      console.error("loadSummary failed:", e);
    }
  }

  async function loadRecent() {
    try {
      const res = await fetch("/api/orders/recent?limit=10&mine=1", {
        headers: authHeaders(),
        cache: "no-store",
      });

      const data = await res.json().catch(() => ({}));

      els.recentBody.innerHTML = "";

      if (!res.ok || !data.ok) {
        els.recentBody.innerHTML = `
        <tr><td colspan="6" style="color:#dc2626; padding:12px;">
          Failed to load recent orders: ${esc(data.error || res.status)}
        </td></tr>`;
        return;
      }

      if (!data.orders?.length) {
        els.recentBody.innerHTML = `
        <tr><td colspan="6" style="color:#6b7280; padding:12px;">
          No recent orders yet.
        </td></tr>`;
        return;
      }

      data.orders.forEach((o) => {
        const created = o.created_at
          ? new Date(o.created_at).toISOString().slice(0, 16).replace("T", " ")
          : "—";

        const delivery = o.delivery_date
          ? new Date(o.delivery_date).toISOString().slice(0, 10)
          : "—";

        const tr = document.createElement("tr");
        tr.innerHTML = `
        <td>${esc(o.order_no)}</td>
        <td>${esc(o.client)}</td>
        <td>${esc(created)}</td>
        <td>${esc(delivery)}</td>
        <td>${Number(o.lines || 0)}</td>
        <td>${statusPill(o.status)}</td>
      `;
        els.recentBody.appendChild(tr);
      });
    } catch (e) {
      console.error("loadRecent failed:", e);
      els.recentBody.innerHTML = `
      <tr><td colspan="6" style="color:#dc2626; padding:12px;">
        loadRecent exception: ${esc(e.message || e)}
      </td></tr>`;
    }
  }

  async function doPreview() {
    const f = getFile();
    if (!f) return setStatus("Select a file first.", "error");

    setStatus("Uploading preview…", "info");

    try {
      const res = await fetch("/api/orders/import/preview", {
        method: "POST",
        headers: authHeaders(),
        body: buildFormData(),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok)
        return setStatus(data.error || "Preview failed.", "error");

      const p = data.preview;
      els.previewCard.style.display = "block";
      els.pvOrderNo.textContent = p.orderNo || "—";
      els.pvClient.textContent = p.client || "—";
      els.pvLines.textContent = Number(p.totalLines || 0);
      els.pvPieces.textContent = Number(p.totalPieces || 0);

      setChecks(p.warnings || []);

      els.previewBody.innerHTML = "";
      (p.linesPreview || []).forEach((ln) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${esc(ln.line_code || "—")}</td>
          <td>${Number(ln.qty || 0)}</td>
          <td>${esc(ln.size || "—")}</td>
          <td>${esc(ln.glass_type || "—")}</td>
          <td>${esc(ln.notes || "—")}</td>
        `;
        els.previewBody.appendChild(tr);
      });

      setStatus("Preview ready ✅", "success");
    } catch (e) {
      console.error(e);
      setStatus("Preview failed (network/server).", "error");
    }
  }

  async function createDraft() {
    const f = getFile();
    if (!f) return setStatus("Select a file first.", "error");

    setStatus("Creating Draft…", "info");

    try {
      const res = await fetch("/api/orders/import", {
        method: "POST",
        headers: authHeaders(),
        body: buildFormData(),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        console.error("create draft error:", res.status, data);
        return setStatus(data.error || "Create Draft failed.", "error");
      }

      setStatus(
        `Draft created ✅ Order #${data.order?.orderNo || ""}`,
        "success"
      );

      await loadSummary();
      await loadRecent();
    } catch (e) {
      console.error(e);
      setStatus("Create Draft failed (network/server).", "error");
    }
  }

  function resetForm() {
    els.file.value = "";
    els.fileMeta.textContent = "No file selected.";
    els.prf.value = "";
    els.deliveryDate.value = "";
    els.client.value = "";
    els.orderNo.value = "";

    els.previewCard.style.display = "none";
    els.previewBody.innerHTML = "";
    els.checksBox.textContent = "No checks yet.";
    setStatus("Waiting for file…", "info");
  }

  els.file?.addEventListener("change", () => {
    const f = getFile();
    if (!f) return (els.fileMeta.textContent = "No file selected.");
    els.fileMeta.textContent = `${f.name} (${Math.round(f.size / 1024)} KB)`;
    setStatus("File selected.", "info");
  });

  els.previewBtn?.addEventListener("click", doPreview);
  els.createDraftBtn?.addEventListener("click", createDraft);
  els.resetBtn?.addEventListener("click", resetForm);
  els.closePreviewBtn?.addEventListener(
    "click",
    () => (els.previewCard.style.display = "none")
  );

  // initial
  loadMe();
  loadSummary();
  loadRecent();
})();
