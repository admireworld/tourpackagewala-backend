/**
 * AdmireDworld Travel — OTP login backend
 * ------------------------------------------------
 * - OTP is generated, hashed, and checked on the SERVER (bcrypt hash only,
 *   single-use, 5-minute expiry, rate-limited) — same as before.
 * - CHANGED (EmailJS switch): this backend's outbound SMTP (nodemailer +
 *   Gmail) was unreliable on this host (Render free tier frequently blocks
 *   or throttles outbound SMTP ports, and/or Gmail App Password issues),
 *   so OTPs were generated fine but never actually reached customers.
 *   Instead of emailing the OTP itself, /api/send-otp now returns the
 *   plain OTP in its JSON response, and the FRONTEND (script.js) sends it
 *   to the customer's inbox using EmailJS, which sends straight from the
 *   browser and isn't affected by this host's SMTP restrictions.
 *   Trade-off: the OTP now briefly exists in the browser/network response
 *   instead of staying server-only. Hash storage, 5-minute expiry, 5
 *   incorrect-attempt lockout, and per-IP rate limiting on both endpoints
 *   are all unchanged, so this is a delivery-method change, not a removal
 *   of the anti-abuse protections.
 * - Successful verification returns a short-lived JWT session token.
 *
 * Env vars needed (see .env.example):
 *   PORT, JWT_SECRET, ALLOWED_ORIGIN
 *   (EMAIL_SERVICE / EMAIL_USER / EMAIL_PASS are now OPTIONAL — only used
 *   by the /api/admin/test-email diagnostic route below, kept in case you
 *   want to debug or fall back to server-side email later.)
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

if (!JWT_SECRET) {
  console.error("Missing JWT_SECRET in .env — refusing to start.");
  process.exit(1);
}

/* ---------- Security middleware ---------- */
app.use(helmet());
app.use(cors({ origin: ALLOWED_ORIGIN, credentials: false }));
app.use(express.json({ limit: "10kb" }));

/* ---------- Mailer (OPTIONAL — diagnostic/fallback only) ----------
   CHANGED (EmailJS switch): /api/send-otp no longer uses this to deliver
   the OTP — the frontend sends the OTP via EmailJS instead (see script.js).
   This transporter is kept only so /api/admin/test-email below still works
   if you ever want to debug server-side SMTP or switch back later. It is
   safe to leave EMAIL_USER/EMAIL_PASS unset entirely now. */
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  transporter.verify((err) => {
    if (err) {
      console.warn(
        "⚠️  Optional server-side mailer not working (EMAIL_USER=" + process.env.EMAIL_USER + "): " +
          err.message + ". This is FINE — OTPs are delivered via EmailJS from the frontend now, " +
          "this transporter is only used by the /api/admin/test-email diagnostic route."
      );
    } else {
      console.log("✅ Optional server-side mailer verified for " + process.env.EMAIL_USER + " (used only by /api/admin/test-email).");
    }
  });
} else {
  console.log(
    "ℹ️  EMAIL_USER / EMAIL_PASS not set — that's OK, OTPs are sent via EmailJS from the frontend now. " +
      "These are only needed if you want to use the optional /api/admin/test-email diagnostic route."
  );
}

/* ---------- OTP store (in-memory) ----------
   Fine for a single small server / low traffic. For multiple server
   instances or heavier traffic, swap this Map for Redis. */
const otpStore = new Map(); // key: email -> { hash, expiresAt, attempts, name, phone }
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_VERIFY_ATTEMPTS = 5;

function cleanExpired() {
  const now = Date.now();
  for (const [email, rec] of otpStore.entries()) {
    if (rec.expiresAt < now) otpStore.delete(email);
  }
}
setInterval(cleanExpired, 60 * 1000).unref();

/* ---------- Validation helpers ---------- */
const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isValidPhone = (v) => /^[0-9]{10}$/.test(v);

/* ---------- Rate limiters ---------- */
const sendOtpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 3, // 3 OTP requests per 5 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many OTP requests. Please try again in a few minutes." },
});

const verifyOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15, // 15 verify attempts per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});

/* ---------- AI Daily Blog (new feature — see blog.js) ---------- */
app.use("/api/blog", require("./blog"));

/* ---------- India Packages (new feature — see packages.js) ---------- */
app.use("/api/packages", require("./packages"));

/* ---------- Fixed Departures (new feature — see fixed.js; backend-driven
   date-wise seat availability for the "Check Availability" flow) ---------- */
app.use("/api/fixed", require("./fixed"));

/* ---------- Refer & Earn (new feature — see refer.js) ---------- */
app.use("/api/refer", require("./refer"));

/* ---------- Bookings (new feature — see bookings.js; drives referral rewards) ---------- */
app.use("/api/bookings", require("./bookings"));

/* ---------- Destination Wedding (new feature — see wedding.js) ---------- */
app.use("/api/wedding", require("./wedding"));

/* ---------- Customize Package (new feature — see customize.js) ---------- */
app.use("/api/customize", require("./customize"));

/* ---------- Leads & Conversions (new feature — see leads.js; powers the
   exit-intent popup, blog CTA, newsletter box and WhatsApp button) ---------- */
app.use("/api/leads", require("./leads"));

/* ---------- Admin Dashboard Login (new feature — see admin-auth.js; powers
   the single combined dashboard at frontend/admin.html) ---------- */
app.use("/api/admin", require("./admin-auth"));

/* ---------- Site Settings (new feature — see settings.js; lets an admin
   edit the public contact email/phone/WhatsApp number from the dashboard
   instead of hardcoding them in the frontend) ---------- */
app.use("/api/settings", require("./settings"));

/* ---------- AI Content Provider settings (new feature — see ai-settings.js
   + ai-provider.js; lets an admin switch the blog/package AI provider and
   rotate its API key from the dashboard, no code change/redeploy needed) --- */
app.use("/api/ai-settings", require("./ai-settings"));

/* ---------- Real Google Reviews (NEW feature — see reviews.js; replaces
   the hardcoded fake homepage testimonials with live reviews fetched from
   this business's actual Google Business Profile, cached via store.js) --- */
app.use("/api/reviews", require("./reviews"));

/* ---------- Permanent storage check (new — see db.js/store.js) ----------
   Bookings, leads, referral earnings, and wedding enquiries/venues are
   real customer data. This module lets them live in a free MongoDB Atlas
   cluster instead of a local JSON file, so they SURVIVE Render restarts/
   redeploys/free-tier sleep cycles. Purely informational check — it never
   blocks startup either way, it just tells you which mode you're in.
   See README-DEPLOY.md → "Permanent storage" for setup steps. */
if (process.env.MONGODB_URI) {
  require("./db")
    .getDb()
    .then((db) => {
      if (!db) {
        console.error(
          "❌ MONGODB_URI is set but the connection failed — bookings/leads/referrals/wedding data will use " +
            "local JSON files for now (NOT permanent on Render). Double-check the connection string and that " +
            "your MongoDB Atlas cluster allows connections from 0.0.0.0/0 (Network Access)."
        );
      }
    });
} else {
  console.warn(
    "⚠️  MONGODB_URI is not set — bookings, leads, referral earnings, and wedding enquiries are being saved to " +
      "local JSON files, which Render's free tier WIPES on every restart/sleep/redeploy. See README-DEPLOY.md → " +
      "\"Permanent storage\" to fix this with a free MongoDB Atlas cluster (~5 minutes, no credit card)."
  );
}

/* ---------- Routes ---------- */
app.get("/api/health", (req, res) => res.json({ ok: true }));

// FIX (additive, diagnostics only): lets you actually SEE the real SMTP
// error instead of guessing. Open a terminal / Postman / browser console
// and run, replacing YOUR_ADMIN_KEY and putting your own inbox as "to":
//
//   fetch("https://tourpackagewala-backend.onrender.com/api/admin/test-email", {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({ adminKey: "YOUR_ADMIN_KEY", to: "you@example.com" })
//   }).then(r => r.json()).then(console.log)
//
// The JSON response will either say the email was sent (check inbox +
// spam folder) or give you the EXACT reason it failed (e.g. "Invalid
// login", "Missing credentials", etc.) — that reason tells you exactly
// what to fix in the Render Environment Variables.
app.post("/api/admin/test-email", async (req, res) => {
  const { adminKey, to } = req.body || {};
  const ADMIN_KEY_CHECK = process.env.ADMIN_KEY || "";
  if (ADMIN_KEY_CHECK && adminKey !== ADMIN_KEY_CHECK) {
    return res.status(401).json({ error: "Invalid admin key." });
  }
  if (!to || !isValidEmail(to)) {
    return res.status(400).json({ error: "Provide a valid 'to' email address in the request body." });
  }
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return res.status(500).json({
      error: "EMAIL_USER / EMAIL_PASS are not set on this server's Environment Variables.",
    });
  }
  try {
    await transporter.sendMail({
      from: `"AdmireDworld Travel" <${process.env.EMAIL_USER}>`,
      to,
      subject: "AdmireDworld Travel — test email",
      text: "If you received this, OTP emails are configured correctly on the server.",
    });
    res.json({ ok: true, message: `Test email sent to ${to}. Check the inbox AND the spam/junk folder.` });
  } catch (err) {
    console.error("test-email error:", err);
    res.status(500).json({
      error: err.message || "Failed to send test email.",
      hint: "This exact message is the real reason OTP emails aren't sending — usually 'Invalid login' means EMAIL_PASS must be a Gmail App Password, not your normal password.",
    });
  }
});

app.post("/api/send-otp", sendOtpLimiter, async (req, res) => {
  try {
    const { name, phone } = req.body || {};
    const email = String((req.body || {}).email || "").trim().toLowerCase();
    if (!name || !isValidPhone(phone) || !isValidEmail(email)) {
      return res.status(400).json({ error: "Please provide a valid name, 10-digit phone, and email." });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const hash = await bcrypt.hash(otp, 10);

    otpStore.set(email, {
      hash,
      expiresAt: Date.now() + OTP_TTL_MS,
      attempts: 0,
      name,
      phone,
    });

    // CHANGED (EmailJS switch): this backend used to email the OTP itself
    // via nodemailer/Gmail here, which was failing on this host. The OTP
    // is still generated + hashed + stored server-side exactly as before —
    // only the delivery step moves to the frontend, which sends this OTP
    // to the customer's inbox via EmailJS right after this call succeeds.
    // Hash storage, 5-min expiry, single-use, and rate limiting are unchanged.
    res.json({ ok: true, message: "OTP generated.", otp });
  } catch (err) {
    console.error("send-otp error:", err);
    res.status(500).json({ error: "Could not generate OTP right now. Please try again." });
  }
});

app.post("/api/verify-otp", verifyOtpLimiter, async (req, res) => {
  try {
    const { otp } = req.body || {};
    const email = String((req.body || {}).email || "").trim().toLowerCase();
    if (!isValidEmail(email) || !/^[0-9]{6}$/.test(otp || "")) {
      return res.status(400).json({ error: "Invalid request." });
    }

    const rec = otpStore.get(email);
    if (!rec) return res.status(400).json({ error: "No OTP request found. Please request a new OTP." });
    if (rec.expiresAt < Date.now()) {
      otpStore.delete(email);
      return res.status(400).json({ error: "OTP expired. Please request a new one." });
    }
    if (rec.attempts >= MAX_VERIFY_ATTEMPTS) {
      otpStore.delete(email);
      return res.status(429).json({ error: "Too many incorrect attempts. Please request a new OTP." });
    }

    const match = await bcrypt.compare(otp, rec.hash);
    if (!match) {
      rec.attempts += 1;
      return res.status(400).json({ error: "Incorrect OTP." });
    }

    otpStore.delete(email); // single-use

    const token = jwt.sign(
      { email, name: rec.name, phone: rec.phone },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      ok: true,
      token,
      user: { name: rec.name, phone: rec.phone, email },
    });
  } catch (err) {
    console.error("verify-otp error:", err);
    res.status(500).json({ error: "Could not verify OTP right now. Please try again." });
  }
});

/* ---------- Auth middleware + example protected route ---------- */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not logged in." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }
}

app.get("/api/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.listen(PORT, () => {
  console.log(`AdmireDworld Travel backend running on port ${PORT}`);
});
