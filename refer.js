/**
 * AdmireDworld Travel — Refer & Earn module
 * -------------------------------------------
 * NEW FEATURE — does not touch any existing OTP/login/blog/packages code.
 * Mount this router in server.js with: app.use("/api/refer", require("./refer"));
 *
 * UPDATED (Referral Partner permissions — admin-controlled):
 * ------------------------------------------------------------
 * Previously every logged-in user got a WORKING referral code the moment
 * they opened the tab, and everyone shared the same REFERRAL_PERCENT.
 * That is now fully admin-controlled instead:
 *
 * - Logging in and opening the "Refer & Earn" tab only creates a referral
 *   PARTNER REQUEST (status "pending") — the code is generated internally
 *   but is NOT active yet, and won't be shown to the customer.
 * - An admin must explicitly grant access from the Admin Dashboard
 *   (POST /api/refer/admin/approve), choosing the exact commission %
 *   for THAT person. Nobody gets a working referral link, and nobody
 *   earns anything, until an admin does this.
 * - Once approved, that person's own "Refer & Earn" tab unlocks: their
 *   referral link, their commission %, and a live list of every booking
 *   confirmed through their link — booking id, destination, the
 *   booking's business amount, and the commission they earned on it
 *   (GET /api/refer/my-earnings, authenticated with their own login
 *   session token — same one used by /api/bookings/mine).
 * - An admin can change a partner's commission % at any time, or revoke
 *   their access entirely (their link then stops working for new
 *   sign-ups; nothing already earned is removed).
 * - The referrer only actually EARNS money once that referred person's
 *   booking is CONFIRMED (see bookings.js — POST /api/bookings/admin/confirm
 *   calls creditReferralForBooking() below), using THAT referrer's own
 *   commission % — never a shared/global percentage.
 * - As soon as a reward is credited, an email goes out to the referrer
 *   (in English) letting them know their referral's booking is confirmed
 *   and asking them to reply with their payment scanner/UPI QR so the
 *   reward can be paid out.
 * - Data is saved via store.js (MongoDB if configured, else a local JSON
 *   file), same pattern as blog.js.
 *
 * Env vars used (all optional):
 *   ADMIN_KEY   -> same secret used by blog.js / packages.js, protects
 *                  every admin endpoint below.
 *   JWT_SECRET  -> same secret server.js already uses for the customer
 *                  login token — used here to authenticate a referral
 *                  partner's own GET /api/refer/my-earnings request.
 *   EMAIL_SERVICE / EMAIL_USER / EMAIL_PASS -> same mailer env vars used
 *                  for OTP emails in server.js; reused here to notify
 *                  referrers. If not set, the reward is still credited,
 *                  the email is just skipped.
 */

const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");
const store = require("./store");

const router = express.Router();

const ADMIN_KEY = process.env.ADMIN_KEY || "";
const JWT_SECRET = process.env.JWT_SECRET; // same secret server.js uses to sign the login token
const WELCOME_BONUS = 500; // ₹ credited to the new user who signs up via a referral (unchanged, given at signup)

/* ---------- Storage (MongoDB if MONGODB_URI is set, else local JSON file — see store.js) ---------- */
async function loadData() {
  return store.load("refer", { byEmail: {}, byCode: {}, redeemedEmails: {} });
}

async function saveData(data) {
  return store.save("refer", data);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function makeCode(email) {
  // Short, human-shareable code derived from the email + a little randomness,
  // e.g. "PRIYA4F2A". Not secret — it's meant to be shared once approved.
  const namePart = normalizeEmail(email).split("@")[0].replace(/[^a-z0-9]/gi, "").slice(0, 5).toUpperCase() || "TRIP";
  const randPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${namePart}${randPart}`;
}

function money(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN");
}

/* ---------- Backfill helper (additive — keeps old saved referrer records working) ----------
   Any referrer entry saved before the Referral Partner permission upgrade
   (or created fresh via /my-code below) just gets safe defaults here, on
   every load. Nothing is overwritten if the field already exists. */
function withPartnerDefaults(entry) {
  const approved = typeof entry.approved === "boolean" ? entry.approved : false;
  return {
    ...entry,
    approved,
    commissionPercent:
      entry.commissionPercent !== undefined && entry.commissionPercent !== null && entry.commissionPercent !== ""
        ? Number(entry.commissionPercent)
        : null,
    status: entry.status || (approved ? "approved" : "pending"),
    referredCount: Number(entry.referredCount) || 0,
    rewardEarned: Number(entry.rewardEarned) || 0,
    earnings: Array.isArray(entry.earnings) ? entry.earnings : [],
    requestedAt: entry.requestedAt || entry.createdAt || new Date().toISOString(),
    approvedAt: entry.approvedAt || null,
    // ---- Influencer/affiliate application fields (Refer & Earn application form) ----
    // Additive: old entries created before this form existed (via /my-code) just get
    // empty strings here, nothing breaks.
    phone: entry.phone || "",
    socialProfile: entry.socialProfile || "",
    followers: entry.followers || "",
    contentCategory: entry.contentCategory || "",
    audienceLocation: entry.audienceLocation || "",
    reason: entry.reason || "",
  };
}

/* ---------- Auth check for the referral partner's own "my earnings" endpoint ----------
   Reuses the same JWT session token server.js already hands out on login —
   this is what makes the referral dashboard show up for the same account
   on ANY device: looked up by the verified email inside the token. */
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

function checkAdminKey(req, res) {
  const adminKey = req.query.adminKey || req.headers["x-admin-key"] || (req.body || {}).adminKey;
  if (ADMIN_KEY && adminKey !== ADMIN_KEY) {
    res.status(401).json({ error: "Invalid admin key." });
    return false;
  }
  return true;
}

/* ---------- Best-effort email notification (reuses the same mailer env vars as server.js) ---------- */
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

async function sendReferralRewardEmail({ referrerEmail, referrerName, bookingItemName, rewardAmount }) {
  const t = getTransporter();
  if (!t) return; // no email configured — reward is still credited, email just skipped
  try {
    await t.sendMail({
      from: `"AdmireDworld Travel" <${process.env.EMAIL_USER}>`,
      to: referrerEmail,
      subject: "Your referral's booking is confirmed — claim your reward",
      text:
        `Hi ${referrerName || "there"},\n\n` +
        `Great news — a booking made through your referral link (${bookingItemName}) has just been confirmed.\n` +
        `You've earned ${money(rewardAmount)} in referral reward.\n\n` +
        `To receive your payout, please reply to this email with your payment scanner (UPI QR code) or UPI ID.\n\n` +
        `Thanks for spreading the word about AdmireDworld Travel!\n\n— Team AdmireDworld Travel`,
      html:
        `<p>Hi ${referrerName || "there"},</p>` +
        `<p>Great news — a booking made through your referral link (<strong>${bookingItemName}</strong>) has just been confirmed.</p>` +
        `<p>You've earned <strong style="font-size:18px;">${money(rewardAmount)}</strong> in referral reward.</p>` +
        `<p>To receive your payout, please reply to this email with your <strong>payment scanner (UPI QR code) or UPI ID</strong>.</p>` +
        `<p>Thanks for spreading the word about AdmireDworld Travel!</p><p>— Team AdmireDworld Travel</p>`,
    });
  } catch (err) {
    console.error("refer: reward email failed:", err.message);
  }
}

/* ---------- Rate limiting ---------- */
const applyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

/* ---------- Routes ---------- */

// Called when a logged-in user opens the Refer & Earn tab. Creates (or
// looks up) their referral PARTNER REQUEST. Does NOT hand out a working
// code — that only happens once an admin approves them (see /my-earnings
// and /admin/approve below). Kept intentionally lightweight so it's safe
// to call every time the tab is opened.
router.post("/my-code", async (req, res) => {
  const email = normalizeEmail((req.body || {}).email);
  const name = ((req.body || {}).name || "").trim();
  if (!email) return res.status(400).json({ error: "Email is required." });

  const data = await loadData();
  let entry = data.byEmail[email];

  if (!entry) {
    let code = makeCode(email);
    while (data.byCode[code]) code = makeCode(email); // avoid the rare collision
    entry = withPartnerDefaults({
      email,
      name,
      code,
      referredCount: 0,
      rewardEarned: 0,
      createdAt: new Date().toISOString(),
    });
    data.byEmail[email] = entry;
    data.byCode[code] = email;
    await saveData(data);
  } else {
    entry = withPartnerDefaults(entry);
    if (name && entry.name !== name) entry.name = name;
    data.byEmail[email] = entry;
    await saveData(data);
  }

  res.json({ ok: true, status: entry.status, approved: entry.approved });
});

// ---------------------------------------------------------------------
// NEW: full influencer/affiliate application form.
// Website par ab "Refer & Earn" tab kholte hi koi request nahi banti —
// user ko pehle ye application form bharni hoti hai. Submit hone ke
// baad status "pending" set hota hai; affiliate link/code us waqt tak
// generate/active NAHI hota jab tak admin dashboard se approve na kare
// (see /admin/approve above — wahi status ko "approved" karta hai aur
// tabhi asli referral link customer ko dikhta hai).
// Flow: Pending -> Approved -> Affiliate Active.
router.post("/apply-partner", applyLimiter, async (req, res) => {
  const body = req.body || {};
  const email = normalizeEmail(body.email);
  const name = String(body.name || "").trim();
  const phone = String(body.phone || "").trim();
  const socialProfile = String(body.socialProfile || "").trim();
  const followers = String(body.followers || "").trim();
  const contentCategory = String(body.contentCategory || "").trim();
  const audienceLocation = String(body.audienceLocation || "").trim();
  const reason = String(body.reason || "").trim();

  if (!email) return res.status(400).json({ error: "Email is required." });
  if (!name || !socialProfile || !reason) {
    return res.status(400).json({ error: "Please fill in your name, Instagram/YouTube profile, and why you want to promote us." });
  }

  const data = await loadData();
  let entry = data.byEmail[email];

  if (!entry) {
    let code = makeCode(email);
    while (data.byCode[code]) code = makeCode(email); // avoid the rare collision
    entry = withPartnerDefaults({
      email,
      name,
      code,
      phone,
      socialProfile,
      followers,
      contentCategory,
      audienceLocation,
      reason,
      referredCount: 0,
      rewardEarned: 0,
      createdAt: new Date().toISOString(),
    });
    data.byEmail[email] = entry;
    data.byCode[code] = email;
  } else {
    entry = withPartnerDefaults(entry);
    // An already-APPROVED partner's live application isn't silently overwritten by
    // a re-submit — an admin who wants to change details can do it from the dashboard.
    if (!entry.approved) {
      entry.name = name;
      entry.phone = phone;
      entry.socialProfile = socialProfile;
      entry.followers = followers;
      entry.contentCategory = contentCategory;
      entry.audienceLocation = audienceLocation;
      entry.reason = reason;
      entry.status = entry.status === "revoked" ? "pending" : "pending"; // re-applying always goes back to "pending" for review
      entry.requestedAt = new Date().toISOString();
    }
    data.byEmail[email] = entry;
  }

  await saveData(data);
  res.json({ ok: true, status: entry.status, approved: entry.approved });
});

// Referral partner's own dashboard — authenticated with their login
// session token. Only returns the working code/link/commission/earnings
// once an admin has approved them; otherwise reports their pending/
// revoked status so the frontend can show the right message.
router.get("/my-earnings", requireAuth, async (req, res) => {
  const email = normalizeEmail(req.user.email);
  const data = await loadData();
  const raw = data.byEmail[email];

  if (!raw) {
    return res.json({
      ok: true,
      requested: false,
      approved: false,
      status: "pending",
      code: null,
      commissionPercent: null,
      referredCount: 0,
      rewardEarned: 0,
      earnings: [],
    });
  }

  const entry = withPartnerDefaults(raw);
  res.json({
    ok: true,
    requested: true,
    approved: entry.approved,
    status: entry.status,
    code: entry.approved ? entry.code : null,
    commissionPercent: entry.commissionPercent,
    referredCount: entry.referredCount,
    rewardEarned: entry.rewardEarned,
    earnings: entry.earnings, // [{ bookingId, destination, itemName, amount, commissionPercent, rewardAmount, creditedAt }]
    // Submitted application details (so the frontend can show what was applied
    // with, and prefill the form again if the person was revoked and re-applies).
    application: {
      name: entry.name || "",
      phone: entry.phone || "",
      socialProfile: entry.socialProfile || "",
      followers: entry.followers || "",
      contentCategory: entry.contentCategory || "",
      audienceLocation: entry.audienceLocation || "",
      reason: entry.reason || "",
      requestedAt: entry.requestedAt,
    },
  });
});

// Link a NEW visitor to whoever referred them: called once, right after
// that visitor verifies their OTP, if they arrived with a ?ref=CODE link.
// Only works if the referrer has been APPROVED by an admin — an
// unapproved/pending/revoked referral code links nobody. This does NOT
// pay out any reward yet — that only happens once the referred person's
// booking is confirmed (see creditReferralForBooking below).
router.post("/apply", applyLimiter, async (req, res) => {
  const { code, refereeEmail, refereeName } = req.body || {};
  const cleanEmail = normalizeEmail(refereeEmail);
  const cleanCode = String(code || "").trim().toUpperCase();

  if (!cleanCode || !cleanEmail) {
    return res.status(400).json({ error: "Missing referral code or email." });
  }

  const data = await loadData();
  const referrerEmail = data.byCode[cleanCode];
  if (!referrerEmail) {
    return res.status(404).json({ error: "Referral code not found." });
  }
  if (referrerEmail === cleanEmail) {
    return res.status(400).json({ error: "You can't refer yourself." });
  }
  if (data.redeemedEmails[cleanEmail]) {
    return res.status(409).json({ error: "This email has already redeemed a referral." });
  }

  const referrer = withPartnerDefaults(data.byEmail[referrerEmail] || {});
  if (!referrer.approved) {
    return res.status(403).json({ error: "This referral link isn't active yet." });
  }

  data.redeemedEmails[cleanEmail] = {
    code: cleanCode,
    referrerEmail,
    refereeName: (refereeName || "").trim(),
    appliedAt: new Date().toISOString(),
    rewardedBookingIds: [], // filled in once a confirmed booking actually pays the referrer
  };

  await saveData(data);
  res.json({ ok: true, welcomeBonus: WELCOME_BONUS, referrerName: referrer.name || null });
});

// Admin: see every referral request (pending, approved, revoked), sorted
// by who's earned the most. Each row includes that person's own
// commission % and their full earnings breakdown (booking id,
// destination, business amount, commission), so the admin can see
// exactly what's owed to each partner.
router.get("/admin/all", async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  const data = await loadData();
  const rows = Object.values(data.byEmail)
    .map(withPartnerDefaults)
    .sort((a, b) => b.rewardEarned - a.rewardEarned);
  res.json({ ok: true, referrers: rows });
});

// Admin: grant (or update, or revoke) referral partner access for one
// person, and choose exactly what commission % they earn. This is the
// ONLY way a referral code becomes active — nothing here happens
// automatically. Call again any time to change the commission % for an
// already-approved partner, or with approved:false to revoke access.
router.post("/admin/approve", async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  const { email, commissionPercent, approved } = req.body || {};
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return res.status(400).json({ error: "email is required." });

  const data = await loadData();
  const raw = data.byEmail[cleanEmail];
  if (!raw) return res.status(404).json({ error: "No referral request found for this email yet." });

  const entry = withPartnerDefaults(raw);
  const wantApprove = approved !== false; // default: approving/updating. Pass approved:false to revoke.

  if (wantApprove) {
    const pct = Number(commissionPercent);
    if (commissionPercent === undefined || commissionPercent === null || commissionPercent === "" || isNaN(pct)) {
      return res.status(400).json({ error: "Please set a commission % for this referrer." });
    }
    if (pct < 0 || pct > 100) {
      return res.status(400).json({ error: "Commission % must be between 0 and 100." });
    }
    entry.approved = true;
    entry.commissionPercent = pct;
    entry.status = "approved";
    entry.approvedAt = new Date().toISOString();
  } else {
    entry.approved = false;
    entry.status = "revoked";
  }

  data.byEmail[cleanEmail] = entry;
  await saveData(data);
  res.json({ ok: true, referrer: entry });
});

/* -----------------------------------------------------------------------
   Called from bookings.js when an admin confirms a booking. Reward is
   PERCENTAGE-based using THIS REFERRER'S OWN commission % (set by an
   admin via /admin/approve above) — never a shared/global percentage,
   and never paid at all unless that referrer is currently approved.
   Returns null if the booking's email wasn't a referred signup, or the
   referrer isn't approved, or this exact booking was already rewarded.
----------------------------------------------------------------------- */
async function creditReferralForBooking({ refereeEmail, bookingId, bookingItemName, bookingDestination, bookingAmount }) {
  const cleanEmail = normalizeEmail(refereeEmail);
  const data = await loadData();
  const redemption = data.redeemedEmails[cleanEmail];
  if (!redemption) return null; // this person wasn't referred by anyone

  redemption.rewardedBookingIds = redemption.rewardedBookingIds || [];
  if (redemption.rewardedBookingIds.includes(bookingId)) return null; // already rewarded for this exact booking

  const referrer = withPartnerDefaults(data.byEmail[redemption.referrerEmail] || {});
  if (!referrer.email) return null;
  if (!referrer.approved || referrer.commissionPercent === null) {
    // Admin hasn't (or no longer has) approved this referrer with a
    // commission % — never pay out silently.
    return null;
  }

  const pct = referrer.commissionPercent;
  const rewardAmount = Math.round((Number(bookingAmount) || 0) * (pct / 100));

  referrer.referredCount += 1;
  referrer.rewardEarned += rewardAmount;
  referrer.earnings.unshift({
    bookingId,
    refereeEmail: cleanEmail,
    refereeName: redemption.refereeName || "",
    itemName: bookingItemName,
    destination: bookingDestination || "",
    amount: Number(bookingAmount) || 0,
    commissionPercent: pct,
    rewardAmount,
    creditedAt: new Date().toISOString(),
  });
  redemption.rewardedBookingIds.push(bookingId);

  data.byEmail[redemption.referrerEmail] = referrer;
  await saveData(data);

  await sendReferralRewardEmail({
    referrerEmail: referrer.email,
    referrerName: referrer.name,
    bookingItemName,
    rewardAmount,
  });

  // Field name kept as "referralPercent" (rather than "commissionPercent")
  // so bookings.js / the existing admin bookings view, which already
  // reads referralReward.referralPercent, keep working unchanged.
  return { referrerEmail: referrer.email, referrerName: referrer.name, rewardAmount, referralPercent: pct };
}

module.exports = router;
module.exports.creditReferralForBooking = creditReferralForBooking;
