/**
 * AdmireDworld Travel — Bookings module
 * -------------------------------------------
 * NEW FEATURE — does not touch any existing OTP/login/blog/packages/refer/
 * wedding code.
 * Mount this router in server.js with: app.use("/api/bookings", require("./bookings"));
 *
 * What it does
 * ------------
 * - Saves every booking the customer confirms on the site (package, fixed
 *   departure, etc.) as a "pending" record, so the team has a real list to
 *   work from instead of only the on-screen toast.
 * - Lets an admin mark a booking "confirmed" (e.g. once payment actually
 *   comes in) via POST /api/bookings/admin/confirm.
 * - The moment a booking is confirmed, if the customer had originally
 *   signed up through someone's referral link, this calls
 *   refer.js's creditReferralForBooking() — which pays that referrer a
 *   PERCENTAGE of the booking amount and emails them asking for their
 *   payment scanner. Nothing is paid out before this point.
 *
 * NEW (additive, "My Bookings" upgrade — customer travel details + voucher):
 * - Every booking returned to the customer (GET /api/bookings/mine) now
 *   also includes a stable `customerId` (e.g. "AD-4F9C21") derived from
 *   their email — same value on every device/login, nothing new to store.
 * - GET /api/bookings/voucher/:id lets a logged-in customer download a
 *   PDF voucher for their OWN confirmed booking (lead pax name, customer
 *   ID, destination, travel date, status, total amount). Existing fields/
 *   routes/behaviour above are untouched.
 *
 * Env vars used: ADMIN_KEY (same one used everywhere else in this project).
 */

const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const PDFDocument = require("pdfkit");

const { creditReferralForBooking } = require("./refer");
const { reserveSeat } = require("./fixed");

const router = express.Router();

const DATA_FILE = path.join(__dirname, "bookings-data.json");
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const JWT_SECRET = process.env.JWT_SECRET; // same secret server.js uses to sign the login token

/* ---------- Stable customer ID, derived from email (no extra storage) ----------
   Same customer always gets the same ID, on any device, without needing a
   separate customers table — just a short, human-friendly hash of their
   (lowercased, trimmed) email. Purely cosmetic/reference; login/auth is
   still by email+OTP exactly as before. */
function customerIdFor(email) {
  const clean = String(email || "").trim().toLowerCase();
  const hash = crypto.createHash("sha256").update(clean).digest("hex").toUpperCase();
  return `AD-${hash.slice(0, 6)}`;
}

function money(n) {
  return "Rs. " + Number(n || 0).toLocaleString("en-IN");
}

/* ---------- Auth check for the customer-facing "my bookings" endpoint ----------
   Reuses the same JWT session token server.js already hands out on login —
   this is what makes bookings show up for the same account on ANY device:
   the data is looked up by the verified email inside the token, not by
   anything stored in that particular browser. */
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

/* ---------- Storage (simple JSON file) ---------- */
function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return { bookings: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

/* ---------- Rate limiting ---------- */
const createLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
});

/* ---------- Routes ---------- */

// Customer-facing: called right after someone confirms a booking on the site.
router.post("/", createLimiter, (req, res) => {
  const b = req.body || {};
  const user = b.user || {};
  if (!b.itemId || !b.itemName || !user.email || !user.name) {
    return res.status(400).json({ error: "Missing booking or user details." });
  }

  const data = loadData();
  const booking = {
    id: `bk-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    itemId: b.itemId,
    itemName: b.itemName,
    destination: (b.destination || "").trim(), // e.g. "Jaipur, Udaipur, Jodhpur" — optional, additive field
    isFixed: !!b.isFixed,
    travelDate: b.travelDate || null, // the exact departure date the customer picked (Fixed Departures only)
    amount: Number(b.amount) || 0,
    travellers: Number(b.travellers) || 1,
    user: { name: user.name, phone: user.phone || "", email: String(user.email).trim().toLowerCase() },
    status: "pending",
    createdAt: new Date().toISOString(),
    confirmedAt: null,
    referralReward: null, // filled in only if/when this booking earns the referrer money
  };

  data.bookings.unshift(booking);
  data.bookings = data.bookings.slice(0, 1000);
  saveData(data);

  // Fixed Departures only: knock a seat off the exact date reserved, so
  // /api/fixed's "seats left" and the "Check Availability" panel reflect
  // this booking immediately. Best-effort — never blocks the booking.
  if (booking.isFixed && booking.travelDate) {
    try {
      reserveSeat(booking.itemId, booking.travelDate);
    } catch (err) {
      console.error("bookings: seat reservation failed:", err.message);
    }
  }

  res.json({ ok: true, bookingId: booking.id });
});

// Customer-facing: view YOUR OWN bookings — works from any device, as
// long as you log in with the same account (email). Requires the login
// session token (same one used by /api/me in server.js).
router.get("/mine", requireAuth, (req, res) => {
  const email = String(req.user.email || "").trim().toLowerCase();
  const data = loadData();
  const mine = data.bookings.filter((b) => b.user.email === email);
  // customerId is the same value for every booking of this customer — attached
  // per-row (handy for the voucher/table) and once at the top level.
  const customerId = customerIdFor(email);
  res.json({ ok: true, customerId, bookings: mine.map((b) => ({ ...b, customerId })) });
});

// Customer-facing: download a PDF voucher for ONE of your own bookings.
// Only the booking's own account (verified via the login session token,
// same as /mine above) can download it — never by guessing the booking id.
router.get("/voucher/:id", requireAuth, (req, res) => {
  const email = String(req.user.email || "").trim().toLowerCase();
  const data = loadData();
  const booking = data.bookings.find((b) => b.id === req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found." });
  if (booking.user.email !== email) {
    return res.status(403).json({ error: "This voucher doesn't belong to your account." });
  }

  const customerId = customerIdFor(email);
  const fmtDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "To be confirmed";

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="AdmireDworld-Voucher-${booking.id}.pdf"`);

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  doc.pipe(res);

  // ---- Header ----
  doc.fillColor("#2B3968").fontSize(20).font("Helvetica-Bold").text("AdmireDworld Travel", { continued: false });
  doc.fillColor("#5B6472").fontSize(10).font("Helvetica").text("hello@admiredworld.travel  ·  +91-96393-43585");
  doc.moveDown(0.6);
  doc.strokeColor("#E2E5EB").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(1);

  const statusLabel = booking.status === "confirmed" ? "CONFIRMED" : "PENDING CONFIRMATION";
  const statusColor = booking.status === "confirmed" ? "#2C4680" : "#C98620";

  doc.fillColor("#1D2433").fontSize(16).font("Helvetica-Bold").text("Booking Voucher");
  doc.fillColor(statusColor).fontSize(11).font("Helvetica-Bold").text(statusLabel);
  doc.moveDown(1);

  function row(label, value) {
    doc.fillColor("#5B6472").fontSize(10).font("Helvetica").text(label, { continued: false });
    doc.fillColor("#1D2433").fontSize(13).font("Helvetica-Bold").text(value || "-");
    doc.moveDown(0.6);
  }

  row("Customer ID", customerId);
  row("Lead Pax Name", booking.user.name);
  row("Phone / Email", `${booking.user.phone || "-"}  ·  ${booking.user.email}`);
  row("Destination", booking.destination || booking.itemName);
  row("Package / Departure", booking.itemName);
  row("Travel Date", fmtDate(booking.travelDate));
  row("Travellers", String(booking.travellers));
  row("Total Amount", money(booking.amount));
  row("Booking ID", booking.id);
  row("Booked On", fmtDate(booking.createdAt));
  if (booking.confirmedAt) row("Confirmed On", fmtDate(booking.confirmedAt));

  doc.moveDown(1);
  doc.strokeColor("#E2E5EB").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.8);
  doc.fillColor("#5B6472").fontSize(9).font("Helvetica").text(
    "This voucher confirms the details of your booking with AdmireDworld Travel. Please carry a copy (digital or printed) " +
      "along with a valid photo ID during travel. For cancellation and refund terms, see our Cancellation Policy at " +
      "www.tourpackagewala.in/policies.html.",
    { width: 495 }
  );

  doc.end();
});

// Admin: view all bookings (pending + confirmed), most recent first.
router.get("/admin/all", (req, res) => {
  const adminKey = req.query.adminKey || req.headers["x-admin-key"];
  if (ADMIN_KEY && adminKey !== ADMIN_KEY) {
    return res.status(401).json({ error: "Invalid admin key." });
  }
  const data = loadData();
  res.json({ ok: true, bookings: data.bookings });
});

// Admin: mark a booking confirmed (e.g. once payment is verified).
// This is the trigger point for the referral reward + email.
router.post("/admin/confirm", async (req, res) => {
  const { adminKey, bookingId } = req.body || {};
  if (ADMIN_KEY && adminKey !== ADMIN_KEY) {
    return res.status(401).json({ error: "Invalid admin key." });
  }
  if (!bookingId) return res.status(400).json({ error: "bookingId is required." });

  const data = loadData();
  const booking = data.bookings.find((b) => b.id === bookingId);
  if (!booking) return res.status(404).json({ error: "Booking not found." });

  if (booking.status !== "confirmed") {
    booking.status = "confirmed";
    booking.confirmedAt = new Date().toISOString();
    saveData(data);
  }

  // Only try to credit + email once, even if this endpoint is called again.
  let referralResult = booking.referralReward;
  if (!referralResult) {
    try {
      referralResult = await creditReferralForBooking({
        refereeEmail: booking.user.email,
        bookingId: booking.id,
        bookingItemName: booking.itemName,
        bookingAmount: booking.amount,
      });
    } catch (err) {
      console.error("bookings: referral credit failed:", err.message);
      referralResult = null;
    }
    if (referralResult) {
      booking.referralReward = referralResult;
      saveData(data);
    }
  }

  res.json({ ok: true, booking, referralReward: referralResult });
});

module.exports = router;
