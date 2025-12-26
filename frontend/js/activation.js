// frontend/js/activation.js
(() => {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "null");

  const els = {
    brokenStatus: document.getElementById("brokenStatus"),
    brokenBody: document.getElementById("brokenBody"),
  };

  const esc = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const setBrokenStatus = (msg, type = "info") => {
    if (!els.brokenStatus) return;
    els.brokenStatus.textContent = msg;
    els.brokenStatus.className = `station-status-message ${type}`;
  };

  const apiHeaders = () => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  });

  const fmt = (d) => {
    if (!d) return "—";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "—";
    return dt.toISOString().slice(0, 19).replace("T", " ");
  };

  async function apiGet(url) {
    const res = await fetch(url, { headers: apiHeaders(), cache: "no-store" });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.replace("/index.html?logout=1");
      return null;
    }

    if (!res.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  }

  async function apiPost(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.replace("/index.html?logout=1");
      return null;
    }

    if (!res.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  }

  function renderBroken(rows) {
    if (!els.brokenBody) return;

    if (!rows.length) {
      els.brokenBody.innerHTML = `
        <tr>
          <td colspan="10" style="padding:12px; color:#6b7280;">
            No broken pieces waiting replacement ✅
          </td>
        </tr>
      `;
      setBrokenStatus("No broken pieces waiting replacement.", "success");
      return;
    }

    els.brokenBody.innerHTML = "";
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(r.broken_piece_code)}</td>
        <td>${esc(r.broken_station_name || "—")}</td>
        <td>${esc(fmt(r.broken_at))}</td>
        <td>${esc(r.order_code || "—")}</td>
        <td>${esc(r.customer || "—")}</td>
        <td>${esc(r.line_code || "—")}</td>
        <td>${esc(r.glass_type || "—")}</td>
        <td>${esc(r.size || "—")}</td>
        <td>${esc(r.broken_notes || "—")}</td>
        <td>
          <button class="btn btn-primary btn-small" data-replace="${esc(
            r.broken_piece_code
          )}" type="button">
            Create Replacement
          </button>
        </td>
      `;
      els.brokenBody.appendChild(tr);
    });

    setBrokenStatus(`Broken waiting replacement: ${rows.length}`, "info");
  }

  async function loadBroken() {
    try {
      setBrokenStatus("Loading broken list…", "info");
      const data = await apiGet("/api/activation/broken");
      if (!data) return;
      renderBroken(Array.isArray(data.data) ? data.data : []);
    } catch (e) {
      console.error(e);
      setBrokenStatus(`Failed: ${e.message}`, "error");
      if (els.brokenBody) {
        els.brokenBody.innerHTML = `
          <tr><td colspan="10" style="padding:12px; color:#dc2626;">
            Failed to load broken pieces.
          </td></tr>
        `;
      }
    }
  }

  async function handleReplaceClick(e) {
    const btn = e.target.closest("[data-replace]");
    if (!btn) return;

    const code = String(btn.getAttribute("data-replace") || "").trim();
    if (!code) return;

    try {
      btn.disabled = true;
      setBrokenStatus(`Creating replacement for ${code}…`, "info");

      const data = await apiPost("/api/activation/replace", {
        brokenPieceCode: code,
      });
      if (!data) return;

      setBrokenStatus(
        `✅ Replacement created: ${data.replacement?.piece_code || "OK"}`,
        "success"
      );

      // reload list
      loadBroken();
    } catch (e2) {
      console.error(e2);
      setBrokenStatus(`Replace failed: ${e2.message}`, "error");
    } finally {
      btn.disabled = false;
    }
  }

  function init() {
    if (!user || !token) return;
    if (!els.brokenBody) return; // الصفحة ممكن ما فيها section

    els.brokenBody.addEventListener("click", handleReplaceClick);
    loadBroken();
  }

  init();
})();
