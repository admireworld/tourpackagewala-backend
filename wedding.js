/**
 * AdmireDworld Travel — Destination Wedding module
 * -------------------------------------------
 * NEW FEATURE — does not touch any existing OTP/login/blog/packages/refer code.
 * Mount this router in server.js with: app.use("/api/wedding", require("./wedding"));
 *
 * What it does
 * ------------
 * - Serves a curated list of destination-wedding venues (India +
 *   international). Venues can be managed by an admin the same way
 *   packages.js manages packages (protected by the same ADMIN_KEY).
 * - Captures wedding enquiries (couple names, date, guest count, budget,
 *   preferred venue, contact info) into a local JSON file so the team
 *   has a lead list, and — if email env vars are already configured for
 *   OTP — also emails the enquiry to the business inbox. Email sending
 *   is best-effort and never blocks or fails the enquiry submission.
 *
 * NEW (additive, venue facility details + function-type enquiry):
 * - Each venue can now also carry: hotelCategory (e.g. "5-star"), rooms
 *   (no. of rooms, number), lawnArea (free text, e.g. "10,000 sq.ft."),
 *   poolAvailable (boolean). All optional — old venues without these
 *   fields are backfilled with safe defaults on load, nothing manual
 *   needed. Admin can set these from admin.html → Destination Wedding →
 *   "Add venue".
 * - Enquiries can now also include: hotelName (customer's preferred
 *   hotel/venue name, free text) and functionTypes (array — any of
 *   "Haldi", "Mehndi", "Reception", "Shaadi"). Both optional, existing
 *   fields/behaviour above are untouched.
 *
 * Env vars used (all already used elsewhere in this project, none new):
 *   ADMIN_KEY, EMAIL_SERVICE, EMAIL_USER, EMAIL_PASS
 */

const express = require("express");
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");
const store = require("./store");

const router = express.Router();

const ADMIN_KEY = process.env.ADMIN_KEY || "";

/* ---------- Default curated venues (used the first time the file doesn't exist) ---------- */
const DEFAULT_VENUES = [
  { id: "wv1", name: "Lake Palace Backdrop Wedding", destination: "Udaipur, Rajasthan", tag: "Palace & Lake", guestRange: "100–400 guests", startingPrice: 899999, desc: "Heritage havelis, lake-facing mandap setups and royal processions.", hotelCategory: "5-star heritage", rooms: 120, lawnArea: "15,000 sq.ft.", poolAvailable: true, rating: 4.9, reviewCount: 210 },
  { id: "wv2", name: "Backwater Wedding Retreat", destination: "Kumarakom, Kerala", tag: "Backwaters", guestRange: "50–200 guests", startingPrice: 549999, desc: "Houseboats, coconut-grove mandaps and intimate sunset ceremonies.", hotelCategory: "4-star", rooms: 60, lawnArea: "6,000 sq.ft.", poolAvailable: true, rating: 4.8, reviewCount: 186 },
  { id: "wv3", name: "Cliffside Bali Wedding", destination: "Uluwatu, Bali", tag: "Beach & Cliff", guestRange: "50–150 guests", startingPrice: 1299999, desc: "Ocean-facing chapels and beach-club receptions.", hotelCategory: "5-star", rooms: 80, lawnArea: "8,000 sq.ft.", poolAvailable: true, rating: 4.9, reviewCount: 164 },
  { id: "wv4", name: "Desert Dunes Wedding", destination: "Jaisalmer, Rajasthan", tag: "Desert", guestRange: "80–300 guests", startingPrice: 749999, desc: "Fort venues, camel processions and starlit dune dinners.", hotelCategory: "4-star heritage", rooms: 70, lawnArea: "20,000 sq.ft. (open desert lawn)", poolAvailable: false, rating: 4.7, reviewCount: 154 },
  { id: "wv5", name: "Vineyard Wedding", destination: "Nashik, Maharashtra", tag: "Vineyard", guestRange: "100–350 guests", startingPrice: 649999, desc: "Rolling vineyard lawns and wine-country receptions.", hotelCategory: "4-star resort", rooms: 90, lawnArea: "12,000 sq.ft.", poolAvailable: true, rating: 4.6, reviewCount: 132 },
  { id: "wv6", name: "Tuscan Villa Wedding", destination: "Tuscany, Italy", tag: "European Villa", guestRange: "40–120 guests", startingPrice: 2199999, desc: "Countryside villas, olive groves and candlelit courtyard dinners.", hotelCategory: "5-star villa", rooms: 40, lawnArea: "5,000 sq.ft.", poolAvailable: true, rating: 4.9, reviewCount: 98 },
];

/* ---------- Backfill helper (additive — keeps old saved venues working) ----------
   Any venue saved before the facility-details upgrade (or added without these
   optional fields) just gets safe defaults here, on every load. Nothing is
   overwritten if the field already exists, and the file on disk is only
   rewritten the next time something is actually saved (add/delete venue). */
function withFacilityDefaults(v) {
  return {
    ...v,
    hotelCategory: v.hotelCategory || "3-star",
    rooms: Number.isFinite(Number(v.rooms)) && v.rooms !== undefined && v.rooms !== null && v.rooms !== "" ? Number(v.rooms) : 0,
    lawnArea: v.lawnArea || "",
    poolAvailable: typeof v.poolAvailable === "boolean" ? v.poolAvailable : false,
    rating: Number.isFinite(Number(v.rating)) && v.rating ? Number(v.rating) : 4.7,
    reviewCount: Number.isFinite(Number(v.reviewCount)) && v.reviewCount ? Number(v.reviewCount) : 50,
    // Optional admin-set photo for this venue (used on the venue card AND
    // the homepage-style hero slider on the wedding tab). Old venues
    // without one just get "" here, so the frontend keeps falling back to
    // its existing auto-generated AI photo — nothing breaks.
    imageUrl: v.imageUrl || "",
  };
}

/* ---------- Storage (MongoDB if MONGODB_URI is set, else local JSON file — see store.js) ---------- */
async function loadData() {
  const parsed = await store.load("wedding", { venues: DEFAULT_VENUES, enquiries: [] });
  parsed.venues = (parsed.venues || []).map(withFacilityDefaults);
  parsed.enquiries = parsed.enquiries || [];
  return parsed;
}

async function saveData(data) {
  return store.save("wedding", data);
}

function money(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN");
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

async function notifyTeam(enquiry) {
  const t = getTransporter();
  if (!t) return; // no email configured — enquiry is still saved to disk
  try {
    await t.sendMail({
      from: `"AdmireDworld Travel" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: `New destination wedding enquiry — ${enquiry.coupleNames || "New couple"}`,
      text:
        `Couple: ${enquiry.coupleNames}\nVenue interest: ${enquiry.venueName || "Not specified"}\n` +
        `Preferred hotel: ${enquiry.hotelName || "Not specified"}\n` +
        `Function(s): ${(enquiry.functionTypes || []).join(", ") || "Not specified"}\n` +
        `Wedding month: ${enquiry.weddingMonth}\nGuests: ${enquiry.guestCount}\nBudget: ${enquiry.budget}\n` +
        `Contact: ${enquiry.name} · ${enquiry.phone} · ${enquiry.email}\nNotes: ${enquiry.notes || "-"}`,
    });
  } catch (err) {
    console.error("wedding: enquiry email failed:", err.message);
  }
}

/* ---------- Function types the customer can pick from on the enquiry form ---------- */
const VALID_FUNCTION_TYPES = new Set(["Haldi", "Mehndi", "Reception", "Shaadi"]);

/* ---------- Rate limiting for enquiry submissions ---------- */
const enquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

/* ---------- Routes ---------- */

// Public: list curated venues
router.get("/venues", async (req, res) => {
  const data = await loadData();
  res.json({ ok: true, venues: data.venues.map((v) => ({ ...v, startingPriceLabel: money(v.startingPrice) })) });
});

// Public: submit a wedding enquiry
router.post("/enquiry", enquiryLimiter, async (req, res) => {
  const b = req.body || {};
  if (!b.coupleNames || !b.name || !b.phone || !b.email) {
    return res.status(400).json({ error: "Please fill in the couple's names and your contact details." });
  }
  // functionTypes: optional array from the frontend checkboxes (Haldi/Mehndi/
  // Reception/Shaadi). Anything not in the known list is dropped rather than
  // rejecting the whole enquiry — keeps this forgiving/best-effort like the
  // rest of the form.
  const functionTypes = Array.isArray(b.functionTypes)
    ? b.functionTypes.filter((f) => VALID_FUNCTION_TYPES.has(f))
    : [];

  const data = await loadData();
  const enquiry = {
    id: `we-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    coupleNames: String(b.coupleNames).trim(),
    venueId: b.venueId || null,
    venueName: b.venueName || null,
    hotelName: (b.hotelName || "").trim(), // customer's own preferred hotel/property name, free text
    functionTypes, // e.g. ["Haldi", "Mehndi", "Reception", "Shaadi"]
    weddingMonth: b.weddingMonth || "",
    guestCount: b.guestCount || "",
    budget: b.budget || "",
    name: String(b.name).trim(),
    phone: String(b.phone).trim(),
    email: String(b.email).trim(),
    notes: (b.notes || "").trim(),
    createdAt: new Date().toISOString(),
  };
  data.enquiries.unshift(enquiry);
  data.enquiries = data.enquiries.slice(0, 500);
  await saveData(data);

  notifyTeam(enquiry); // fire-and-forget, never blocks the response

  res.json({ ok: true, message: "Enquiry received." });
});

// Admin: view all enquiries
router.get("/admin/enquiries", async (req, res) => {
  const adminKey = req.query.adminKey || req.headers["x-admin-key"];
  if (ADMIN_KEY && adminKey !== ADMIN_KEY) {
    return res.status(401).json({ error: "Invalid admin key." });
  }
  const data = await loadData();
  res.json({ ok: true, enquiries: data.enquiries });
});

// Admin: add a venue
router.post("/venues", async (req, res) => {
  const { adminKey, ...body } = req.body || {};
  if (ADMIN_KEY && adminKey !== ADMIN_KEY) {
    return res.status(401).json({ error: "Invalid admin key." });
  }
  if (!body.name || !body.destination) {
    return res.status(400).json({ error: "Name and destination are required." });
  }
  const data = await loadData();
  const venue = {
    id: `wv-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: body.name,
    destination: body.destination,
    tag: body.tag || "",
    guestRange: body.guestRange || "",
    startingPrice: Number(body.startingPrice) || 0,
    desc: body.desc || "",
    // Facility details (all optional, additive) — approx cost is the
    // existing startingPrice field above, reused rather than duplicated.
    hotelCategory: body.hotelCategory || "3-star",
    rooms: Number(body.rooms) || 0,
    lawnArea: body.lawnArea || "",
    poolAvailable: body.poolAvailable === true || body.poolAvailable === "true" || body.poolAvailable === "yes",
    rating: Number(body.rating) || 4.7,
    reviewCount: Number(body.reviewCount) || 50,
    imageUrl: (body.imageUrl || "").trim(), // optional — blank falls back to the auto-generated AI photo
  };
  data.venues.unshift(venue);
  await saveData(data);
  res.json({ ok: true, venue });
});

// Admin: update an existing venue's fields — added so the venue's photo
// (shown on its card AND the wedding-tab hero slider) can be changed
// after the fact, without deleting and re-adding the whole venue. Every
// field is optional here; only what's actually sent gets updated, so
// this doubles as a general "edit venue" endpoint without disturbing
// anything above (add/delete/list all still work exactly as before).
router.put("/venues/:id", async (req, res) => {
  const { adminKey, ...updates } = req.body || {};
  if (ADMIN_KEY && adminKey !== ADMIN_KEY) {
    return res.status(401).json({ error: "Invalid admin key." });
  }
  const data = await loadData();
  const venue = data.venues.find((v) => v.id === req.params.id);
  if (!venue) return res.status(404).json({ error: "Venue not found." });

  if (typeof updates.imageUrl === "string") venue.imageUrl = updates.imageUrl.trim();
  if (typeof updates.name === "string" && updates.name.trim()) venue.name = updates.name.trim();
  if (typeof updates.destination === "string" && updates.destination.trim()) venue.destination = updates.destination.trim();
  if (typeof updates.tag === "string") venue.tag = updates.tag.trim();
  if (typeof updates.guestRange === "string") venue.guestRange = updates.guestRange.trim();
  if (updates.startingPrice !== undefined && updates.startingPrice !== "") venue.startingPrice = Number(updates.startingPrice) || venue.startingPrice;
  if (typeof updates.desc === "string") venue.desc = updates.desc.trim();
  if (typeof updates.hotelCategory === "string" && updates.hotelCategory.trim()) venue.hotelCategory = updates.hotelCategory.trim();
  if (updates.rooms !== undefined && updates.rooms !== "") venue.rooms = Number(updates.rooms) || venue.rooms;
  if (typeof updates.lawnArea === "string") venue.lawnArea = updates.lawnArea.trim();
  if (updates.poolAvailable !== undefined) venue.poolAvailable = updates.poolAvailable === true || updates.poolAvailable === "true" || updates.poolAvailable === "yes";
  if (updates.rating !== undefined && updates.rating !== "") venue.rating = Number(updates.rating) || venue.rating;
  if (updates.reviewCount !== undefined && updates.reviewCount !== "") venue.reviewCount = Number(updates.reviewCount) || venue.reviewCount;

  await saveData(data);
  res.json({ ok: true, venue });
});

// Admin: delete a venue
router.delete("/venues/:id", async (req, res) => {
  const { adminKey } = req.body || {};
  if (ADMIN_KEY && adminKey !== ADMIN_KEY) {
    return res.status(401).json({ error: "Invalid admin key." });
  }
  const data = await loadData();
  data.venues = data.venues.filter((v) => v.id !== req.params.id);
  await saveData(data);
  res.json({ ok: true });
});

module.exports = router;
