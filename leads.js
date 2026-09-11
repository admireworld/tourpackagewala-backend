/**
 * AdmireDworld Travel — Leads & Conversions module
 * -------------------------------------------
 * NEW FEATURE — does not touch any existing OTP/login/blog/packages/refer/
 * bookings/wedding/customize code.
 * Mount this router in server.js with: app.use("/api/leads", require("./leads"));
 *
 * What it does
 * ------------
 * This is the "conversions" side of turning site traffic (organic, the AI
 * blog, ads, referrals, etc.) into actual enquiries the sales team can call:
 *
 * - POST /api/leads — captures a lead from any of the new on-site lead
 *   magnets (exit-intent popup, blog call-to-action, newsletter box,
 *   WhatsApp click, sticky quote bar). Every lead also stores WHERE it
 *   came from: page, source, and first-touch UTM/campaign params — so you
 *   can see which traffic source is actually converting.
 * - Saved to a local JSON file (leads-data.json), same pattern as
 *   blog.js/refer.js/wedding.js. Best-effort email notification to the
 *   team inbox on every new lead (reuses the same mailer env vars already
 *   used for OTP/refer/wedding emails — no new env vars required).
 * - GET /api/leads/admin/all — admin dashboard data: every lead, newest
 *   first, plus a source/status breakdown so you can see what's working.
 * - POST /api/leads/admin/status — mark a lead "contacted" / "converted" /
 *   "closed" as your team works through the list.
 * - Simple duplicate guard: the same email/phone can't spam-submit the
 *   popup more than once in a short window (prevents accidental double
 *   leads, not a hard block on genuinely re-enquiring).
 *
 * Env vars used (all optional, all already used elsewhere in this project):
 *   ADMIN_KEY -> same secret used by blog.js/packages.js/refer.js etc.
 *   EMAIL_SERVICE / EMAIL_USER / EMAIL_PASS -> same mailer vars as OTP emails.
 */

const express = require("express");
const fs = require("fs");
const path = require("path");
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");

const router = express.Router();

const DATA_FILE = path.join(__dirname, "leads-data.json");
const ADMIN_KEY = process.env.ADMIN_KEY || "";

const VALID_SOURCES = new Set([
  "exit_popup",
  "timed_popup",
  "blog_cta",
  "newsletter",
  "whatsapp_click",
  "sticky_bar",
  "package_enquiry", // "Book Now" query form on a package's own detail page
  "other",
]);
const VALID_STATUSES = new Set(["new", "contacted", "converted", "closed"]);

/* ---------- Storage (simple JSON file) ---------- */
function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return { leads: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

const isValidEmail = (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isValidPhone = (v) => !v || /^[0-9]{10}$/.test(v);

/* ---------- Best-effort email notification (reuses the same mailer setup as server.js) ---------- */
let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
  transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
  return transporter;
}

async function notifyTeam(lead) {
  const t = getTransporter();
  if (!t) return; // no email configured — lead is still saved to disk
  try {
    await t.sendMail({
      from: `"AdmireDworld Travel" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: `New lead (${lead.source}) — ${lead.name}`,
      text:
        `Name: ${lead.name}\nPhone: ${lead.phone || "-"}\nEmail: ${lead.email || "-"}\n` +
        `Interest: ${lead.interest || "-"}\nMessage: ${lead.message || "-"}\n` +
        `Source: ${lead.source}\nPage: ${lead.page || "-"}\n` +
        `UTM: ${JSON.stringify(lead.utm || {})}\nCreated: ${lead.createdAt}`,
      html:
        `<p><strong>Name:</strong> ${lead.name}<br>` +
        `<strong>Phone:</strong> ${lead.phone || "-"}<br>` +
        `<strong>Email:</strong> ${lead.email || "-"}<br>` +
        `<strong>Interest:</strong> ${lead.interest || "-"}<br>` +
        `<strong>Message:</strong> ${lead.message || "-"}</p>` +
        `<p><strong>Source:</strong> ${lead.source} &middot; <strong>Page:</strong> ${lead.page || "-"}</p>` +
        `<p><strong>Campaign:</strong> ${JSON.stringify(lead.utm || {})}</p>`,
    });
  } catch (err) {
    console.error("leads: notify email failed:", err.message);
  }
}

/* ---------- Rate limiting ---------- */
const leadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions. Please try again shortly." },
});

/* ---------- Routes ---------- */

// Public: capture a lead from any on-site lead magnet.
router.post("/", leadLimiter, async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || "").trim();
  const phone = String(b.phone || "").trim();
  const email = String(b.email || "").trim().toLowerCase();
  const source = VALID_SOURCES.has(b.source) ? b.source : "other";

  if (!name || (!phone && !email)) {
    return res.status(400).json({ error: "Please share your name and a phone number or email." });
  }
  if (!isValidPhone(phone)) {
    return res.status(400).json({ error: "Please enter a valid 10-digit phone number." });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Please enter a valid email." });
  }

  const data = loadData();

  // Soft duplicate guard: same email/phone submitting again within 10 minutes
  // is treated as the same enquiry, not a fresh lead (prevents double entries
  // from a form re-submit / double click) — updates the existing record instead.
  const tenMinAgo = Date.now() - 10 * 60 * 1000;
  const dupe = data.leads.find(
    (l) =>
      new Date(l.createdAt).getTime() > tenMinAgo &&
      ((email && l.email === email) || (phone && l.phone === phone))
  );
  if (dupe) {
    dupe.message = b.message ? String(b.message).trim() : dupe.message;
    dupe.interest = b.interest || dupe.interest;
    saveData(data);
    return res.json({ ok: true, leadId: dupe.id, deduped: true });
  }

  const lead = {
    id: `lead-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name,
    phone,
    email,
    interest: (b.interest || "").trim(),
    message: (b.message || "").trim(),
    source,
    page: (b.page || "").trim(),
    utm: {
      source: b.utm_source || "",
      medium: b.utm_medium || "",
      campaign: b.utm_campaign || "",
      term: b.utm_term || "",
      content: b.utm_content || "",
      landingPage: b.landing_page || "",
      referrer: b.referrer || "",
    },
    status: "new",
    createdAt: new Date().toISOString(),
  };

  data.leads.unshift(lead);
  data.leads = data.leads.slice(0, 5000);
  saveData(data);

  notifyTeam(lead); // fire-and-forget, never blocks the response

  res.json({ ok: true, leadId: lead.id });
});

// Admin: view all leads + a quick source/status breakdown.
router.get("/admin/all", (req, res) => {
  const adminKey = req.query.adminKey || req.headers["x-admin-key"];
  if (ADMIN_KEY && adminKey !== ADMIN_KEY) {
    return res.status(401).json({ error: "Invalid admin key." });
  }
  const data = loadData();

  const bySource = {};
  const byStatus = {};
  for (const l of data.leads) {
    bySource[l.source] = (bySource[l.source] || 0) + 1;
    byStatus[l.status] = (byStatus[l.status] || 0) + 1;
  }

  res.json({ ok: true, leads: data.leads, total: data.leads.length, bySource, byStatus });
});

// Admin: update a lead's status as the sales team works through the list.
router.post("/admin/status", (req, res) => {
  const { adminKey, leadId, status } = req.body || {};
  if (ADMIN_KEY && adminKey !== ADMIN_KEY) {
    return res.status(401).json({ error: "Invalid admin key." });
  }
  if (!leadId || !VALID_STATUSES.has(status)) {
    return res.status(400).json({ error: "Valid leadId and status are required." });
  }
  const data = loadData();
  const lead = data.leads.find((l) => l.id === leadId);
  if (!lead) return res.status(404).json({ error: "Lead not found." });
  lead.status = status;
  saveData(data);
  res.json({ ok: true, lead });
});

module.exports = router;
