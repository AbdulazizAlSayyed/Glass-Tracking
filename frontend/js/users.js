// ===== Auth context =====
const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("user") || "null");

if (!token || !user) {
  window.location.replace("/index.html?logout=1");
}

function authHeaders() {
  return {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
  };
}

// ===== State =====
let USERS = [];
let ROLES = [];
let STATIONS = [];
let editingId = null;

// ===== Elements =====
const usersTbody = document.getElementById("usersTbody");
const addUserBtn = document.getElementById("addUserBtn");
const searchInput = document.getElementById("searchInput");
const roleFilter = document.getElementById("roleFilter");
const stationFilter = document.getElementById("stationFilter");
const totalChip = document.getElementById("totalChip");
const exportCsvBtn = document.getElementById("exportCsvBtn");

// modal
const modalBackdrop = document.getElementById("userModalBackdrop");
const closeModalBtn = document.getElementById("closeModalBtn");
const modalTitle = document.getElementById("modalTitle");
const modalSubtitle = document.getElementById("modalSubtitle");

const fUsername = document.getElementById("fUsername");
const fFullname = document.getElementById("fFullname");
const fRole = document.getElementById("fRole");
const fStation = document.getElementById("fStation");
const fPassword = document.getElementById("fPassword");
const fStatus = document.getElementById("fStatus");

const formError = document.getElementById("formError");
const saveUserBtn = document.getElementById("saveUserBtn");
const deleteUserBtn = document.getElementById("deleteUserBtn");
const resetPassBtn = document.getElementById("resetPassBtn");

// ===== Helpers =====
function safeText(s) {
  return String(s ?? "")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function statusPillHtml(status) {
  if (status === "active")
    return `<span class="status-pill status-completed">Active</span>`;
  return `<span class="status-pill status-not-started">Disabled</span>`;
}

function roleNeedsStation(role) {
  return role === "station_worker"; // عدّل لو حابب
}

function syncStationEnable() {
  const role = fRole.value;
  if (roleNeedsStation(role)) {
    fStation.disabled = false;
  } else {
    fStation.value = "";
    fStation.disabled = true;
  }
}

fRole.addEventListener("change", syncStationEnable);

// ===== Render dropdowns =====
function fillDropdowns() {
  // roles
  roleFilter.innerHTML = `<option value="all">Role: All</option>`;
  fRole.innerHTML = "";

  ROLES.forEach((r) => {
    const opt1 = document.createElement("option");
    opt1.value = r;
    opt1.textContent = r;
    roleFilter.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = r;
    opt2.textContent = r;
    fRole.appendChild(opt2);
  });

  // stations
  stationFilter.innerHTML = `<option value="all">Station: All</option>`;
  fStation.innerHTML = `<option value="">–</option>`;

  STATIONS.forEach((s) => {
    const o1 = document.createElement("option");
    o1.value = s.id;
    o1.textContent = s.name;
    stationFilter.appendChild(o1);

    const o2 = document.createElement("option");
    o2.value = s.id;
    o2.textContent = s.name;
    fStation.appendChild(o2);
  });
}

// ===== Render table =====
function render() {
  const q = (searchInput.value || "").trim().toLowerCase();
  const rf = roleFilter.value;
  const sf = stationFilter.value;

  let list = USERS.slice();

  if (q) {
    list = list.filter(
      (u) =>
        (u.username || "").toLowerCase().includes(q) ||
        (u.fullName || "").toLowerCase().includes(q)
    );
  }
  if (rf !== "all") list = list.filter((u) => u.role === rf);
  if (sf !== "all") list = list.filter((u) => String(u.stationId || "") === sf);

  totalChip.textContent = `Total: ${list.length}`;

  usersTbody.innerHTML = "";

  if (!list.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="7" class="muted">No users found.</td>`;
    usersTbody.appendChild(tr);
    return;
  }

  list.forEach((u) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${safeText(u.username)}</td>
      <td>${safeText(u.fullName || "")}</td>
      <td>${safeText(u.role || "")}</td>
      <td>${safeText(u.stationName || "–")}</td>
      <td>${statusPillHtml(u.status)}</td>
      <td>${safeText(u.lastLogin || "—")}</td>
      <td>
        <div class="actions">
          <button class="btn btn-ghost" data-action="edit" data-id="${
            u.id
          }">Edit</button>
          <button class="btn btn-ghost" data-action="toggle" data-id="${u.id}">
            ${u.status === "active" ? "Disable" : "Enable"}
          </button>
          <button class="btn btn-ghost" data-action="reset" data-id="${
            u.id
          }">Reset password</button>
        </div>
      </td>
    `;
    usersTbody.appendChild(tr);
  });
}

// ===== Modal open/close =====
function openModal(mode, u = null) {
  formError.style.display = "none";
  formError.textContent = "";
  fPassword.value = "";

  if (mode === "add") {
    editingId = null;
    modalTitle.textContent = "Add user";
    modalSubtitle.textContent = "Create a user account and assign a role.";
    deleteUserBtn.style.display = "none";
    resetPassBtn.style.display = "none";

    fUsername.disabled = false;
    fUsername.value = "";
    fFullname.value = "";
    fRole.value = ROLES[0] || "";
    fStation.value = "";
    fStatus.value = "active";
  } else {
    editingId = u.id;
    modalTitle.textContent = `Edit user: ${u.username}`;
    modalSubtitle.textContent = "Update user role/station or disable account.";
    deleteUserBtn.style.display = "inline-flex";
    resetPassBtn.style.display = "inline-flex";

    fUsername.disabled = true;
    fUsername.value = u.username;
    fFullname.value = u.fullName || "";
    fRole.value = u.role || "";
    fStation.value = u.stationId || "";
    fStatus.value = u.status || "active";
  }

  syncStationEnable();
  modalBackdrop.classList.add("open");
}

function closeModal() {
  modalBackdrop.classList.remove("open");
}

closeModalBtn.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

// ===== Load from backend =====
async function loadUsersFromServer() {
  try {
    const res = await fetch("/api/users", {
      headers: authHeaders(),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error("Users API error", data);
      return;
    }

    USERS = data.users || [];
    ROLES = data.roles || [];
    STATIONS = data.stations || [];

    fillDropdowns();
    render();
  } catch (err) {
    console.error("loadUsersFromServer failed", err);
  }
}

// ===== Save (add or update) =====
saveUserBtn.addEventListener("click", async () => {
  const username = (fUsername.value || "").trim();
  const fullName = (fFullname.value || "").trim();
  const role = fRole.value;
  const stationId = fStation.value || null;
  const status = fStatus.value;
  const password = (fPassword.value || "").trim();

  if (!username || !fullName) {
    formError.textContent = "Username and Full name are required.";
    formError.style.display = "block";
    return;
  }

  try {
    if (!editingId) {
      // create
      const res = await fetch("/api/users", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          username,
          fullName,
          role,
          stationId,
          status,
          password,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        formError.textContent = data.error || "Failed to create user.";
        formError.style.display = "block";
        return;
      }
      alert(
        `User created ✅\nUsername: ${username}\nTemporary password: ${data.tempPassword}`
      );
    } else {
      const res = await fetch(`/api/users/${editingId}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({
          fullName,
          role,
          stationId,
          status,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        formError.textContent = data.error || "Failed to update user.";
        formError.style.display = "block";
        return;
      }
    }

    closeModal();
    await loadUsersFromServer();
  } catch (err) {
    console.error(err);
    formError.textContent = "Server error.";
    formError.style.display = "block";
  }
});

// ===== Delete / Toggle / Reset from table =====
usersTbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  const u = USERS.find((x) => String(x.id) === String(id));
  if (!u) return;

  if (action === "edit") {
    openModal("edit", u);
    return;
  }

  if (action === "toggle") {
    const newStatus = u.status === "active" ? "disabled" : "active";
    await fetch(`/api/users/${id}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({
        fullName: u.fullName,
        role: u.role,
        stationId: u.stationId,
        status: newStatus,
      }),
    });
    await loadUsersFromServer();
    return;
  }

  if (action === "reset") {
    if (!confirm(`Reset password for "${u.username}" ?`)) return;
    const res = await fetch(`/api/users/${id}/reset-password`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data.ok) {
      alert(`New password for ${u.username}: ${data.tempPassword}`);
    }
    return;
  }
});

// ===== Delete button inside modal =====
deleteUserBtn.addEventListener("click", async () => {
  if (!editingId) return;
  const u = USERS.find((x) => x.id === editingId);
  if (!u) return;
  if (!confirm(`Delete user "${u.username}" ?`)) return;

  await fetch(`/api/users/${editingId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  closeModal();
  await loadUsersFromServer();
});

// ===== Filters + export =====
searchInput.addEventListener("input", render);
roleFilter.addEventListener("change", render);
stationFilter.addEventListener("change", render);

exportCsvBtn.addEventListener("click", () => {
  const lines = [];
  lines.push("username,full_name,role,station,status");
  USERS.forEach((u) => {
    lines.push(
      [
        u.username,
        u.fullName || "",
        u.role || "",
        u.stationName || "",
        u.status || "",
      ]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(",")
    );
  });

  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `users_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// ===== Init =====
addUserBtn.addEventListener("click", () => openModal("add"));
loadUsersFromServer();
