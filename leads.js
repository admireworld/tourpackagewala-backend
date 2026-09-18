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
 * UPDATED (Referral attribution on leads — additive):
 * ------------------------------------------------------------
 * A lead/enquiry can now optionally carry referral info sent by the
 * frontend: referralCode (whichever referral link the customer originally
 * arrived on), initialPackage (the package that referral link pointed to,
 * if any) and finalPackage (the package the customer actually enquired
 * about — may be the same as initialPackage, or different if they browsed
 * and picked something else). None of this is required — a lead with no
 * referralCode behaves exactly as before.
 *
 * - If a referralCode is present, we look up who owns that code (reusing
 *   the same "refer" data store refer.js already writes to — read-only
 *   here, so this never touches refer.js's own logic/behaviour) and save
 *   that person's email/name onto the lead as referrerEmail/referrerName.
 *   Whoever generated/shared that code is the referrer — never the
 *   customer who clicked it.
 * - GET /api/leads/mine (authenticated with the referrer's own login
 *   session token — same one used by /api/refer/my-earnings) lets a
 *   referral partner see every enquiry that came in through their link,
 *   so it shows up on their own dashboard automatically, without waiting
 *   for a booking/confirmation.
 * - POST /api/leads/admin/verify-referral lets an admin mark a
 *   referral-linked lead as verified (genuine enquiry) or unverified —
 *   separate from the existing new/contacted/converted/closed status,
 *   since a referral needs its own admin sign-off before it's trusted.
 *
 * Env vars used (all optional, all already used elsewhere in this project):
 *   ADMIN_KEY  -> same secret used by blog.js/packages.js/refer.js etc.
 *   JWT_SECRET -> same secret server.js already uses to sign the customer
 *                 login token — used here only to authenticate a referral
 *                 partner's own GET /api/leads/mine request.
 *   EMAIL_SERVICE / EMAIL_USER / EMAIL_PASS -> same mailer vars as OTP emails.
 */

const express = require("express");
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const store = require("./store");

const router = express.Router();

const ADMIN_KEY = process.env.ADMIN_KEY || "";
const JWT_SECRET = process.env.JWT_SECRET; // same secret server.js uses to sign the login token

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

/* ---------- Storage (MongoDB if MONGODB_URI is set, else local JSON file — see store.js) ---------- */
async function loadData() {
  return store.load("leads", { leads: [] });
}

async function saveData(data) {
  return store.save("leads", data);
}

const isValidEmail = (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isValidPhone = (v) => !v || /^[0-9]{10}$/.test(v);

/* ---------- Referral lookup (read-only — reuses refer.js's own "refer" store) ----------
   Whoever owns this code (i.e. generated/shared this link) is the referrer.
   Returns null for a missing/unknown code — the lead is simply saved without
   referral attribution, exactly like before this feature existed. */
async function resolveReferrer(code) {
  const cleanCode = String(code || "").trim().toUpperCase();
  if (!cleanCode) return null;
  try {
    const referData = await store.load("refer", { byEmail: {}, byCode: {}, redeemedEmails: {} });
    const referrerEmail = referData.byCode ? referData.byCode[cleanCode] : null;
    if (!referrerEmail) return null;
    const entry = (referData.byEmail && referData.byEmail[referrerEmail]) || {};
    return { email: referrerEmail, name: entry.name || "" };
  } catch (err) {
    console.error("leads: could not resolve referral code:", err.message);
    return null;
  }
}

/* ---------- Auth check for a referral partner's own "my leads" endpoint ----------
   Reuses the same JWT session token server.js already hands out on login —
   same pattern as refer.js's requireAuth for /api/refer/my-earnings. */
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

  const data = await loadData();

  // Soft duplicate guard: same email/phone submitting again within 10 minutes
  // is treated as the same enquiry, not a fresh lead (prevents double entries
  // from a form re-submit / double click) — updates the existing record instead.
  const tenMinAgo = Date.now() - 10 * 60 * 1000;
  const dupe = data.leads.find(
    (l) =>
      new Date(l.createdAt).getTime() > tenMinAgo &&
      ((email && l.email === email) || (phone && l.phone === phone))
  );

  // Referral attribution (all optional — a lead with no referralCode behaves
  // exactly like before this feature existed). "Whoever shared the link" is
  // resolved from the code itself, never trusted from the client directly.
  const referralCode = String(b.referralCode || "").trim().toUpperCase();
  const initialPackage = String(b.initialPackage || "").trim();
  const finalPackage = String(b.finalPackage || b.interest || "").trim();
  const referrer = referralCode ? await resolveReferrer(referralCode) : null;

  if (dupe) {
    dupe.message = b.message ? String(b.message).trim() : dupe.message;
    dupe.interest = b.interest || dupe.interest;
    // Final package always reflects the customer's most recent actual choice —
    // if they enquire on package A then quickly switch and enquire on package
    // B (same dedupe window), the lead's finalPackage updates to B.
    if (finalPackage) dupe.finalPackage = finalPackage;
    // Referral Code / Initial Package / the resolved referrer, on the other
    // hand, are first-touch and sticky: once this lead is attributed to a
    // referrer, later enquiries within the same window never move it to a
    // different referrer or lose the original "initial package" the link
    // pointed to.
    if (referralCode && !dupe.referralCode) {
      dupe.referralCode = referralCode;
      dupe.referrerEmail = referrer ? referrer.email : "";
      dupe.referrerName = referrer ? referrer.name : "";
      dupe.initialPackage = initialPackage;
      dupe.referralVerified = false;
      dupe.referralVerifiedAt = null;
    }
    await saveData(data);
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
    // Referral attribution — empty strings / false when this lead didn't
    // come through a referral link, so nothing changes for normal leads.
    referralCode: referralCode || "",
    referrerEmail: referrer ? referrer.email : "",
    referrerName: referrer ? referrer.name : "",
    initialPackage: initialPackage || "",
    finalPackage: finalPackage || "",
    referralVerified: referralCode ? false : null, // admin sign-off, only meaningful for referral leads
    referralVerifiedAt: null,
    status: "new",
    createdAt: new Date().toISOString(),
  };

  data.leads.unshift(lead);
  data.leads = data.leads.slice(0, 5000);
  await saveData(data);

  notifyTeam(lead); // fire-and-forget, never blocks the response

  res.json({ ok: true, leadId: lead.id });
});

// Referral partner's own dashboard: every enquiry/lead captured through
// their referral link, newest first — shows up automatically as soon as a
// customer submits an enquiry, no admin action needed for it to appear
// here (admin verification, below, is separate and only affects the
// "Verified" flag shown alongside each row).
router.get("/mine", requireAuth, async (req, res) => {
  const email = String(req.user.email || "").trim().toLowerCase();
  const data = await loadData();
  const leads = data.leads
    .filter((l) => l.referrerEmail && l.referrerEmail.toLowerCase() === email)
    .map((l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      email: l.email,
      initialPackage: l.initialPackage || "",
      finalPackage: l.finalPackage || l.interest || "",
      status: l.status,
      referralVerified: !!l.referralVerified,
      createdAt: l.createdAt,
    }));
  res.json({ ok: true, leads });
});

// Admin: view all leads + a quick source/status breakdown.
router.get("/admin/all", async (req, res) => {
  const adminKey = req.query.adminKey || req.headers["x-admin-key"];
  if (ADMIN_KEY && adminKey !== ADMIN_KEY) {
    return res.status(401).json({ error: "Invalid admin key." });
  }
  const data = await loadData();

  const bySource = {};
  const byStatus = {};
  for (const l of data.leads) {
    bySource[l.source] = (bySource[l.source] || 0) + 1;
    byStatus[l.status] = (byStatus[l.status] || 0) + 1;
  }

  res.json({ ok: true, leads: data.leads, total: data.leads.length, bySource, byStatus });
});

// Admin: update a lead's status as the sales team works through the list.
router.post("/admin/status", async (req, res) => {
  const { adminKey, leadId, status } = req.body || {};
  if (ADMIN_KEY && adminKey !== ADMIN_KEY) {
    return res.status(401).json({ error: "Invalid admin key." });
  }
  if (!leadId || !VALID_STATUSES.has(status)) {
    return res.status(400).json({ error: "Valid leadId and status are required." });
  }
  const data = await loadData();
  const lead = data.leads.find((l) => l.id === leadId);
  if (!lead) return res.status(404).json({ error: "Lead not found." });
  lead.status = status;
  await saveData(data);
  res.json({ ok: true, lead });
});

// Admin: verify (or unverify) a referral-linked lead. This is separate from
// the new/contacted/converted/closed status above — it's specifically the
// admin's sign-off that a referred enquiry is genuine, shown on both the
// admin dashboard and the referrer's own "my leads" list.
router.post("/admin/verify-referral", async (req, res) => {
  const { adminKey, leadId, verified } = req.body || {};
  if (ADMIN_KEY && adminKey !== ADMIN_KEY) {
    return res.status(401).json({ error: "Invalid admin key." });
  }
  if (!leadId) return res.status(400).json({ error: "leadId is required." });
  const data = await loadData();
  const lead = data.leads.find((l) => l.id === leadId);
  if (!lead) return res.status(404).json({ error: "Lead not found." });
  if (!lead.referralCode) {
    return res.status(400).json({ error: "This lead has no referral to verify." });
  }
  lead.referralVerified = !!verified;
  lead.referralVerifiedAt = lead.referralVerified ? new Date().toISOString() : null;
  await saveData(data);
  res.json({ ok: true, lead });
});

module.exports = router;
