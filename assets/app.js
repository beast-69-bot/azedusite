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

  // Upgrade legacy inline overlay into a centered, polished modal.
  const card = overlay.firstElementChild;
  if (card && !overlay.dataset.enhanced) {
    overlay.dataset.enhanced = "true";
    overlay.style.backdropFilter = "blur(6px)";
    overlay.style.padding = "24px";

    card.style.width = "min(560px, 100%)";
    card.style.border = "1px solid rgba(140, 182, 255, 0.35)";
    card.style.background = "linear-gradient(165deg, #0f1e38, #0a1528)";
    card.style.boxShadow = "0 24px 50px rgba(0, 0, 0, 0.45)";
    card.style.borderRadius = "18px";
    card.style.padding = "26px";
    card.style.textAlign = "left";

    const title = card.querySelector(".locked-title");
    if (title) {
      title.style.fontSize = "1.8rem";
      title.style.lineHeight = "1.2";
      title.style.marginBottom = "10px";
    }

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "Close";
    closeBtn.style.position = "absolute";
    closeBtn.style.right = "14px";
    closeBtn.style.top = "14px";
    closeBtn.style.border = "1px solid rgba(147, 180, 236, 0.35)";
    closeBtn.style.background = "rgba(13, 24, 45, 0.8)";
    closeBtn.style.color = "#d8e6ff";
    closeBtn.style.borderRadius = "10px";
    closeBtn.style.padding = "6px 10px";
    closeBtn.style.cursor = "pointer";

    card.style.position = "relative";
    closeBtn.addEventListener("click", () => {
      overlay.style.display = "none";
      document.body.style.overflow = "";
    });
    card.appendChild(closeBtn);
  }

  const titleNode = overlay.querySelector(".locked-title");
  const sectionLabel = String(section || "this section").replace(/^\w/, (m) => m.toUpperCase());

  function showOverlay(message) {
    overlay.style.display = "flex";
    document.body.style.overflow = "hidden";
    if (titleNode) titleNode.textContent = message;
  }

  try {
    const me = await api("/api/auth/me");
    if (!me.subscription) {
      showOverlay(`Subscription Required for ${sectionLabel}`);
    }
  } catch (_) {
    showOverlay(`Login Required for ${sectionLabel}`);
  }
}

window.studypro = { api, ensureAuthLinks, lockSection };
