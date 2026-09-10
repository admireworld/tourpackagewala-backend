/**
 * AdmireDworld Travel — Admin Dashboard Login module
 * -------------------------------------------
 * NEW FEATURE — does not touch any existing OTP/login/blog/packages/refer/
 * bookings/wedding/customize/leads code.
 * Mount this router in server.js with: app.use("/api/admin", require("./admin-auth"));
 *
 * What it does
 * ------------
 * Every other admin panel in this project (blog, packages, customize,
 * bookings, refer, wedding, leads) already protects itself with a single
 * ADMIN_KEY env var, checked as a body field / query param / x-admin-key
 * header. That's fine for the API, but it meant the admin had to paste
 * that raw key into a separate box on every single tab of the public
 * site (opened with ?admin=1).
 *
 * This module gives the admin ONE proper login (username + password) for
 * the single combined dashboard at frontend/admin.html:
 *
 * - POST /api/admin/login checks the given username/password against
 *   ADMIN_USERNAME / ADMIN_PASSWORD (or ADMIN_PASSWORD_HASH) env vars.
 *   On success it returns a short-lived session token (JWT) PLUS the
 *   existing ADMIN_KEY value. The dashboard stores both in the browser's
 *   sessionStorage (cleared when the tab is closed) and automatically
 *   attaches the adminKey to every request it makes to the existing
 *   admin endpoints — nothing about those endpoints changes, they still
 *   only ever see the same ADMIN_KEY they already checked before.
 * - POST /api/admin/verify lets the dashboard silently confirm an
 *   existing session token is still valid (e.g. after a page refresh)
 *   without asking the admin to log in again every time.
 * - Login attempts are rate-limited to make brute-forcing impractical.
 *
 * Env vars used:
 *   ADMIN_USERNAME       -> login username (default: "admin")
 *   ADMIN_PASSWORD       -> plain-text login password (simplest option —
 *                            just set a strong, unique value)
 *   ADMIN_PASSWORD_HASH  -> OPTIONAL: a bcrypt hash instead of a plain
 *                            password (used instead of ADMIN_PASSWORD if
 *                            both happen to be set). Generate one with:
 *                            node -e "console.log(require('bcryptjs').hashSync('yourPassword',10))"
 *   ADMIN_KEY            -> same secret already used everywhere else in
 *                            this project (blog/packages/refer/etc.)
 *   JWT_SECRET            -> same secret server.js already uses for the
 *                            customer login token
 */

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");

const router = express.Router();

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || "";
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const JWT_SECRET = process.env.JWT_SECRET;

/* ---------- Rate limiting (stop brute-forcing the login form) ---------- */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // 10 attempts per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again in a few minutes." },
});

async function checkPassword(candidate) {
  if (ADMIN_PASSWORD_HASH) return bcrypt.compare(String(candidate || ""), ADMIN_PASSWORD_HASH);
  if (ADMIN_PASSWORD) return candidate === ADMIN_PASSWORD;
  return false; // nothing configured on the server — refuse every login rather than allow a blank password
}

/* ---------- Routes ---------- */

router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }
    if (!ADMIN_PASSWORD && !ADMIN_PASSWORD_HASH) {
      return res.status(500).json({
        error:
          "Admin login isn't configured yet. Set ADMIN_USERNAME and ADMIN_PASSWORD (or ADMIN_PASSWORD_HASH) in the backend's environment variables.",
      });
    }

    const validUser = String(username).trim() === ADMIN_USERNAME;
    const validPass = await checkPassword(password);
    if (!validUser || !validPass) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const token = jwt.sign({ role: "admin", username: ADMIN_USERNAME }, JWT_SECRET, { expiresIn: "12h" });
    res.json({ ok: true, token, adminKey: ADMIN_KEY, expiresIn: "12h" });
  } catch (err) {
    console.error("admin login error:", err);
    res.status(500).json({ error: "Could not log in right now. Please try again." });
  }
});

// Lets the dashboard silently re-validate a stored session token, e.g. on page load,
// instead of asking the admin to log in again every time they refresh.
router.post("/verify", (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(401).json({ ok: false, error: "No session token." });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== "admin") return res.status(401).json({ ok: false, error: "Invalid session." });
    res.json({ ok: true, adminKey: ADMIN_KEY });
  } catch {
    res.status(401).json({ ok: false, error: "Session expired. Please log in again." });
  }
});

module.exports = router;
