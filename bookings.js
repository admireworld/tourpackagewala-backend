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
 * NEW (additive, OFFLINE BOOKING SYNC):
 * - Every booking now carries bookingSource ("ONLINE" | "OFFLINE") +
 *   voucherGenerated (true once its PDF voucher has been generated).
 * - POST /api/bookings/admin/offline lets an admin add a booking taken
 *   outside the website (customer, package, total/paid/balance, remarks).
 *   The customer account is auto-created from the phone/email (customers
 *   store), leadType = CUSTOMER, bookingType = OFFLINE. Because it lands in
 *   the SAME bookings list, it shows up in the customer's My Bookings
 *   (GET /mine) next to their online bookings automatically.
 * - POST /api/bookings/phone-lookup: phone -> the email on file, so a
 *   customer can log in by phone number. The OTP itself is still the
 *   existing EMAIL OTP (server.js /api/send-otp + /api/verify-otp, unchanged).
 * - Payment summary (total / paid / balance / PAID-PARTIAL-PENDING) is stored
 *   on offline bookings; POST /admin/payment records later payments.
 * - The voucher route now calls renderVoucherPDF() — ONE function used for
 *   online and offline bookings (same design; offline just gets payment rows).
 *
 * NEW (additive, CUSTOM VOUCHER UPLOAD):
 * - Every booking carries voucherType ("AUTO" | "CUSTOM") + customVoucherUrl.
 *   POST /api/bookings/admin/voucher-upload/:id (multer, PDF only, max 5 MB)
 *   stores the admin's own PDF (via store.js, so it survives restarts when
 *   MongoDB is set) and flips the booking to voucherType "CUSTOM". The
 *   customer's GET /voucher/:id then returns that uploaded PDF; otherwise
 *   the auto-generated voucher (renderVoucherPDF) is returned exactly as before.
 *   DELETE on the same path goes back to AUTO.
 *
 * NEW (additive, TRIP + PAYMENT DETAILS, editable by admin):
 * - Every booking now also carries tripDuration (free text, e.g. "5D/4N") and
 *   balanceDueDate ("YYYY-MM-DD" or null). payment.advance = the advance amount
 *   paid at booking time. Together with the existing travelDate / destination /
 *   travellers (No. of Pax) / total / paid / balance these are the fields the
 *   customer sees in My Bookings.
 * - PUT /api/bookings/admin/edit/:id lets an admin edit any of those fields on
 *   any booking (online or offline). Existing routes are unchanged.
 *
 * Env vars used: ADMIN_KEY (same one used everywhere else in this project).
 *   EMAIL_SERVICE / EMAIL_USER / EMAIL_PASS + optional SITE_URL — only for the
 *   "Your Booking Confirmed" email on offline bookings (skipped if not set).
 */

const express = require("express");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const PDFDocument = require("pdfkit");
const multer = require("multer");
const nodemailer = require("nodemailer");
const store = require("./store");

const { creditReferralForBooking } = require("./refer");
const { reserveSeat } = require("./fixed");

const router = express.Router();

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

/* ---------- Storage (MongoDB if MONGODB_URI is set, else local JSON file — see store.js) ---------- */
async function loadData() {
  return store.load("bookings", { bookings: [] });
}

async function saveData(data) {
  return store.save("bookings", data);
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
router.post("/", createLimiter, async (req, res) => {
  const b = req.body || {};
  const user = b.user || {};
  if (!b.itemId || !b.itemName || !user.email || !user.name) {
    return res.status(400).json({ error: "Missing booking or user details." });
  }

  const data = await loadData();
  const booking = {
    id: `bk-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    itemId: b.itemId,
    itemName: b.itemName,
    destination: (b.destination || "").trim(), // e.g. "Jaipur, Udaipur, Jodhpur" — optional, additive field
    isFixed: !!b.isFixed,
    travelDate: b.travelDate || null, // the exact departure date the customer picked (Fixed Departures only)
    amount: Number(b.amount) || 0,
    travellers: Number(b.travellers) || 1,
    tripDuration: String(b.tripDuration || "").trim().slice(0, 60), // e.g. "5D/4N" — admin can edit later
    balanceDueDate: null, // admin sets this later
    user: { name: user.name, phone: user.phone || "", email: String(user.email).trim().toLowerCase() },
    status: "pending",
    createdAt: new Date().toISOString(),
    confirmedAt: null,
    referralReward: null, // filled in only if/when this booking earns the referrer money
    bookingSource: "ONLINE",
    bookingType: "ONLINE",
    voucherGenerated: false,
    voucherType: "AUTO",
    customVoucherUrl: "",
  };

  data.bookings.unshift(booking);
  data.bookings = data.bookings.slice(0, 1000);
  await saveData(data);

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
router.get("/mine", requireAuth, async (req, res) => {
  const email = String(req.user.email || "").trim().toLowerCase();
  const data = await loadData();
  const mine = data.bookings.filter((b) => b.user.email === email);
  // customerId is the same value for every booking of this customer — attached
  // per-row (handy for the voucher/table) and once at the top level.
  const customerId = customerIdFor(email);
  // `remarks` on offline bookings is an internal admin note — never sent to the customer.
  res.json({ ok: true, customerId, bookings: mine.map(({ remarks, ...b }) => ({ ...b, customerId })) });
});

/* ---------- Voucher PDF (ONE function, used for ONLINE and OFFLINE bookings) ---------- */
async function renderVoucherPDF(booking, res, data) {
  const customerId = customerIdFor(booking.user.email);
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
  if (booking.tripDuration) row("Trip Duration", booking.tripDuration);
  row("Total Amount", money(booking.amount));
  if (booking.payment) {
    // Offline bookings track payments — same voucher design, a few extra rows.
    if (booking.payment.advance) row("Advance Payment", money(booking.payment.advance));
    row("Paid Amount", money(booking.payment.paid));
    row("Balance Amount", money(booking.payment.balance));
    if (booking.payment.balance > 0 && booking.balanceDueDate) row("Balance Payment Deadline", fmtDate(booking.balanceDueDate));
    row("Payment Status", booking.payment.status);
  }
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

  // Mark the voucher as generated (best-effort — never blocks the download).
  if (!booking.voucherGenerated) {
    try {
      booking.voucherGenerated = true;
      await saveData(data);
    } catch (err) {
      console.error("bookings: could not flag voucherGenerated:", err.message);
    }
  }
}

// Customer-facing: download a PDF voucher for ONE of your own bookings.
// Only the booking's own account (verified via the login session token,
// same as /mine above) can download it — never by guessing the booking id.
router.get("/voucher/:id", requireAuth, async (req, res) => {
  const email = String(req.user.email || "").trim().toLowerCase();
  const data = await loadData();
  const booking = data.bookings.find((b) => b.id === req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found." });
  if (booking.user.email !== email) {
    return res.status(403).json({ error: "This voucher doesn't belong to your account." });
  }
  // Admin uploaded their own PDF for this booking -> serve that; otherwise auto voucher.
  if (booking.voucherType === "CUSTOM" && (await serveCustomVoucher(booking, res))) return;
  await renderVoucherPDF(booking, res, data);
});

// Admin: view all bookings (pending + confirmed), most recent first.
router.get("/admin/all", async (req, res) => {
  const adminKey = req.query.adminKey || req.headers["x-admin-key"];
  if (ADMIN_KEY && adminKey !== ADMIN_KEY) {
    return res.status(401).json({ error: "Invalid admin key." });
  }
  const data = await loadData();
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

  const data = await loadData();
  const booking = data.bookings.find((b) => b.id === bookingId);
  if (!booking) return res.status(404).json({ error: "Booking not found." });

  if (booking.status !== "confirmed") {
    booking.status = "confirmed";
    booking.confirmedAt = new Date().toISOString();
    await saveData(data);
  }

  // Only try to credit + email once, even if this endpoint is called again.
  let referralResult = booking.referralReward;
  if (!referralResult) {
    try {
      referralResult = await creditReferralForBooking({
        refereeEmail: booking.user.email,
        bookingId: booking.id,
        bookingItemName: booking.itemName,
        bookingDestination: booking.destination,
        bookingAmount: booking.amount,
      });
    } catch (err) {
      console.error("bookings: referral credit failed:", err.message);
      referralResult = null;
    }
    if (referralResult) {
      booking.referralReward = referralResult;
      await saveData(data);
    }
  }

  res.json({ ok: true, booking, referralReward: referralResult });
});

/* =====================================================================
   OFFLINE BOOKING SYNC + PAYMENTS + CUSTOM VOUCHER (admin side)
===================================================================== */
const isValidEmailStr = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const SITE_URL = process.env.SITE_URL || "https://www.tourpackagewala.in";

function computePayment(total, paid, history, advance) {
  total = Math.max(0, Number(total) || 0);
  paid = Math.max(0, Number(paid) || 0);
  const balance = Math.max(0, total - paid);
  const status = total > 0 && paid >= total ? "PAID" : paid > 0 ? "PARTIAL" : "PENDING";
  // advance = the advance payment taken at booking time (kept separately from
  // `paid`, which keeps growing as later instalments are recorded).
  const adv = Math.min(Math.max(0, Number(advance) || 0), paid);
  return { total, paid, balance, status, advance: adv, history: history || [] };
}

// "YYYY-MM-DD" (or any parseable date) -> "YYYY-MM-DD"; "" / invalid -> null
function cleanDateStr(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function checkAdmin(req, res) {
  const adminKey = req.query.adminKey || req.headers["x-admin-key"] || (req.body || {}).adminKey;
  if (ADMIN_KEY && adminKey !== ADMIN_KEY) {
    res.status(401).json({ error: "Invalid admin key." });
    return false;
  }
  return true;
}

// Customer account = a record keyed by the verified EMAIL (login is email OTP).
// Created on the first offline booking; later logins with that email just work.
async function ensureCustomer({ name, phone, email }) {
  const customers = await store.load("customers", { byEmail: {} });
  customers.byEmail = customers.byEmail || {};
  let created = false;
  if (!customers.byEmail[email]) {
    customers.byEmail[email] = { email, name, phone, source: "OFFLINE_BOOKING", createdAt: new Date().toISOString() };
    created = true;
  } else {
    const c = customers.byEmail[email];
    if (!c.name && name) c.name = name;
    if (!c.phone && phone) c.phone = phone;
  }
  await store.save("customers", customers);
  return { customer: customers.byEmail[email], created };
}

let mailer = null;
function getMailer() {
  if (mailer) return mailer;
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
  mailer = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
  return mailer;
}

async function sendOfflineBookingEmail(booking) {
  const t = getMailer();
  if (!t) return false; // email not configured — booking is still created
  const pay = booking.payment;
  try {
    await t.sendMail({
      from: `"AdmireDworld Travel" <${process.env.EMAIL_USER}>`,
      to: booking.user.email,
      subject: "Your Booking Confirmed - Login to download Voucher",
      text:
        `Hi ${booking.user.name},\n\nYour booking for ${booking.itemName} is confirmed.\n` +
        `Total: ${money(pay.total)} | Paid: ${money(pay.paid)} | Balance: ${money(pay.balance)} (${pay.status})\n\n` +
        `Login with this email (${booking.user.email}) at ${SITE_URL} using the OTP sent to your inbox, ` +
        `then open My Bookings to download your voucher.\n\n— Team AdmireDworld Travel`,
      html:
        `<p>Hi ${booking.user.name},</p><p>Your booking for <strong>${booking.itemName}</strong> is confirmed.</p>` +
        `<p>Total: <strong>${money(pay.total)}</strong> &middot; Paid: <strong>${money(pay.paid)}</strong> &middot; ` +
        `Balance: <strong>${money(pay.balance)}</strong> (${pay.status})</p>` +
        `<p>Login with this email (<strong>${booking.user.email}</strong>) at <a href="${SITE_URL}">${SITE_URL}</a> ` +
        `using the OTP sent to your inbox, then open <strong>My Bookings</strong> to download your voucher.</p>` +
        `<p>— Team AdmireDworld Travel</p>`,
    });
    return true;
  } catch (err) {
    console.error("bookings: offline booking email failed:", err.message);
    return false;
  }
}

// Admin: add a booking taken OFFLINE. Email is mandatory — it is the customer's
// login identity, so the booking shows up in their My Bookings after email OTP login.
router.post("/admin/offline", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  const b = req.body || {};
  const name = String(b.name || "").trim();
  const phone = String(b.phone || "").trim();
  const email = String(b.email || "").trim().toLowerCase();
  const itemName = String(b.itemName || "").trim();
  const total = Number(b.totalAmount);
  const paid = Number(b.paidAmount || 0);

  if (!name) return res.status(400).json({ error: "Customer name is required." });
  if (!isValidEmailStr(email)) return res.status(400).json({ error: "A valid customer email is required." });
  if (phone && !/^[0-9]{10}$/.test(phone)) return res.status(400).json({ error: "Phone must be 10 digits." });
  if (!itemName) return res.status(400).json({ error: "Please select a package." });
  if (!(total > 0)) return res.status(400).json({ error: "Total amount must be greater than 0." });
  if (isNaN(paid) || paid < 0) return res.status(400).json({ error: "Paid amount is invalid." });
  if (paid > total) return res.status(400).json({ error: "Paid amount cannot exceed the total amount." });

  const bookedOn = b.bookingDate && !isNaN(new Date(b.bookingDate).getTime()) ? new Date(b.bookingDate).toISOString() : new Date().toISOString();
  const travelDate = b.travelDate && !isNaN(new Date(b.travelDate).getTime()) ? b.travelDate : null;
  const balanceDueDate = cleanDateStr(b.balanceDueDate);
  const now = new Date().toISOString();

  const { created } = await ensureCustomer({ name, phone, email });

  const history = paid > 0 ? [{ amount: paid, at: bookedOn, note: "Paid at booking", mode: "OFFLINE" }] : [];
  const booking = {
    id: `bk-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    itemId: String(b.itemId || "custom"),
    itemName,
    destination: String(b.destination || "").trim(),
    isFixed: false,
    travelDate,
    amount: total,
    travellers: Math.max(1, Math.floor(Number(b.travellers)) || 1),
    tripDuration: String(b.tripDuration || "").trim().slice(0, 60),
    balanceDueDate,
    user: { name, phone, email },
    status: "confirmed", // an offline booking is already agreed + (part-)paid
    createdAt: bookedOn,
    confirmedAt: now,
    referralReward: null,
    bookingSource: "OFFLINE",
    bookingType: "OFFLINE",
    leadType: "CUSTOMER",
    voucherGenerated: false,
    voucherType: "AUTO",
    customVoucherUrl: "",
    payment: computePayment(total, paid, history, paid), // amount paid at booking = advance
    remarks: String(b.remarks || "").trim(), // internal — hidden from the customer
    recordedAt: now,
  };

  const data = await loadData();
  data.bookings.unshift(booking);
  data.bookings = data.bookings.slice(0, 1000);
  await saveData(data);

  const emailSent = await sendOfflineBookingEmail(booking);
  res.json({ ok: true, booking, accountCreated: created, emailSent });
});

// Admin: record a further payment (e.g. customer paid the balance) on any booking.
router.post("/admin/payment", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  const { bookingId, amount, note } = req.body || {};
  const amt = Number(amount);
  if (!bookingId || !(amt > 0)) return res.status(400).json({ error: "bookingId and a positive amount are required." });
  const data = await loadData();
  const booking = data.bookings.find((x) => x.id === bookingId);
  if (!booking) return res.status(404).json({ error: "Booking not found." });
  const cur = booking.payment || computePayment(booking.amount, 0, []);
  if (cur.paid + amt > cur.total) {
    return res.status(400).json({ error: `Amount exceeds the balance (${money(cur.balance)}).` });
  }
  const history = [...cur.history, { amount: amt, at: new Date().toISOString(), note: String(note || "").trim(), mode: "OFFLINE" }];
  // an online booking has no payment record yet: its first recorded payment is the advance
  const adv = cur.advance !== undefined && (cur.advance > 0 || cur.paid > 0) ? cur.advance : cur.paid + amt;
  booking.payment = computePayment(cur.total, cur.paid + amt, history, adv);
  await saveData(data);
  res.json({ ok: true, booking });
});

// Admin: EDIT the trip + payment details of any booking (online or offline).
// Send only the fields you want to change. Customer sees the update in My Bookings.
router.put("/admin/edit/:id", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  const b = req.body || {};
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  const data = await loadData();
  const booking = data.bookings.find((x) => x.id === req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found." });

  if (has("destination")) booking.destination = String(b.destination || "").trim().slice(0, 200);
  if (has("tripDuration")) booking.tripDuration = String(b.tripDuration || "").trim().slice(0, 60);
  if (has("travelDate")) {
    if (b.travelDate && isNaN(new Date(b.travelDate).getTime())) return res.status(400).json({ error: "Travel date is invalid." });
    booking.travelDate = b.travelDate ? String(b.travelDate) : null;
  }
  if (has("balanceDueDate")) {
    if (b.balanceDueDate && !cleanDateStr(b.balanceDueDate)) return res.status(400).json({ error: "Balance deadline date is invalid." });
    booking.balanceDueDate = cleanDateStr(b.balanceDueDate);
  }
  if (has("travellers")) {
    const n = Math.floor(Number(b.travellers));
    if (!(n >= 1) || n > 500) return res.status(400).json({ error: "No. of pax must be at least 1." });
    booking.travellers = n;
  }

  // Payment fields — recompute everything from total / paid / advance.
  if (has("totalAmount") || has("paidAmount") || has("advanceAmount")) {
    const cur = booking.payment || computePayment(booking.amount, 0, []);
    const total = has("totalAmount") ? Number(b.totalAmount) : cur.total;
    const paid = has("paidAmount") ? Number(b.paidAmount) : cur.paid;
    let advance = has("advanceAmount") ? Number(b.advanceAmount) : cur.advance || 0;
    if (!(total > 0)) return res.status(400).json({ error: "Total amount must be greater than 0." });
    if (isNaN(paid) || paid < 0) return res.status(400).json({ error: "Paid amount is invalid." });
    if (isNaN(advance) || advance < 0) return res.status(400).json({ error: "Advance amount is invalid." });
    if (paid > total) return res.status(400).json({ error: "Paid amount cannot exceed the total amount." });
    // Only advance was given and nothing was paid yet -> advance counts as paid.
    const paidFinal = has("advanceAmount") && !has("paidAmount") ? Math.max(paid, advance) : paid;
    if (advance > paidFinal) return res.status(400).json({ error: "Advance cannot be more than the paid amount." });
    if (paidFinal > total) return res.status(400).json({ error: "Paid amount cannot exceed the total amount." });
    const history = [...(cur.history || [])];
    if (paidFinal !== cur.paid) {
      history.push({ amount: paidFinal - cur.paid, at: new Date().toISOString(), note: "Adjusted by admin", mode: "OFFLINE" });
    }
    booking.amount = total;
    booking.payment = computePayment(total, paidFinal, history, advance);
  }

  await saveData(data);
  res.json({ ok: true, booking });
});

/* ---------- Custom voucher PDF upload (multer) ---------- */
const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const okName = /\.pdf$/i.test(file.originalname || "");
    const okType = file.mimetype === "application/pdf";
    if (okName && okType) return cb(null, true);
    cb(new Error("Only PDF files are allowed."));
  },
}).single("voucher");

const safeBookingId = (id) => /^bk-[a-z0-9]+$/i.test(String(id || ""));
const voucherStoreKey = (id) => `voucherfile-${id}`;

async function serveCustomVoucher(booking, res) {
  try {
    const rec = await store.load(voucherStoreKey(booking.id), null);
    if (!rec || !rec.data) return false;
    const buf = Buffer.from(rec.data, "base64");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="AdmireDworld-Voucher-${booking.id}.pdf"`);
    res.setHeader("Content-Length", buf.length);
    res.end(buf);
    return true;
  } catch (err) {
    console.error("bookings: could not serve custom voucher:", err.message);
    return false; // caller falls back to the auto voucher
  }
}

router.post("/admin/voucher-upload/:id", (req, res) => {
  if (!checkAdmin(req, res)) return; // header/query only — runs before multer parses the body
  uploadPdf(req, res, async (err) => {
    if (err) {
      const msg = err.code === "LIMIT_FILE_SIZE" ? "PDF is too large (max 5 MB)." : err.message || "Upload failed.";
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: "Please choose a PDF file (field name: voucher)." });
    if (!safeBookingId(req.params.id)) return res.status(400).json({ error: "Invalid booking id." });
    if (req.file.buffer.slice(0, 5).toString("latin1") !== "%PDF-") {
      return res.status(400).json({ error: "This file is not a valid PDF." });
    }
    const data = await loadData();
    const booking = data.bookings.find((x) => x.id === req.params.id);
    if (!booking) return res.status(404).json({ error: "Booking not found." });

    await store.save(voucherStoreKey(booking.id), {
      data: req.file.buffer.toString("base64"),
      filename: req.file.originalname,
      size: req.file.size,
      uploadedAt: new Date().toISOString(),
    });
    booking.voucherType = "CUSTOM";
    booking.customVoucherUrl = `/api/bookings/voucher/${booking.id}`;
    booking.voucherGenerated = true;
    await saveData(data);
    res.json({ ok: true, booking });
  });
});

// Admin: remove the uploaded PDF -> booking goes back to the auto-generated voucher.
router.delete("/admin/voucher-upload/:id", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  const data = await loadData();
  const booking = data.bookings.find((x) => x.id === req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found." });
  booking.voucherType = "AUTO";
  booking.customVoucherUrl = "";
  await saveData(data);
  res.json({ ok: true, booking });
});

// Admin: preview/download exactly what the customer will get (custom PDF or auto voucher).
router.get("/admin/voucher/:id", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  const data = await loadData();
  const booking = data.bookings.find((x) => x.id === req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found." });
  if (booking.voucherType === "CUSTOM" && (await serveCustomVoucher(booking, res))) return;
  await renderVoucherPDF(booking, res, data);
});

module.exports = router;
