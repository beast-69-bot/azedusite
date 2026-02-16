const fs = require("fs");
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret";
const DB_FILE = path.join(__dirname, "data.json");

const PLANS = {
  daily: { label: "Daily", amount: 9, days: 1 },
  weekly: { label: "7 Days", amount: 29, days: 7 },
  monthly: { label: "Monthly", amount: 99, days: 30 }
};

const CONTENT_SECTIONS = ["courses", "books", "pyqs", "mock"];

function defaultDb() {
  return {
    users: [],
    payments: [],
    subscriptions: [],
    content: {
      courses: [],
      books: [],
      pyqs: [],
      mock: []
    },
    counters: {
      users: 0,
      payments: 0,
      subscriptions: 0,
      content: { courses: 0, books: 0, pyqs: 0, mock: 0 }
    }
  };
}

function ensureDbShape(raw) {
  const base = defaultDb();
  const db = { ...base, ...raw };
  db.users = Array.isArray(db.users) ? db.users : [];
  db.payments = Array.isArray(db.payments) ? db.payments : [];
  db.subscriptions = Array.isArray(db.subscriptions) ? db.subscriptions : [];
  db.content = typeof db.content === "object" && db.content ? db.content : {};
  db.counters = typeof db.counters === "object" && db.counters ? db.counters : {};
  db.counters.content = typeof db.counters.content === "object" && db.counters.content ? db.counters.content : {};

  for (const section of CONTENT_SECTIONS) {
    db.content[section] = Array.isArray(db.content[section]) ? db.content[section] : [];
    db.counters.content[section] = Number(db.counters.content[section] || 0);
  }

  db.counters.users = Number(db.counters.users || 0);
  db.counters.payments = Number(db.counters.payments || 0);
  db.counters.subscriptions = Number(db.counters.subscriptions || 0);
  return db;
}

function loadDb() {
  if (!fs.existsSync(DB_FILE)) return defaultDb();
  const raw = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  return ensureDbShape(raw);
}

function saveDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

let db = loadDb();

function seedContentIfEmpty() {
  if (!db.content.courses.length) {
    db.counters.content.courses += 1;
    db.content.courses.push({
      id: db.counters.content.courses,
      title: "Course batches launching soon",
      description: "Free batches of institutes coming soon.",
      meta: "JEE & NEET",
      status: "published",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  if (!db.content.books.length) {
    const defaults = [
      ["Physics Notes", "Concept summaries and solved examples."],
      ["Chemistry Notes", "Physical, organic and inorganic quick revision."],
      ["Biology Notes", "Chapter-wise essentials and diagrams."]
    ];
    defaults.forEach(([title, description]) => {
      db.counters.content.books += 1;
      db.content.books.push({
        id: db.counters.content.books,
        title,
        description,
        meta: "Download / View",
        status: "published",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    });
  }

  if (!db.content.pyqs.length) {
    const defaults = [
      ["JEE Main PYQs", "Year-wise + Topic-wise", "Questions grouped by year and subject"],
      ["JEE Advanced PYQs", "Advanced pattern sets", "High-level previous year question sets"],
      ["NEET PYQs", "Year-wise collection", "Medical entrance PYQ practice library"]
    ];
    defaults.forEach(([title, meta, description]) => {
      db.counters.content.pyqs += 1;
      db.content.pyqs.push({
        id: db.counters.content.pyqs,
        title,
        meta,
        description,
        status: "published",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    });
  }

  if (!db.content.mock.length) {
    const defaults = [
      ["JEE Main Full-Length", "Questions: 90 | Duration: 180 mins", "Repeated PYQ pattern simulation"],
      ["NEET Full-Length", "Questions: 200 | Duration: 200 mins", "Repeated PYQ pattern simulation"]
    ];
    defaults.forEach(([title, meta, description]) => {
      db.counters.content.mock += 1;
      db.content.mock.push({
        id: db.counters.content.mock,
        title,
        meta,
        description,
        status: "published",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    });
  }
}

async function seedAdmin() {
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@studypro.local").toLowerCase();
  const adminPass = process.env.ADMIN_PASSWORD || "Admin@123";
  const exists = db.users.find((u) => u.email === adminEmail);
  if (exists) return;
  const hash = await bcrypt.hash(adminPass, 10);
  db.counters.users += 1;
  db.users.push({
    id: db.counters.users,
    name: "Admin",
    email: adminEmail,
    password_hash: hash,
    role: "admin",
    created_at: new Date().toISOString()
  });
}

app.use(express.json());
app.use(cookieParser());
app.use(express.static(__dirname));

function authRequired(req, res, next) {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ ok: false, message: "Unauthorized" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (_) {
    return res.status(401).json({ ok: false, message: "Invalid token" });
  }
}

function adminRequired(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ ok: false, message: "Admin only" });
  return next();
}

function getActiveSubscription(userId) {
  const now = Date.now();
  return (
    db.subscriptions
      .filter((s) => s.user_id === userId && s.status === "active" && new Date(s.ends_at).getTime() > now)
      .sort((a, b) => new Date(b.ends_at) - new Date(a.ends_at))[0] || null
  );
}

function issueToken(res, user) {
  const payload = { id: user.id, name: user.name, email: user.email, role: user.role };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
  res.cookie("auth_token", token, { httpOnly: true, sameSite: "lax", secure: false, maxAge: 7 * 86400000 });
  return payload;
}

function normalizeSection(value) {
  const section = String(value || "").toLowerCase().trim();
  return CONTENT_SECTIONS.includes(section) ? section : null;
}

function sanitizeContentPayload(body) {
  return {
    title: String(body.title || "").trim(),
    description: String(body.description || "").trim(),
    meta: String(body.meta || "").trim(),
    status: body.status === "draft" ? "draft" : "published"
  };
}

app.get("/api/health", (req, res) => res.json({ ok: true, service: "studypro-api" }));
app.get("/api/plans", (req, res) => res.json({ ok: true, plans: PLANS }));

app.get("/api/content/:section", (req, res) => {
  const section = normalizeSection(req.params.section);
  if (!section) return res.status(400).json({ ok: false, message: "Invalid section" });
  const rows = db.content[section].filter((x) => x.status === "published").sort((a, b) => b.id - a.id);
  return res.json({ ok: true, section, rows });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ ok: false, message: "Missing fields" });
    const em = email.toLowerCase().trim();
    if (db.users.find((u) => u.email === em)) return res.status(409).json({ ok: false, message: "Email already registered" });
    const hash = await bcrypt.hash(password, 10);
    db.counters.users += 1;
    const user = { id: db.counters.users, name: name.trim(), email: em, password_hash: hash, role: "user", created_at: new Date().toISOString() };
    db.users.push(user);
    saveDb(db);
    const payload = issueToken(res, user);
    return res.json({ ok: true, user: payload });
  } catch (_) {
    return res.status(500).json({ ok: false, message: "Register failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.users.find((u) => u.email === email.toLowerCase().trim());
    if (!user) return res.status(401).json({ ok: false, message: "Invalid credentials" });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ ok: false, message: "Invalid credentials" });
    const payload = issueToken(res, user);
    return res.json({ ok: true, user: payload });
  } catch (_) {
    return res.status(500).json({ ok: false, message: "Login failed" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("auth_token");
  res.json({ ok: true });
});

app.get("/api/auth/me", authRequired, (req, res) => {
  const subscription = getActiveSubscription(req.user.id);
  res.json({ ok: true, user: req.user, subscription });
});

app.get("/api/access/:section", authRequired, (req, res) => {
  const section = normalizeSection(req.params.section) || req.params.section;
  const subscription = getActiveSubscription(req.user.id);
  res.json({ ok: true, section, allowed: Boolean(subscription), subscription });
});

app.post("/api/payments/submit-utr", authRequired, (req, res) => {
  const { planKey, utr } = req.body || {};
  const plan = PLANS[planKey];
  if (!plan) return res.status(400).json({ ok: false, message: "Invalid plan" });
  const utrClean = String(utr || "").trim();
  if (!/^[a-zA-Z0-9-]{6,40}$/.test(utrClean)) {
    return res.status(400).json({ ok: false, message: "Invalid UTR format" });
  }

  db.counters.payments += 1;
  const now = new Date().toISOString();
  const payment = {
    id: db.counters.payments,
    user_id: req.user.id,
    plan_key: planKey,
    amount: plan.amount,
    payment_ref: `REQ-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    utr: utrClean,
    status: "pending",
    review_note: "",
    paid_at: now,
    created_at: now
  };
  db.payments.push(payment);
  saveDb(db);
  return res.json({ ok: true, payment });
});

app.get("/api/payments/history", authRequired, (req, res) => {
  const payments = db.payments.filter((p) => p.user_id === req.user.id).sort((a, b) => b.id - a.id);
  res.json({ ok: true, payments });
});

app.get("/api/admin/overview", authRequired, adminRequired, (req, res) => {
  const activeSubscriptions = db.subscriptions.filter((s) => s.status === "active" && new Date(s.ends_at).getTime() > Date.now()).length;
  const revenue = db.payments.filter((p) => p.status === "approved" || p.status === "success").reduce((sum, p) => sum + p.amount, 0);
  res.json({
    ok: true,
    stats: {
      users: db.users.length,
      payments: db.payments.length,
      revenue,
      activeSubscriptions,
      courses: db.content.courses.length,
      books: db.content.books.length,
      pyqs: db.content.pyqs.length,
      mock: db.content.mock.length
    }
  });
});

app.get("/api/admin/users", authRequired, adminRequired, (req, res) => {
  const rows = db.users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, created_at: u.created_at })).sort((a, b) => b.id - a.id);
  res.json({ ok: true, rows });
});

app.get("/api/admin/payments", authRequired, adminRequired, (req, res) => {
  const userMap = new Map(db.users.map((u) => [u.id, u]));
  const rows = db.payments
    .map((p) => {
      const u = userMap.get(p.user_id) || {};
      return { ...p, name: u.name || "-", email: u.email || "-" };
    })
    .sort((a, b) => b.id - a.id);
  res.json({ ok: true, rows });
});

app.post("/api/admin/payments/:id/approve", authRequired, adminRequired, (req, res) => {
  const id = Number(req.params.id);
  const idx = db.payments.findIndex((p) => p.id === id);
  if (idx === -1) return res.status(404).json({ ok: false, message: "Payment not found" });
  const payment = db.payments[idx];
  if (payment.status !== "pending") {
    return res.status(400).json({ ok: false, message: "Only pending payments can be approved" });
  }

  const plan = PLANS[payment.plan_key];
  if (!plan) return res.status(400).json({ ok: false, message: "Invalid plan in payment" });

  db.payments[idx] = {
    ...payment,
    status: "approved",
    reviewed_by: req.user.id,
    reviewed_at: new Date().toISOString()
  };

  db.subscriptions.forEach((s) => {
    if (s.user_id === payment.user_id && s.status === "active") s.status = "expired";
  });

  const now = new Date();
  const ends = new Date(now.getTime() + plan.days * 24 * 60 * 60 * 1000);
  db.counters.subscriptions += 1;
  db.subscriptions.push({
    id: db.counters.subscriptions,
    user_id: payment.user_id,
    plan_key: payment.plan_key,
    amount: payment.amount,
    starts_at: now.toISOString(),
    ends_at: ends.toISOString(),
    status: "active",
    created_at: now.toISOString()
  });

  saveDb(db);
  res.json({ ok: true });
});

app.post("/api/admin/payments/:id/decline", authRequired, adminRequired, (req, res) => {
  const id = Number(req.params.id);
  const idx = db.payments.findIndex((p) => p.id === id);
  if (idx === -1) return res.status(404).json({ ok: false, message: "Payment not found" });
  const payment = db.payments[idx];
  if (payment.status !== "pending") {
    return res.status(400).json({ ok: false, message: "Only pending payments can be declined" });
  }
  db.payments[idx] = {
    ...payment,
    status: "declined",
    review_note: String((req.body || {}).reason || "").trim(),
    reviewed_by: req.user.id,
    reviewed_at: new Date().toISOString()
  };
  saveDb(db);
  res.json({ ok: true });
});

app.get("/api/admin/content/:section", authRequired, adminRequired, (req, res) => {
  const section = normalizeSection(req.params.section);
  if (!section) return res.status(400).json({ ok: false, message: "Invalid section" });
  const rows = db.content[section].slice().sort((a, b) => b.id - a.id);
  res.json({ ok: true, section, rows });
});

app.post("/api/admin/content/:section", authRequired, adminRequired, (req, res) => {
  const section = normalizeSection(req.params.section);
  if (!section) return res.status(400).json({ ok: false, message: "Invalid section" });
  const payload = sanitizeContentPayload(req.body || {});
  if (!payload.title || !payload.description) {
    return res.status(400).json({ ok: false, message: "Title and description are required" });
  }
  db.counters.content[section] += 1;
  const row = {
    id: db.counters.content[section],
    ...payload,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  db.content[section].push(row);
  saveDb(db);
  res.json({ ok: true, row });
});

app.put("/api/admin/content/:section/:id", authRequired, adminRequired, (req, res) => {
  const section = normalizeSection(req.params.section);
  if (!section) return res.status(400).json({ ok: false, message: "Invalid section" });
  const id = Number(req.params.id);
  const idx = db.content[section].findIndex((x) => x.id === id);
  if (idx === -1) return res.status(404).json({ ok: false, message: "Item not found" });

  const payload = sanitizeContentPayload(req.body || {});
  if (!payload.title || !payload.description) {
    return res.status(400).json({ ok: false, message: "Title and description are required" });
  }
  db.content[section][idx] = {
    ...db.content[section][idx],
    ...payload,
    updated_at: new Date().toISOString()
  };
  saveDb(db);
  res.json({ ok: true, row: db.content[section][idx] });
});

app.delete("/api/admin/content/:section/:id", authRequired, adminRequired, (req, res) => {
  const section = normalizeSection(req.params.section);
  if (!section) return res.status(400).json({ ok: false, message: "Invalid section" });
  const id = Number(req.params.id);
  const idx = db.content[section].findIndex((x) => x.id === id);
  if (idx === -1) return res.status(404).json({ ok: false, message: "Item not found" });
  db.content[section].splice(idx, 1);
  saveDb(db);
  res.json({ ok: true });
});

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

Promise.resolve()
  .then(seedAdmin)
  .then(() => {
    seedContentIfEmpty();
    saveDb(db);
    app.listen(PORT, () => {
      console.log(`StudyPro running on http://localhost:${PORT}`);
    });
  });
