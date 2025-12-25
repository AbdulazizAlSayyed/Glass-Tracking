/* =========================
   Glass Tracking - Notifications Center (Front-end only)
   File: js/notifications.js
   ========================= */

(() => {
  const STORAGE_KEY = "gt_notifications_v1";

  // DOM
  const listEl = document.getElementById("notifications-list");
  const emptyEl = document.getElementById("notifications-empty");
  const tabs = Array.from(document.querySelectorAll(".tabs .tab"));

  // Safety
  if (!listEl || !emptyEl) return;

  // ---------- Helpers ----------
  const nowISO = () => new Date().toISOString();
  const fmtTime = (iso) => {
    try {
      const d = new Date(iso);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const mi = String(d.getMinutes()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    } catch {
      return iso || "";
    }
  };

  const uid = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`;

  const safeText = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

  function load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function save(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function ensureSeedDataIfEmpty(items) {
    if (items.length) return items;

    const seed = [
      {
        id: uid(),
        type: "order_imported",
        level: "info",
        title: "Order imported",
        message: "Order 580 imported as Draft (waiting activation).",
        orderId: "580",
        station: null,
        createdAt: nowISO(),
        isRead: false,
        isStarred: false,
      },
      {
        id: uid(),
        type: "order_activated",
        level: "info",
        title: "Order activated",
        message: "Order 581 activated for production (selected lines).",
        orderId: "581",
        station: null,
        createdAt: nowISO(),
        isRead: true,
        isStarred: false,
      },
      {
        id: uid(),
        type: "piece_broken",
        level: "critical",
        title: "Piece broken",
        message: "Glass 580-F1-4 marked as BROKEN (Fell on floor).",
        orderId: "580",
        station: "Cutting",
        createdAt: nowISO(),
        isRead: false,
        isStarred: true,
      },
      {
        id: uid(),
        type: "late_warning",
        level: "critical",
        title: "Late warning",
        message: "Order 612 is at risk of delay (no scans in Furnace 45+ min).",
        orderId: "612",
        station: "Furnace",
        createdAt: nowISO(),
        isRead: false,
        isStarred: false,
      },
      {
        id: uid(),
        type: "delivery_confirmed",
        level: "info",
        title: "Delivery confirmed",
        message: "Delivery confirmed for Order 700 (partial shipment).",
        orderId: "700",
        station: "Delivery",
        createdAt: nowISO(),
        isRead: true,
        isStarred: false,
      },
    ];

    save(seed);
    return seed;
  }

  // ---------- UI mapping ----------
  function badgeFor(n) {
    // use your existing classes if they exist in css/style.css
    // fallback to inline style if not.
    const level = n.level || "info";
    const isUnread = !n.isRead;

    // Dot color classes like your dashboard alerts:
    const dotClass =
      level === "critical" ? "alert-danger-dot" : "alert-info-dot";

    const itemClass = [
      "alert-item",
      level === "critical" ? "alert-danger" : "alert-info",
      isUnread ? "unread" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return { dotClass, itemClass };
  }

  // ---------- Render ----------
  let currentFilter = "all";
  let notifications = ensureSeedDataIfEmpty(load());

  function applyFilter(items, filter) {
    if (filter === "all") return items;
    if (filter === "unread") return items.filter((x) => !x.isRead);
    if (filter === "critical")
      return items.filter((x) => x.level === "critical");
    if (filter === "info") return items.filter((x) => x.level !== "critical");
    if (filter === "starred") return items.filter((x) => !!x.isStarred); // optional if you add a tab later
    return items;
  }

  function sortNewest(items) {
    return [...items].sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return tb - ta;
    });
  }

  function updateEmptyState(count) {
    emptyEl.style.display = count ? "none" : "block";
  }

  function render() {
    notifications = load();
    notifications = ensureSeedDataIfEmpty(notifications);

    const filtered = sortNewest(applyFilter(notifications, currentFilter));
    updateEmptyState(filtered.length);

    listEl.innerHTML = filtered
      .map((n) => {
        const { dotClass, itemClass } = badgeFor(n);

        const metaParts = [];
        if (n.orderId) metaParts.push(`Order: ${safeText(n.orderId)}`);
        if (n.station) metaParts.push(`Station: ${safeText(n.station)}`);
        metaParts.push(fmtTime(n.createdAt));

        const readLabel = n.isRead ? "Mark unread" : "Mark read";
        const starLabel = n.isStarred ? "★ Starred" : "☆ Star";
        const unreadBadge = n.isRead
          ? ""
          : `<span class="status-pill status-delayed" style="padding:4px 8px; font-size:.75rem;">Unread</span>`;

        return `
          <div class="${itemClass}" data-nid="${safeText(
          n.id
        )}" style="display:flex; gap:10px; align-items:flex-start; padding:10px 12px; border:1px solid rgba(226,232,240,.9); border-radius:12px; background:#fff;">
            <div class="alert-dot ${dotClass}" style="margin-top:6px;"></div>

            <div style="flex:1; display:flex; flex-direction:column; gap:4px;">
              <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="font-weight:700;">${safeText(
                  n.title || "Notification"
                )}</div>
                <div style="display:flex; gap:8px; align-items:center;">
                  ${unreadBadge}
                </div>
              </div>

              <div style="color:#374151;">${safeText(n.message || "")}</div>

              <div style="color:#6b7280; font-size:.78rem;">
                ${metaParts.join(" • ")}
              </div>

              <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:6px;">
                ${
                  n.orderId
                    ? `<button class="btn btn-ghost" data-action="open" type="button">Open</button>`
                    : ""
                }
                <button class="btn btn-ghost" data-action="toggle-read" type="button">${readLabel}</button>
                <button class="btn btn-ghost" data-action="toggle-star" type="button">${starLabel}</button>
                <button class="btn btn-ghost" data-action="delete" type="button" style="color:#b91c1c;">Delete</button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  // ---------- Actions ----------
  function findIndexById(id) {
    return notifications.findIndex((x) => x.id === id);
  }

  function setRead(id, val) {
    const items = load();
    const idx = items.findIndex((x) => x.id === id);
    if (idx < 0) return;
    items[idx].isRead = !!val;
    save(items);
    render();
  }

  function toggleStar(id) {
    const items = load();
    const idx = items.findIndex((x) => x.id === id);
    if (idx < 0) return;
    items[idx].isStarred = !items[idx].isStarred;
    save(items);
    render();
  }

  function removeNotif(id) {
    const items = load().filter((x) => x.id !== id);
    save(items);
    render();
  }

  function openOrder(orderId) {
    // mark related notifications as read (optional)
    // setRead(notifId, true) already when click open below
    window.location.href = `order-details.html?order=${encodeURIComponent(
      orderId
    )}`;
  }

  listEl.addEventListener("click", (e) => {
    const card = e.target.closest("[data-nid]");
    if (!card) return;

    const id = card.dataset.nid;
    const actionBtn = e.target.closest("[data-action]");
    if (!actionBtn) return;

    const action = actionBtn.dataset.action;
    const items = load();
    const notif = items.find((x) => x.id === id);

    if (!notif) return;

    if (action === "toggle-read") {
      setRead(id, !notif.isRead);
      return;
    }

    if (action === "toggle-star") {
      toggleStar(id);
      return;
    }

    if (action === "delete") {
      const ok = confirm("Delete this notification?");
      if (!ok) return;
      removeNotif(id);
      return;
    }

    if (action === "open") {
      // open order details + mark read
      setRead(id, true);
      if (notif.orderId) openOrder(notif.orderId);
      return;
    }
  });

  // ---------- Tabs / Filters ----------
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      currentFilter = tab.dataset.filter || "all";
      render();
    });
  });

  // ---------- Public API (so other pages can push notifications) ----------
  // Example usage from any page:
  // window.GTNotify.add({ type:'piece_done', level:'info', title:'Piece done', message:'Glass 580-F1-2 done', orderId:'580', station:'Cutting' })
  window.GTNotify = {
    add(payload) {
      const items = load();
      const n = {
        id: uid(),
        type: payload?.type || "info",
        level: payload?.level || "info", // "info" | "critical"
        title: payload?.title || "Notification",
        message: payload?.message || "",
        orderId: payload?.orderId || null,
        station: payload?.station || null,
        createdAt: payload?.createdAt || nowISO(),
        isRead: payload?.isRead ?? false,
        isStarred: payload?.isStarred ?? false,
      };
      items.push(n);
      save(items);
      render();
      return n.id;
    },
    markAllRead() {
      const items = load().map((x) => ({ ...x, isRead: true }));
      save(items);
      render();
    },
    clearAll() {
      const ok = confirm("Clear ALL notifications?");
      if (!ok) return;
      save([]);
      render();
    },
  };

  // Initial render
  render();
})();
