/**
 * AdmireDworld Travel — Customize Package module
 * -------------------------------------------
 * NEW FEATURE — does not touch any existing OTP/login/blog/packages/refer/
 * bookings/wedding code.
 * Mount this router in server.js with: app.use("/api/customize", require("./customize"));
 *
 * What it does
 * ------------
 * - Admin maintains 4 catalogs on the backend, each item with its own price:
 *     1. Hotels        — grouped by category (Budget/Standard/Deluxe/Luxury), per destination
 *     2. Sightseeing    — per destination
 *     3. Pickup & Drop  — per destination
 *     4. Visa           — per country
 * - The customer, on the "Customize Package" tab, picks a destination and
 *   then selects a hotel, any sightseeing, any pickup/drop, and any visa —
 *   but NEVER sees the individual price of any single item. The frontend
 *   only ever shows ONE combined estimated total.
 * - That total is always calculated on the SERVER (never trusted from the
 *   browser): POST /api/customize/quote takes the selected item ids +
 *   traveller count and returns just { total }. GET /api/customize/options
 *   (what the customer's browser loads to build the picker) intentionally
 *   omits the "price" field for that same reason — individual prices never
 *   even reach the customer's browser.
 * - When the customer submits their final request, POST /api/customize/enquiry
 *   re-validates the selection server-side, stores the full breakdown (for
 *   the team's internal use only) + the total, and — if email env vars are
 *   already configured for OTP — emails the enquiry to the business inbox.
 * - Data is stored in a local JSON file (customize-data.json), same pattern
 *   as blog.js / packages.js / wedding.js.
 * - Taxes & fees: a single admin-configurable percentage (`settings.taxPercent`,
 *   e.g. GST) is applied on top of hotel + sightseeing + transfers + visa in
 *   computeQuote(). It is NEVER shown to the customer as a separate figure —
 *   it is baked into the one combined total, same as every other item here.
 *
 * Env vars used (all already used elsewhere in this project, none new):
 *   ADMIN_KEY, EMAIL_SERVICE, EMAIL_USER, EMAIL_PASS
 *
 * Endpoints
 * ---------
 *   GET    /api/customize/options              -> destinations + items (NO prices)
 *   POST   /api/customize/quote                 -> { total } for a given selection
 *   POST   /api/customize/enquiry                -> submit the final customize request
 *
 *   GET    /api/customize/admin/all              -> everything WITH prices + tax settings (admin only)
 *   GET    /api/customize/admin/enquiries        -> submitted requests (admin only)
 *   PUT    /api/customize/settings                -> update taxPercent (admin only)
 *
 *   POST   /api/customize/hotels                 -> add a hotel        (admin)
 *   PUT    /api/customize/hotels/:id              -> edit a hotel       (admin)
 *   DELETE /api/customize/hotels/:id              -> remove a hotel     (admin)
 *   POST   /api/customize/sightseeing             -> add sightseeing    (admin)
 *   PUT    /api/customize/sightseeing/:id          -> edit sightseeing   (admin)
 *   DELETE /api/customize/sightseeing/:id          -> remove sightseeing (admin)
 *   POST   /api/customize/transfers                -> add pickup/drop    (admin)
 *   PUT    /api/customize/transfers/:id             -> edit pickup/drop   (admin)
 *   DELETE /api/customize/transfers/:id             -> remove pickup/drop (admin)
 *   POST   /api/customize/visas                     -> add visa           (admin)
 *   PUT    /api/customize/visas/:id                  -> edit visa          (admin)
 *   DELETE /api/customize/visas/:id                  -> remove visa        (admin)
 */

const express = require("express");
const fs = require("fs");
const path = require("path");
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");

const router = express.Router();

const DATA_FILE = path.join(__dirname, "customize-data.json");
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const DEFAULT_TAX_PERCENT = 5; // GST/service tax %, admin-editable via PUT /api/customize/settings

/* ---------- Seed data (admin can add/edit/delete all of this from the backend) ---------- */
const SEED_DATA = {
  hotels: [
    { id: "ch1", destination: "Goa", category: "Budget", name: "Palm Grove Beach Stay", price: 8000, description: "Simple, clean rooms a short walk from the beach." },
    { id: "ch2", destination: "Goa", category: "Deluxe", name: "Seabreeze Beachfront Resort", price: 18000, description: "Sea-facing rooms with pool and breakfast included." },
    { id: "ch3", destination: "Kerala", category: "Budget", name: "Backwater Homestay", price: 7500, description: "Family-run homestay by the Alleppey backwaters." },
    { id: "ch4", destination: "Kerala", category: "Deluxe", name: "Lakeside Resort & Spa", price: 16000, description: "Lakeview rooms with spa access and houseboat pickup." },
    { id: "ch5", destination: "Kashmir", category: "Standard", name: "Dal View Houseboat", price: 11000, description: "Traditional houseboat stay on Dal Lake." },
    { id: "ch6", destination: "Kashmir", category: "Luxury", name: "Gulmarg Pine Resort", price: 26000, description: "Mountain-view luxury rooms near the gondola." },
    { id: "ch7", destination: "Manali", category: "Standard", name: "Riverside Pine Cottage", price: 9500, description: "Cottage rooms with mountain and river views." },
    { id: "ch8", destination: "Rajasthan", category: "Deluxe", name: "Heritage Haveli Stay", price: 17000, description: "Restored haveli rooms in the old city." },
    { id: "ch9", destination: "Bali", category: "Standard", name: "Ubud Garden Villa", price: 15000, description: "Private villa with garden pool near Ubud." },
    { id: "ch10", destination: "Bali", category: "Luxury", name: "Uluwatu Cliffside Resort", price: 42000, description: "Cliffside infinity pool suites overlooking the ocean." },
    { id: "ch11", destination: "Dubai", category: "Standard", name: "Downtown City Hotel", price: 20000, description: "Central hotel close to Downtown Dubai." },
    { id: "ch12", destination: "Dubai", category: "Luxury", name: "Palm Jumeirah Suites", price: 55000, description: "Beachfront suites on Palm Jumeirah." },
    { id: "ch13", destination: "Thailand", category: "Budget", name: "Phuket Old Town Inn", price: 9000, description: "Cosy rooms in Phuket's old town." },
    { id: "ch14", destination: "Thailand", category: "Deluxe", name: "Krabi Beach Resort", price: 24000, description: "Beachfront resort with pool near Ao Nang." },
  ],
  sightseeing: [
    { id: "cs1", destination: "Goa", name: "Dudhsagar Falls Day Trip", description: "Jeep safari to the falls with a local guide." },
    { id: "cs2", destination: "Goa", name: "Water Sports Combo", description: "Parasailing, jet-ski and banana boat ride." },
    { id: "cs3", destination: "Kerala", name: "Full-Day Houseboat Cruise", description: "Backwater cruise with an onboard lunch." },
    { id: "cs4", destination: "Kerala", name: "Munnar Tea Garden Tour", description: "Guided walk through the tea estates and museum." },
    { id: "cs5", destination: "Kashmir", name: "Gulmarg Gondola Ride", description: "Two-stage cable car with meadow and glacier views." },
    { id: "cs6", destination: "Kashmir", name: "Mughal Gardens Tour", description: "Nishat, Shalimar and Chashme Shahi in one day." },
    { id: "cs7", destination: "Manali", name: "Solang Valley Adventure", description: "Optional zorbing, paragliding and cable car." },
    { id: "cs8", destination: "Rajasthan", name: "Amber Fort & City Palace Tour", description: "Guided heritage walk with an elephant/jeep ride option." },
    { id: "cs9", destination: "Bali", name: "Ubud Rice Terrace & Temple Tour", description: "Tegalalang rice terraces and Tirta Empul temple." },
    { id: "cs10", destination: "Dubai", name: "Desert Safari with BBQ Dinner", description: "Dune bashing, camel ride, live shows and dinner." },
    { id: "cs11", destination: "Thailand", name: "Phi Phi Island Speedboat Tour", description: "Full-day island hopping with snorkeling stops." },
  ],
  transfers: [
    { id: "ct1", destination: "Goa", name: "Airport Pickup & Drop", description: "Private cab, both ways." },
    { id: "ct2", destination: "Kerala", name: "Airport/Station Pickup & Drop", description: "Private cab, both ways." },
    { id: "ct3", destination: "Kashmir", name: "Airport Pickup & Drop", description: "Private cab, both ways." },
    { id: "ct4", destination: "Manali", name: "Airport/Bus Stand Pickup & Drop", description: "Private cab, both ways." },
    { id: "ct5", destination: "Rajasthan", name: "Airport Pickup & Drop", description: "Private cab, both ways." },
    { id: "ct6", destination: "Bali", name: "Airport Pickup & Drop", description: "Private car, both ways." },
    { id: "ct7", destination: "Dubai", name: "Airport Pickup & Drop", description: "Private car, both ways." },
    { id: "ct8", destination: "Thailand", name: "Airport Pickup & Drop", description: "Private car, both ways." },
  ],
  visas: [
    { id: "cv1", country: "UAE", name: "UAE Tourist Visa", description: "Standard tourist visa processing for Indian passport holders." },
    { id: "cv2", country: "Thailand", name: "Thailand e-Visa", description: "e-Visa processing for Indian passport holders." },
    { id: "cv3", country: "Indonesia", name: "Indonesia Visa on Arrival Assistance", description: "Assistance with visa-on-arrival at Bali airport." },
  ],
};

// Prices kept separate from the objects above only for readability here;
// merged into the seed items below so each item has its own price on disk.
const SEED_PRICES = {
  cs1: 1800, cs2: 2200, cs3: 2500, cs4: 1200, cs5: 2600, cs6: 1000,
  cs7: 2000, cs8: 1500, cs9: 1400, cs10: 3200, cs11: 2800,
  ct1: 1500, ct2: 1800, ct3: 2200, ct4: 1600, ct5: 1700, ct6: 2000, ct7: 2500, ct8: 2200,
  cv1: 6500, cv2: 3500, cv3: 2500,
};
SEED_DATA.sightseeing.forEach((i) => { i.price = SEED_PRICES[i.id]; });
SEED_DATA.transfers.forEach((i) => { i.price = SEED_PRICES[i.id]; });
SEED_DATA.visas.forEach((i) => { i.price = SEED_PRICES[i.id]; });

/* ---------- Storage (simple JSON file) ---------- */
function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    // Backfill settings for data files saved before taxPercent existed.
    if (!parsed.settings) parsed.settings = { taxPercent: DEFAULT_TAX_PERCENT };
    return parsed;
  } catch {
    return {
      hotels: SEED_DATA.hotels.map((i) => ({ ...i })),
      sightseeing: SEED_DATA.sightseeing.map((i) => ({ ...i })),
      transfers: SEED_DATA.transfers.map((i) => ({ ...i })),
      visas: SEED_DATA.visas.map((i) => ({ ...i })),
      enquiries: [],
      settings: { taxPercent: DEFAULT_TAX_PERCENT },
    };
  }
}

function saveData(data) {
  // Backfill settings for data files saved before taxPercent existed.
  if (!data.settings) data.settings = { taxPercent: DEFAULT_TAX_PERCENT };
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function money(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN");
}

/* ---------- Strip prices before sending a catalog to the customer's browser ---------- */
function publicItem({ price, ...rest }) {
  return rest; // everything except "price"
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
      subject: `New customize package request — ${enquiry.destination || "Trip"}`,
      text:
        `Destination: ${enquiry.destination}\nDuration: ${enquiry.duration}\nTravellers: ${enquiry.travellers}\n` +
        `Hotel: ${enquiry.breakdown.hotel ? enquiry.breakdown.hotel.name + " (" + money(enquiry.breakdown.hotel.price) + ")" : "-"}\n` +
        `Sightseeing: ${enquiry.breakdown.sightseeing.map((s) => `${s.name} (${money(s.price)})`).join(", ") || "-"}\n` +
        `Pickup/Drop: ${enquiry.breakdown.transfers.map((s) => `${s.name} (${money(s.price)})`).join(", ") || "-"}\n` +
        `Visa: ${enquiry.breakdown.visas.map((s) => `${s.name} (${money(s.price)})`).join(", ") || "-"}\n` +
        `Taxes & fees (${enquiry.breakdown.tax.percent}%): ${money(enquiry.breakdown.tax.amount)}\n` +
        `Estimated total: ${money(enquiry.total)}\n\n` +
        `Contact: ${enquiry.name} · ${enquiry.phone} · ${enquiry.email}\nNotes: ${enquiry.notes || "-"}`,
    });
  } catch (err) {
    console.error("customize: enquiry email failed:", err.message);
  }
}

/* ---------- Admin auth + rate limit (same pattern as packages.js) ---------- */
function checkAdmin(req, res) {
  const key = req.body?.adminKey || req.query?.adminKey || req.headers["x-admin-key"];
  if (ADMIN_KEY && key !== ADMIN_KEY) {
    res.status(401).json({ error: "Invalid admin key." });
    return false;
  }
  return true;
}
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });
const quoteLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });
const enquiryLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

/* ---------- Shared: compute a total (and the itemized breakdown, kept server-side only) ---------- */
function computeQuote(data, { hotelId, sightseeingIds, transferIds, visaIds, travellers }) {
  const travellerCount = Math.max(1, Number(travellers) || 1);
  const sightseeingIdSet = new Set(Array.isArray(sightseeingIds) ? sightseeingIds : []);
  const transferIdSet = new Set(Array.isArray(transferIds) ? transferIds : []);
  const visaIdSet = new Set(Array.isArray(visaIds) ? visaIds : []);

  const hotel = hotelId ? data.hotels.find((h) => h.id === hotelId) || null : null;
  const sightseeing = data.sightseeing.filter((s) => sightseeingIdSet.has(s.id));
  const transfers = data.transfers.filter((t) => transferIdSet.has(t.id));
  const visas = data.visas.filter((v) => visaIdSet.has(v.id));

  // Hotel is priced per room/stay (not multiplied by travellers).
  // Sightseeing / transfers / visas are priced per traveller.
  let subtotal = hotel ? hotel.price : 0;
  sightseeing.forEach((s) => { subtotal += s.price * travellerCount; });
  transfers.forEach((t) => { subtotal += t.price * travellerCount; });
  visas.forEach((v) => { subtotal += v.price * travellerCount; });

  // Taxes & fees (e.g. GST) — a single admin-set percentage applied on top
  // of everything above. Kept out of the customer-facing breakdown; only
  // ever reflected inside the one combined total.
  const taxPercent = Number(data.settings?.taxPercent) || 0;
  const taxAmount = Math.round(subtotal * (taxPercent / 100));
  const total = subtotal + taxAmount;

  return {
    total,
    travellers: travellerCount,
    breakdown: { hotel, sightseeing, transfers, visas, tax: { percent: taxPercent, amount: taxAmount } },
  };
}

/* ================================================================
   PUBLIC ROUTES
================================================================ */

// Public: everything the customer's browser needs to build the picker —
// destinations + item names/descriptions, but NEVER individual prices.
router.get("/options", (req, res) => {
  const data = loadData();
  const destinations = Array.from(
    new Set([
      ...data.hotels.map((h) => h.destination),
      ...data.sightseeing.map((s) => s.destination),
      ...data.transfers.map((t) => t.destination),
    ])
  ).sort();

  res.json({
    ok: true,
    destinations,
    hotels: data.hotels.map(publicItem),
    sightseeing: data.sightseeing.map(publicItem),
    transfers: data.transfers.map(publicItem),
    visas: data.visas.map(publicItem),
  });
});

// Public: calculate ONE combined total for a given selection.
// This is the only place a price number is ever sent to the browser.
router.post("/quote", quoteLimiter, (req, res) => {
  const data = loadData();
  const { hotelId, sightseeingIds, transferIds, visaIds, travellers } = req.body || {};
  const { total, travellers: travellerCount } = computeQuote(data, {
    hotelId, sightseeingIds, transferIds, visaIds, travellers,
  });
  res.json({ ok: true, total, travellers: travellerCount });
});

// Public: submit the final customize request. Total is re-calculated here
// from the selection (never trusted from the browser) before saving/emailing.
router.post("/enquiry", enquiryLimiter, async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.phone || !b.email || !b.destination) {
    return res.status(400).json({ error: "Please fill in the destination and your contact details." });
  }

  const data = loadData();
  const { total, travellers, breakdown } = computeQuote(data, {
    hotelId: b.hotelId,
    sightseeingIds: b.sightseeingIds,
    transferIds: b.transferIds,
    visaIds: b.visaIds,
    travellers: b.travellers,
  });

  const enquiry = {
    id: `cz-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    destination: String(b.destination).trim(),
    duration: b.duration || "",
    month: b.month || "",
    style: b.style || "",
    travellers,
    name: String(b.name).trim(),
    phone: String(b.phone).trim(),
    email: String(b.email).trim(),
    notes: (b.notes || "").trim(),
    breakdown, // full itemized detail — for the team's internal use only, never shown back to the customer
    total,
    createdAt: new Date().toISOString(),
  };

  data.enquiries.unshift(enquiry);
  data.enquiries = data.enquiries.slice(0, 500);
  saveData(data);

  notifyTeam(enquiry); // fire-and-forget, never blocks the response

  // Customer only ever gets the one combined total back — no breakdown.
  res.json({ ok: true, message: "Request received.", total });
});

/* ================================================================
   ADMIN ROUTES
================================================================ */

// Admin: everything, WITH prices, for the management screen.
router.get("/admin/all", (req, res) => {
  if (!checkAdmin(req, res)) return;
  const data = loadData();
  res.json({
    ok: true,
    hotels: data.hotels,
    sightseeing: data.sightseeing,
    transfers: data.transfers,
    visas: data.visas,
    settings: data.settings,
  });
});

// Admin: update the tax/fees percentage applied to every quote's total.
router.put("/settings", adminLimiter, (req, res) => {
  if (!checkAdmin(req, res)) return;
  const taxPercent = Number(req.body?.taxPercent);
  if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 100) {
    return res.status(400).json({ error: "taxPercent must be a number between 0 and 100." });
  }
  const data = loadData();
  data.settings = { ...data.settings, taxPercent };
  saveData(data);
  res.json({ ok: true, settings: data.settings });
});

// Admin: view submitted customize requests (with full breakdown + total).
router.get("/admin/enquiries", (req, res) => {
  if (!checkAdmin(req, res)) return;
  const data = loadData();
  res.json({ ok: true, enquiries: data.enquiries });
});

/* ---------- Generic admin CRUD for the 4 catalogs ---------- */
function registerCrud({ urlPath, dataKey, requiredFields, buildItem, idPrefix }) {
  router.post(`/${urlPath}`, adminLimiter, (req, res) => {
    if (!checkAdmin(req, res)) return;
    const body = req.body || {};
    for (const field of requiredFields) {
      if (!body[field] && body[field] !== 0) {
        return res.status(400).json({ error: `${field} is required.` });
      }
    }
    const data = loadData();
    const item = buildItem(body, `${idPrefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`);
    data[dataKey].unshift(item);
    saveData(data);
    res.json({ ok: true, item });
  });

  router.put(`/${urlPath}/:id`, adminLimiter, (req, res) => {
    if (!checkAdmin(req, res)) return;
    const data = loadData();
    const idx = data[dataKey].findIndex((i) => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Item not found." });
    const body = req.body || {};
    const allowed = ["destination", "country", "category", "name", "price", "description"];
    allowed.forEach((field) => {
      if (body[field] !== undefined) {
        data[dataKey][idx][field] = field === "price" ? Number(body[field]) || 0 : body[field];
      }
    });
    saveData(data);
    res.json({ ok: true, item: data[dataKey][idx] });
  });

  router.delete(`/${urlPath}/:id`, adminLimiter, (req, res) => {
    if (!checkAdmin(req, res)) return;
    const data = loadData();
    const before = data[dataKey].length;
    data[dataKey] = data[dataKey].filter((i) => i.id !== req.params.id);
    if (data[dataKey].length === before) return res.status(404).json({ error: "Item not found." });
    saveData(data);
    res.json({ ok: true });
  });
}

registerCrud({
  urlPath: "hotels",
  dataKey: "hotels",
  requiredFields: ["destination", "category", "name", "price"],
  idPrefix: "ch",
  buildItem: (b, id) => ({
    id, destination: b.destination, category: b.category, name: b.name,
    price: Number(b.price) || 0, description: b.description || "",
  }),
});

registerCrud({
  urlPath: "sightseeing",
  dataKey: "sightseeing",
  requiredFields: ["destination", "name", "price"],
  idPrefix: "cs",
  buildItem: (b, id) => ({
    id, destination: b.destination, name: b.name,
    price: Number(b.price) || 0, description: b.description || "",
  }),
});

registerCrud({
  urlPath: "transfers",
  dataKey: "transfers",
  requiredFields: ["destination", "name", "price"],
  idPrefix: "ct",
  buildItem: (b, id) => ({
    id, destination: b.destination, name: b.name,
    price: Number(b.price) || 0, description: b.description || "",
  }),
});

registerCrud({
  urlPath: "visas",
  dataKey: "visas",
  requiredFields: ["country", "name", "price"],
  idPrefix: "cv",
  buildItem: (b, id) => ({
    id, country: b.country, name: b.name,
    price: Number(b.price) || 0, description: b.description || "",
  }),
});

module.exports = router;
