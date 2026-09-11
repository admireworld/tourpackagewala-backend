/**
 * AdmireDworld Travel — secure OTP login backend
 * ------------------------------------------------
 * - OTP is generated, hashed, and checked on the SERVER only.
 *   The browser never sees the OTP value.
 * - OTPs expire after 5 minutes and are single-use.
 * - Rate limiting on both send + verify endpoints to stop abuse.
 * - Successful verification returns a short-lived JWT session token.
 *
 * Env vars needed (see .env.example):
 *   PORT, JWT_SECRET, ALLOWED_ORIGIN,
 *   EMAIL_SERVICE, EMAIL_USER, EMAIL_PASS
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
app.set('trust proxy', 1);
const PORT = process.env.PORT...
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

/* ---------- Mailer ---------- */
// FIX (additive — OTP logic below is completely untouched): the transporter
// previously had no connection/greeting/socket timeouts, so if the SMTP
// connection to Gmail ever hangs (blocked port on the host, wrong network,
// bad credentials that Google doesn't reject quickly, etc.) the request
// could sit "in flight" for minutes with no response at all — which is
// exactly what makes the frontend button look permanently stuck on
// "Sending..." (the frontend's try/finally only resets the button once
// the request actually settles, success or failure). Explicit timeouts
// here make it fail FAST with a real, catchable error instead, so the
// existing try/catch in /api/send-otp below can do its job.
const transporter = nodemailer.createTransport({
  service: "gmail",
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendOtpEmail(toEmail, toName, otp) {
  // FIX (additive): fail immediately with a clear message if the mailer
  // credentials were never configured on this host, instead of letting
  // nodemailer attempt a login with undefined/blank values (which can be
  // slow and produces a confusing error). Nothing about OTP generation/
  // verification changes — this only guards the "send the email" step.
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error(
      "Email is not configured on the server yet — set EMAIL_USER and EMAIL_PASS " +
        "(a Gmail App Password, not your normal password) in the backend's environment variables."
    );
  }
  await transporter.sendMail({
    from: `"AdmireDworld Travel" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: "Your AdmireDworld Travel login OTP",
    text: `Hi ${toName},\n\nYour OTP is ${otp}. It is valid for 5 minutes.\n\nIf you didn't request this, you can ignore this email.`,
    html: `<p>Hi ${toName},</p><p>Your OTP is <strong style="font-size:20px;letter-spacing:3px;">${otp}</strong>.</p><p>It is valid for 5 minutes. If you didn't request this, you can ignore this email.</p>`,
  });
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

/* ---------- Routes ---------- */
app.get("/api/health", (req, res) => res.json({ ok: true }));

app.post("/api/send-otp", sendOtpLimiter, async (req, res) => {
  try {
    const { name, phone, email } = req.body || {};
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

    await sendOtpEmail(email, name, otp);
    res.json({ ok: true, message: "OTP sent." });
  } catch (err) {
    console.error("send-otp error:", err);
    res.status(500).json({ error: "Could not send OTP right now. Please try again." });
  }
});

app.post("/api/verify-otp", verifyOtpLimiter, async (req, res) => {
  try {
    const { email, otp } = req.body || {};
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
