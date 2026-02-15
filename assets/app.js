async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
}

function ensureAuthLinks() {
  const login = document.getElementById("navLogin");
  const dashboard = document.getElementById("navDashboard");
  const logout = document.getElementById("navLogout");
  if (!login || !dashboard || !logout) return;

  api("/api/auth/me")
    .then((r) => {
      if (r.ok) {
        login.style.display = "none";
        dashboard.style.display = "inline-block";
        logout.style.display = "inline-block";
      }
    })
    .catch(() => {
      login.style.display = "inline-block";
      dashboard.style.display = "none";
      logout.style.display = "none";
    });

  logout.addEventListener("click", async (e) => {
    e.preventDefault();
    await api("/api/auth/logout", { method: "POST" });
    window.location.href = "/login.html";
  });
}

async function lockSection(section) {
  const overlay = document.getElementById("lockedOverlay");
  if (!overlay) return;
  try {
    const me = await api("/api/auth/me");
    if (!me.subscription) {
      overlay.style.display = "block";
      overlay.querySelector(".locked-title").textContent = `Subscription required for ${section}`;
    }
  } catch (_) {
    overlay.style.display = "block";
    overlay.querySelector(".locked-title").textContent = `Login required for ${section}`;
  }
}

window.studypro = { api, ensureAuthLinks, lockSection };
