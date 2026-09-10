/**
 * AdmireDworld Travel — Refer & Earn module
 * -------------------------------------------
 * NEW FEATURE — does not touch any existing OTP/login/blog/packages code.
 * Mount this router in server.js with: app.use("/api/refer", require("./refer"));
 *
 * What it does
 * ------------
 * - Every logged-in user gets a short, shareable referral code tied to
 *   their email (created the first time they open the Refer & Earn tab).
 * - When a NEW visitor signs up (verifies OTP) after arriving via
 *   someone's referral link (?ref=CODE), the frontend calls
 *   POST /api/refer/apply — this only LINKS the two people together
 *   (and gives the new user their welcome bonus). No reward is paid
 *   out yet at this point.
 * - The referrer only actually EARNS money once that referred person's
 *   booking is CONFIRMED (see bookings.js — POST /api/bookings/admin/confirm
 *   calls creditReferralForBooking() below). The reward is a PERCENTAGE
 *   of that booking's amount (REFERRAL_PERCENT), not a flat number, so
 *   bigger bookings earn the referrer more.
 * - As soon as a reward is credited, an email goes out to the referrer
 *   (in English) letting them know their referral's booking is confirmed
 *   and asking them to reply with their payment scanner/UPI QR so the
 *   reward can be paid out.
 * - Data is saved to a local JSON file (refer-data.json) so it survives
 *   restarts as long as the disk isn't wiped, same pattern as blog.js.
 *
 * Env vars used (all optional):
 *   ADMIN_KEY         -> same secret used by blog.js / packages.js, protects
 *                         the admin "view all referrals" endpoint.
 *   REFERRAL_PERCENT  -> % of a confirmed booking's amount paid to the
 *                         referrer. Defaults to 5 (i.e. 5%).
 *   EMAIL_SERVICE / EMAIL_USER / EMAIL_PASS -> same mailer env vars used
 *                         for OTP emails in server.js; reused here to
 *                         notify referrers. If not set, the reward is
 *                         still credited, the email is just skipped.
 */

const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");

const router = express.Router();

const DATA_FILE = path.join(__dirname, "refer-data.json");
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const REFERRAL_PERCENT = Number(process.env.REFERRAL_PERCENT) || 5; // % of booking amount, paid to the referrer
const WELCOME_BONUS = 500; // ₹ credited to the new user who signs up via a referral (unchanged, given at signup)

/* ---------- Storage (simple JSON file) ---------- */
function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return { byEmail: {}, byCode: {}, redeemedEmails: {} };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function makeCode(email) {
  // Short, human-shareable code derived from the email + a little randomness,
  // e.g. "PRIYA4F2A". Not secret — it's meant to be shared.
  const namePart = normalizeEmail(email).split("@")[0].replace(/[^a-z0-9]/gi, "").slice(0, 5).toUpperCase() || "TRIP";
  const randPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${namePart}${randPart}`;
}

function money(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN");
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

// Get (or create) the referral code + stats for a logged-in user.
// Called from the frontend with the user's own email once they open the tab.
router.post("/my-code", (req, res) => {
  const email = normalizeEmail((req.body || {}).email);
  const name = ((req.body || {}).name || "").trim();
  if (!email) return res.status(400).json({ error: "Email is required." });

  const data = loadData();
  let entry = data.byEmail[email];

  if (!entry) {
    let code = makeCode(email);
    while (data.byCode[code]) code = makeCode(email); // avoid the rare collision
    entry = { email, name, code, referredCount: 0, rewardEarned: 0, createdAt: new Date().toISOString() };
    data.byEmail[email] = entry;
    data.byCode[code] = email;
    saveData(data);
  } else if (name && entry.name !== name) {
    entry.name = name; // keep the display name fresh
    saveData(data);
  }

  res.json({
    ok: true,
    code: entry.code,
    referredCount: entry.referredCount,
    rewardEarned: entry.rewardEarned,
    referralPercent: REFERRAL_PERCENT,
  });
});

// Link a NEW visitor to whoever referred them: called once, right after
// that visitor verifies their OTP, if they arrived with a ?ref=CODE link.
// This does NOT pay out any reward yet — that only happens once their
// booking is confirmed (see creditReferralForBooking below).
router.post("/apply", applyLimiter, (req, res) => {
  const { code, refereeEmail, refereeName } = req.body || {};
  const cleanEmail = normalizeEmail(refereeEmail);
  const cleanCode = String(code || "").trim().toUpperCase();

  if (!cleanCode || !cleanEmail) {
    return res.status(400).json({ error: "Missing referral code or email." });
  }

  const data = loadData();
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

  const referrer = data.byEmail[referrerEmail];
  data.redeemedEmails[cleanEmail] = {
    code: cleanCode,
    referrerEmail,
    refereeName: (refereeName || "").trim(),
    appliedAt: new Date().toISOString(),
    rewardedBookingIds: [], // filled in once a confirmed booking actually pays the referrer
  };

  saveData(data);
  res.json({ ok: true, welcomeBonus: WELCOME_BONUS, referrerName: referrer.name || null });
});

// Admin: see all referrers, sorted by who's earned the most.
router.get("/admin/all", (req, res) => {
  const adminKey = req.query.adminKey || req.headers["x-admin-key"];
  if (ADMIN_KEY && adminKey !== ADMIN_KEY) {
    return res.status(401).json({ error: "Invalid admin key." });
  }
  const data = loadData();
  const rows = Object.values(data.byEmail).sort((a, b) => b.rewardEarned - a.rewardEarned);
  res.json({ ok: true, referrers: rows, referralPercent: REFERRAL_PERCENT });
});

/* -----------------------------------------------------------------------
   Called from bookings.js when an admin confirms a booking. Percentage-
   based reward, paid out only here — never at signup. Returns null if the
   booking's email wasn't a referred signup (nothing to credit), otherwise
   returns the referral details so bookings.js can include them in its
   own response too.
----------------------------------------------------------------------- */
async function creditReferralForBooking({ refereeEmail, bookingId, bookingItemName, bookingAmount }) {
  const cleanEmail = normalizeEmail(refereeEmail);
  const data = loadData();
  const redemption = data.redeemedEmails[cleanEmail];
  if (!redemption) return null; // this person wasn't referred by anyone

  redemption.rewardedBookingIds = redemption.rewardedBookingIds || [];
  if (redemption.rewardedBookingIds.includes(bookingId)) return null; // already rewarded for this exact booking

  const referrer = data.byEmail[redemption.referrerEmail];
  if (!referrer) return null;

  const rewardAmount = Math.round((Number(bookingAmount) || 0) * (REFERRAL_PERCENT / 100));
  referrer.referredCount += 1;
  referrer.rewardEarned += rewardAmount;
  redemption.rewardedBookingIds.push(bookingId);

  saveData(data);

  await sendReferralRewardEmail({
    referrerEmail: referrer.email,
    referrerName: referrer.name,
    bookingItemName,
    rewardAmount,
  });

  return { referrerEmail: referrer.email, referrerName: referrer.name, rewardAmount, referralPercent: REFERRAL_PERCENT };
}

module.exports = router;
module.exports.creditReferralForBooking = creditReferralForBooking;
