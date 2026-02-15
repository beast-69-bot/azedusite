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

function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    return { users: [], payments: [], subscriptions: [], counters: { users: 0, payments: 0, subscriptions: 0 } };
  }
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function saveDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

let db = loadDb();

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
  saveDb(db);
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
  return db.subscriptions
    .filter((s) => s.user_id === userId && s.status === "active" && new Date(s.ends_at).getTime() > now)
    .sort((a, b) => new Date(b.ends_at) - new Date(a.ends_at))[0] || null;
}

function issueToken(res, user) {
  const payload = { id: user.id, name: user.name, email: user.email, role: user.role };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
  res.cookie("auth_token", token, { httpOnly: true, sameSite: "lax", secure: false, maxAge: 7 * 86400000 });
  return payload;
}

app.get("/api/health", (req, res) => res.json({ ok: true, service: "studypro-api" }));
app.get("/api/plans", (req, res) => res.json({ ok: true, plans: PLANS }));

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
  const subscription = getActiveSubscription(req.user.id);
  res.json({ ok: true, section: req.params.section, allowed: Boolean(subscription), subscription });
});

app.post("/api/payments/confirm", authRequired, (req, res) => {
  const { planKey } = req.body;
  const plan = PLANS[planKey];
  if (!plan) return res.status(400).json({ ok: false, message: "Invalid plan" });

  const now = new Date();
  const ends = new Date(now.getTime() + plan.days * 24 * 60 * 60 * 1000);
  const paymentRef = `PAY-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  db.counters.payments += 1;
  db.payments.push({
    id: db.counters.payments,
    user_id: req.user.id,
    plan_key: planKey,
    amount: plan.amount,
    payment_ref: paymentRef,
    status: "success",
    paid_at: now.toISOString(),
    created_at: now.toISOString()
  });

  db.subscriptions.forEach((s) => {
    if (s.user_id === req.user.id && s.status === "active") s.status = "expired";
  });

  db.counters.subscriptions += 1;
  db.subscriptions.push({
    id: db.counters.subscriptions,
    user_id: req.user.id,
    plan_key: planKey,
    amount: plan.amount,
    starts_at: now.toISOString(),
    ends_at: ends.toISOString(),
    status: "active",
    created_at: now.toISOString()
  });
  saveDb(db);

  return res.json({ ok: true, paymentRef, subscription: getActiveSubscription(req.user.id) });
});

app.get("/api/payments/history", authRequired, (req, res) => {
  const payments = db.payments
    .filter((p) => p.user_id === req.user.id)
    .sort((a, b) => b.id - a.id);
  res.json({ ok: true, payments });
});

app.get("/api/admin/overview", authRequired, adminRequired, (req, res) => {
  const activeSubscriptions = db.subscriptions.filter((s) => s.status === "active" && new Date(s.ends_at).getTime() > Date.now()).length;
  const revenue = db.payments.filter((p) => p.status === "success").reduce((sum, p) => sum + p.amount, 0);
  res.json({
    ok: true,
    stats: {
      users: db.users.length,
      payments: db.payments.length,
      revenue,
      activeSubscriptions
    }
  });
});

app.get("/api/admin/users", authRequired, adminRequired, (req, res) => {
  const rows = db.users
    .map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, created_at: u.created_at }))
    .sort((a, b) => b.id - a.id);
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

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

seedAdmin().then(() => {
  app.listen(PORT, () => {
    console.log(`StudyPro running on http://localhost:${PORT}`);
  });
});
