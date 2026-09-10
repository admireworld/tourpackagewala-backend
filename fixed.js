/**
 * AdmireDworld Travel — Fixed Departures module
 * -------------------------------------------
 * NEW FEATURE — does not touch any existing OTP/login/blog/packages/refer/
 * bookings/wedding/customize/leads code.
 * Mount this router in server.js with: app.use("/api/fixed", require("./fixed"));
 *
 * What it does
 * ------------
 * Fixed Departures (the group tours with a fixed date) used to be 100%
 * hardcoded on the frontend — including the "seats left" numbers, which
 * never actually changed no matter how many people booked. This module
 * moves them to the backend, same pattern as packages.js:
 *
 * - Each departure has one or more date options (`dateOptions`), each
 *   with its own seat count — so "12 May" and "26 May" of the same tour
 *   can have different availability.
 * - GET /api/fixed and GET /api/fixed/:id always return the CURRENT
 *   seat counts from disk, so the "View Details" page always shows
 *   live numbers.
 * - GET /api/fixed/:id/availability returns just that departure's date
 *   options, grouped month-wise — this is what the "Check Availability"
 *   button on the detail page calls, so it always shows the freshest
 *   numbers even if the page has been open a while.
 * - Every time a customer's booking for a fixed departure is saved
 *   (see bookings.js -> POST /api/bookings), this module's
 *   reserveSeat() is called to knock one seat off the exact date they
 *   picked. This is how "kitni seat available hai" actually goes down
 *   as real bookings come in, instead of being a static number.
 * - Admin can add/edit/delete departures, and — this is the main ask —
 *   directly set or add seat counts per date via
 *   PUT /api/fixed/:id/dates (protected by the same ADMIN_KEY used
 *   everywhere else in this project).
 *
 * Env vars used: ADMIN_KEY (same one already used by blog/packages/etc).
 *
 * Endpoints
 * ---------
 *   GET    /api/fixed                    -> list all departures (live seats)
 *   GET    /api/fixed/:id                -> single departure, full detail
 *   GET    /api/fixed/:id/availability   -> date options grouped by month
 *   POST   /api/fixed                    -> add a departure (admin)
 *   PUT    /api/fixed/:id                -> edit a departure's fields (admin)
 *   DELETE /api/fixed/:id                -> remove a departure (admin)
 *   PUT    /api/fixed/:id/dates          -> set/add a date option's seats (admin)
 *                                            body: { adminKey, date, d, m, seats }
 *   DELETE /api/fixed/:id/dates/:date    -> remove one date option (admin)
 */

const express = require("express");
const fs = require("fs");
const path = require("path");
const rateLimit = require("express-rate-limit");

const router = express.Router();

const DATA_FILE = path.join(__dirname, "fixed-data.json");
const ADMIN_KEY = process.env.ADMIN_KEY || "";

/* ---------- Seed data (same 5 fixed departures the frontend already had) ---------- */
const SEED_FIXED = [
  { id: "fd1", name: "Char Dham Yatra", loc: "Yamunotri · Gangotri · Kedarnath · Badrinath",
    days: "11D/10N", price: 32999, fromCity: "Haridwar", badge: "Guaranteed Departure",
    shortDesc: "An 11-day pilgrimage circuit covering all four sacred Himalayan shrines — Yamunotri, Gangotri, Kedarnath and Badrinath — with comfortable stays and a dedicated tour manager throughout.",
    dateOptions: [
      { d: "12", m: "May", date: "12 May 2027", seats: 8 },
      { d: "26", m: "May", date: "26 May 2027", seats: 14 },
      { d: "09", m: "Jun", date: "09 Jun 2027", seats: 6 },
    ],
    highlights: [
      "10 nights' accommodation on double-sharing basis",
      "Daily breakfast and dinner included",
      "Private vehicle for the entire circuit with an experienced driver",
      "Darshan assistance at all four Dhams",
      "Service of an experienced tour manager throughout the yatra",
    ],
    dayWise: [
      { day: 1, title: "Arrival in Haridwar — Welcome to the Yatra", desc: "Pick-up on arrival and transfer to the hotel. Evening at leisure to attend the Ganga Aarti at Har Ki Pauri." },
      { day: 2, title: "Haridwar to Barkot", desc: "Drive to Barkot via Mussoorie. Check-in and overnight stay." },
      { day: 3, title: "Barkot – Yamunotri – Barkot", desc: "Early drive to Janki Chatti, trek/pony to Yamunotri for darshan, return to Barkot by evening." },
      { day: 4, title: "Barkot to Uttarkashi", desc: "Drive to Uttarkashi, visit Vishwanath Temple, overnight stay." },
      { day: 5, title: "Uttarkashi – Gangotri – Uttarkashi", desc: "Drive to Gangotri for darshan at the source of the Ganga, return to Uttarkashi." },
      { day: 6, title: "Uttarkashi to Guptkashi", desc: "Long scenic drive to Guptkashi, overnight stay." },
      { day: 7, title: "Guptkashi – Kedarnath", desc: "Drive to Gaurikund, trek/pony/heli to Kedarnath, evening darshan, overnight at Kedarnath." },
      { day: 8, title: "Kedarnath to Guptkashi", desc: "Early morning darshan, descend to Gaurikund and drive back to Guptkashi." },
      { day: 9, title: "Guptkashi to Badrinath", desc: "Drive to Badrinath via Joshimath, evening darshan at the shrine." },
      { day: 10, title: "Badrinath to Rudraprayag", desc: "Morning darshan, drive to Rudraprayag, overnight stay." },
      { day: 11, title: "Rudraprayag to Haridwar — Departure", desc: "Drive back to Haridwar and onward departure. Tour ends with wonderful memories." },
    ],
    hotel: { name: "Hotel Ganga Kinare or similar", stars: 3, address: "Near Har Ki Pauri, Haridwar", room: "Standard Room", meals: "Breakfast & Dinner" },
    included: [
      "10 nights' accommodation (3-star properties or similar)",
      "Daily breakfast and dinner as per itinerary",
      "Private AC vehicle for the entire circuit",
      "Toll, parking and driver allowance included",
      "Service of an experienced tour manager",
      "All applicable taxes",
    ],
    exclusions: [
      "Airfare / train fare to and from Haridwar",
      "Personal expenses such as tips, laundry and phone calls",
      "Pony, palki or helicopter charges at Kedarnath/Yamunotri",
      "Any meals not mentioned in the itinerary",
      "Travel insurance",
    ] },
  { id: "fd2", name: "Ladakh Bike Expedition", loc: "Leh · Nubra Valley · Pangong Tso",
    days: "9D/8N", price: 38999, fromCity: "Delhi", badge: "Small Group",
    shortDesc: "A 9-day self-ride motorcycle expedition through Leh, Nubra Valley and Pangong Tso, with acclimatization built in and full mechanical support on the road.",
    dateOptions: [
      { d: "03", m: "Jun", date: "03 Jun 2027", seats: 5 },
      { d: "17", m: "Jun", date: "17 Jun 2027", seats: 9 },
      { d: "01", m: "Jul", date: "01 Jul 2027", seats: 7 },
    ],
    highlights: [
      "Royal Enfield (or similar) bike with fuel and rider insurance",
      "Backup vehicle for luggage and mechanical support",
      "8 nights' accommodation on double-sharing basis",
      "Daily breakfast and dinner included",
      "Experienced ride captain and support crew",
    ],
    dayWise: [
      { day: 1, title: "Arrival in Leh", desc: "Fly into Leh, transfer to hotel, complete acclimatization rest day." },
      { day: 2, title: "Leh Local Sightseeing", desc: "Visit Shanti Stupa, Leh Palace and the Hall of Fame museum. Evening bike briefing." },
      { day: 3, title: "Leh to Nubra Valley via Khardung La", desc: "Ride over Khardung La, one of the world's highest motorable passes, into Nubra Valley." },
      { day: 4, title: "Nubra Valley Sightseeing", desc: "Visit Diskit Monastery, the sand dunes and enjoy a camel safari at Hunder." },
      { day: 5, title: "Nubra Valley to Pangong Tso", desc: "Ride via the Shyok river route to the shores of Pangong Tso, overnight camping." },
      { day: 6, title: "Pangong Tso to Leh via Chang La", desc: "Sunrise at the lake, ride back to Leh over Chang La pass." },
      { day: 7, title: "Leh – Tso Moriri / Buffer Day", desc: "Optional ride to Tso Moriri, or a buffer day for weather/altitude rest." },
      { day: 8, title: "Free Day in Leh", desc: "Bikes handed back, free time for shopping and exploring local markets." },
      { day: 9, title: "Departure from Leh", desc: "Transfer to Leh airport for onward departure." },
    ],
    hotel: { name: "Hotel Ladakh Greens or similar", stars: 3, address: "Leh Market Road, Leh", room: "Deluxe Room", meals: "Breakfast & Dinner" },
    included: [
      "8 nights' accommodation (hotel + camp stays)",
      "Motorcycle rental with fuel and rider insurance",
      "Backup support vehicle and mechanic",
      "Daily breakfast and dinner",
      "Inner Line Permits for restricted areas",
      "Experienced ride captain",
    ],
    exclusions: [
      "Airfare to and from Leh",
      "Personal riding gear (helmet included, jacket/boots extra)",
      "Any damage to the motorcycle beyond normal wear",
      "Personal expenses and tips",
      "Travel/medical insurance for high-altitude travel",
    ] },
  { id: "fd3", name: "Kedarnath Yatra", loc: "Gaurikund · Kedarnath",
    days: "5D/4N", price: 16999, fromCity: "Haridwar", badge: "Guaranteed Departure",
    shortDesc: "A focused 5-day Kedarnath darshan yatra with comfortable base-camp stays, pony/palki assistance and a smooth Haridwar-to-Haridwar circuit.",
    dateOptions: [
      { d: "20", m: "May", date: "20 May 2027", seats: 12 },
      { d: "03", m: "Jun", date: "03 Jun 2027", seats: 18 },
      { d: "17", m: "Jun", date: "17 Jun 2027", seats: 9 },
    ],
    highlights: [
      "4 nights' accommodation on double-sharing basis",
      "Daily breakfast and dinner included",
      "Private vehicle from Haridwar to Guptkashi and back",
      "Pony/palki booking assistance at Gaurikund",
      "Service of an experienced tour manager",
    ],
    dayWise: [
      { day: 1, title: "Arrival in Haridwar", desc: "Pick-up on arrival and transfer to the hotel. Evening Ganga Aarti at Har Ki Pauri." },
      { day: 2, title: "Haridwar to Guptkashi", desc: "Scenic drive to Guptkashi via Rudraprayag, overnight stay." },
      { day: 3, title: "Guptkashi – Gaurikund – Kedarnath", desc: "Drive to Gaurikund, trek/pony/heli to Kedarnath, evening darshan, overnight at Kedarnath." },
      { day: 4, title: "Kedarnath to Guptkashi", desc: "Early morning darshan, descend to Gaurikund and drive back to Guptkashi." },
      { day: 5, title: "Guptkashi to Haridwar — Departure", desc: "Drive back to Haridwar for onward departure." },
    ],
    hotel: { name: "GMVN Tourist Rest House or similar", stars: 2, address: "Guptkashi, near Kedarnath base route", room: "Standard Room", meals: "Breakfast & Dinner" },
    included: [
      "4 nights' accommodation (2/3-star properties or similar)",
      "Daily breakfast and dinner as per itinerary",
      "Private vehicle from Haridwar to Guptkashi and back",
      "Toll, parking and driver allowance included",
      "Service of an experienced tour manager",
    ],
    exclusions: [
      "Airfare / train fare to and from Haridwar",
      "Pony, palki or helicopter charges at Kedarnath",
      "Personal expenses such as tips and laundry",
      "Any meals not mentioned in the itinerary",
      "Travel insurance",
    ] },
  { id: "fd4", name: "Europe Grand Tour", loc: "Paris · Amsterdam · Rome · Venice",
    days: "12D/11N", price: 159999, fromCity: "Delhi", badge: "Flexi Holiday",
    shortDesc: "A 12-day grand circuit through Paris, Amsterdam, Lucerne, Venice and Rome — Europe's most iconic cities, hotels and photo stops, all in one seamless group tour.",
    dateOptions: [
      { d: "14", m: "Sep", date: "14 Sep 2027", seats: 6 },
      { d: "05", m: "Oct", date: "05 Oct 2027", seats: 10 },
      { d: "19", m: "Oct", date: "19 Oct 2027", seats: 4 },
    ],
    highlights: [
      "11 nights' accommodation in centrally located 3-star hotels",
      "Daily breakfast included",
      "Inter-city travel by train/coach across 5 cities",
      "Seine river cruise and gondola ride in Venice",
      "Service of English-speaking local tour guides",
    ],
    dayWise: [
      { day: 1, title: "Arrival in Paris — Welcome to Europe", desc: "Transfer to hotel. Evening Seine river cruise to see Paris lit up at night." },
      { day: 2, title: "Paris Sightseeing", desc: "Admire the Eiffel Tower and Louvre Museum (photo stop), stroll down the Champs-Élysées." },
      { day: 3, title: "Paris to Amsterdam", desc: "Travel by high-speed train to Amsterdam, check-in and evening at leisure." },
      { day: 4, title: "Amsterdam Sightseeing", desc: "Canal cruise through the city and a visit to Dam Square." },
      { day: 5, title: "Amsterdam to Cologne", desc: "Drive along the Rhine Valley to Cologne, visit the famous Cologne Cathedral." },
      { day: 6, title: "Cologne to Lucerne", desc: "Scenic drive into Switzerland, check-in at Lucerne." },
      { day: 7, title: "Lucerne — Mount Titlis Excursion", desc: "Cable car excursion to Mount Titlis for snow-capped alpine views." },
      { day: 8, title: "Lucerne to Venice via Milan", desc: "Drive through Milan (photo stop) to Venice." },
      { day: 9, title: "Venice Sightseeing", desc: "Gondola ride through the canals and a visit to St. Mark's Square." },
      { day: 10, title: "Venice to Rome", desc: "Travel to Rome, check-in and evening at leisure." },
      { day: 11, title: "Rome Sightseeing", desc: "Visit the Colosseum and Vatican Museums (photo stop)." },
      { day: 12, title: "Departure from Rome — Until We Meet Again", desc: "Transfer to Rome airport for onward departure." },
    ],
    hotel: { name: "Ibis Styles or similar", stars: 3, address: "City-centre hotels across the route", room: "Standard Room", meals: "Breakfast only" },
    included: [
      "11 nights' accommodation (3-star properties or similar)",
      "Daily breakfast",
      "Inter-city travel by train/coach",
      "Seine river cruise and Venice gondola ride",
      "Service of English-speaking local tour guides",
      "All parking fees and highway tolls",
    ],
    exclusions: [
      "International airfare to and from Europe",
      "Schengen visa fees",
      "Lunch and dinner (except where mentioned)",
      "Entry tickets to monuments not listed as included",
      "Travel insurance and personal expenses",
    ] },
  { id: "fd5", name: "Northeast India Circuit", loc: "Shillong · Kaziranga · Tawang",
    days: "8D/7N", price: 27999, fromCity: "Guwahati", badge: "Guaranteed Departure",
    shortDesc: "An 8-day offbeat circuit across Meghalaya, Assam and Arunachal Pradesh — living root bridges, wildlife safaris and high-altitude monasteries.",
    dateOptions: [
      { d: "08", m: "Oct", date: "08 Oct 2027", seats: 10 },
      { d: "22", m: "Oct", date: "22 Oct 2027", seats: 14 },
      { d: "05", m: "Nov", date: "05 Nov 2027", seats: 7 },
    ],
    highlights: [
      "7 nights' accommodation on double-sharing basis",
      "Daily breakfast and dinner included",
      "Jeep and elephant safari inside Kaziranga National Park",
      "Living root bridge trek at Cherrapunji",
      "Private vehicle for the entire circuit",
    ],
    dayWise: [
      { day: 1, title: "Arrival in Guwahati — Transfer to Shillong", desc: "Pick-up from Guwahati airport, scenic drive to Shillong, overnight stay." },
      { day: 2, title: "Shillong Sightseeing", desc: "Visit Umiam Lake and Shillong Peak for panoramic valley views." },
      { day: 3, title: "Shillong to Cherrapunji", desc: "Trek to the living root bridges and visit the Nohkalikai waterfalls." },
      { day: 4, title: "Cherrapunji to Kaziranga", desc: "Drive to Kaziranga, evening at leisure near the national park." },
      { day: 5, title: "Kaziranga National Park Safari", desc: "Jeep and elephant safari to spot the one-horned rhinoceros and other wildlife." },
      { day: 6, title: "Kaziranga to Bomdila", desc: "Long scenic drive into Arunachal Pradesh, overnight stay at Bomdila." },
      { day: 7, title: "Bomdila to Tawang", desc: "Drive to Tawang, visit the historic Tawang Monastery." },
      { day: 8, title: "Tawang to Guwahati — Departure", desc: "Return drive to Guwahati for onward departure." },
    ],
    hotel: { name: "Hotel Polo Towers or similar", stars: 3, address: "Police Bazar, Shillong", room: "Standard Room", meals: "Breakfast & Dinner" },
    included: [
      "7 nights' accommodation (3-star properties or similar)",
      "Daily breakfast and dinner as per itinerary",
      "Private vehicle for the entire circuit",
      "Jeep and elephant safari charges at Kaziranga",
      "Inner Line Permit assistance for Arunachal Pradesh",
      "Toll, parking and driver allowance included",
    ],
    exclusions: [
      "Airfare to and from Guwahati",
      "Camera fees at national parks/monasteries",
      "Personal expenses such as tips and laundry",
      "Any meals not mentioned in the itinerary",
      "Travel insurance",
    ] },
];

/* Shared Terms & Conditions shown on every Fixed Departure detail page
   (kept here too so an eventual admin "terms" editor has somewhere to
   live; the frontend already has its own copy and keeps using it). */
const FIXED_TOUR_TERMS = [
  "Minimum 2 travellers are required for a guaranteed departure.",
  "Seats cannot be held without an advance deposit.",
  "A 20% deposit is required to confirm the booking.",
  "100% payment must be completed 15 days prior to departure.",
  "Standard hotel check-in time is 14:00 hrs and check-out is 12:00 hrs.",
  "Early check-in and late check-out are subject to availability and may attract an extra charge.",
  "If a mentioned hotel is unavailable, a similar-category property will be provided.",
  "Itinerary sequence may change due to weather, road conditions or local restrictions, without reducing the number of sightseeing points covered.",
  "Package rates are based on the specified room category — any upgrade will be at an additional cost.",
];

/* ---------- Storage (simple JSON file, same pattern as packages.js) ---------- */
function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return { departures: SEED_FIXED.map((f) => ({ ...f })) };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

/* Derive the top-level date/d/m/seats fields (used by the fixed-list
   row card and as a sane default) from the soonest date option that
   still has seats, falling back to the very first option if all are
   sold out. Keeps every departure's "primary" date always in sync with
   its own dateOptions instead of drifting out of date. */
function withDerivedFields(f) {
  const opts = Array.isArray(f.dateOptions) && f.dateOptions.length ? f.dateOptions : [];
  const primary = opts.find((o) => Number(o.seats) > 0) || opts[0] || { d: "", m: "", date: "", seats: 0 };
  return {
    ...f,
    date: primary.date,
    d: primary.d,
    m: primary.m,
    seats: Number(primary.seats) || 0,
    totalSeatsLeft: opts.reduce((sum, o) => sum + (Number(o.seats) || 0), 0),
  };
}

function monthKeyOf(opt) {
  // "12 May 2027" -> "May 2027"
  const parts = String(opt.date || "").trim().split(" ");
  return parts.length >= 3 ? `${parts[1]} ${parts[2]}` : `${opt.m || ""}`;
}

function groupByMonth(dateOptions) {
  const byMonth = {};
  (dateOptions || []).forEach((opt) => {
    const key = monthKeyOf(opt);
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(opt);
  });
  return byMonth;
}

/* ---------- Admin auth + rate limit (same pattern as packages.js) ---------- */
function checkAdmin(req, res) {
  const key = req.body?.adminKey || req.query?.adminKey;
  if (ADMIN_KEY && key !== ADMIN_KEY) {
    res.status(401).json({ error: "Invalid admin key." });
    return false;
  }
  return true;
}
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });

/* -----------------------------------------------------------------------
   Called from bookings.js right after a fixed-departure booking is
   saved. Knocks ONE seat off the exact date the customer picked. Safe
   to call even if the date can't be matched (e.g. old/removed date) —
   it just won't find anything to decrement, the booking itself is
   never blocked by this.
----------------------------------------------------------------------- */
function reserveSeat(fixedId, dateStr) {
  if (!fixedId || !dateStr) return null;
  const data = loadData();
  const dep = data.departures.find((f) => f.id === fixedId);
  if (!dep) return null;
  const opt = (dep.dateOptions || []).find((o) => o.date === dateStr);
  if (!opt) return null;
  if (Number(opt.seats) > 0) {
    opt.seats = Number(opt.seats) - 1;
    saveData(data);
  }
  return { fixedId, date: dateStr, seatsLeft: opt.seats };
}

/* ---------- Routes ---------- */

// Public: list all departures with live seat counts.
router.get("/", (req, res) => {
  try {
    const data = loadData();
    res.json({ ok: true, departures: data.departures.map(withDerivedFields) });
  } catch (err) {
    console.error("fixed list error:", err);
    res.status(500).json({ error: "Could not load fixed departures." });
  }
});

// Public: single departure, full detail (itinerary, hotel, dateOptions, etc.)
router.get("/:id", (req, res) => {
  const data = loadData();
  const dep = data.departures.find((f) => f.id === req.params.id);
  if (!dep) return res.status(404).json({ error: "Fixed departure not found." });
  res.json({ ok: true, departure: withDerivedFields(dep) });
});

// Public: live availability for one departure, grouped by month — this is
// what the "Check Availability" button on the detail page calls.
router.get("/:id/availability", (req, res) => {
  const data = loadData();
  const dep = data.departures.find((f) => f.id === req.params.id);
  if (!dep) return res.status(404).json({ error: "Fixed departure not found." });
  const dateOptions = dep.dateOptions || [];
  res.json({
    ok: true,
    id: dep.id,
    name: dep.name,
    dateOptions,
    byMonth: groupByMonth(dateOptions),
  });
});

// Admin: add a new fixed departure.
router.post("/", adminLimiter, (req, res) => {
  if (!checkAdmin(req, res)) return;
  const b = req.body || {};
  if (!b.name || !b.loc) {
    return res.status(400).json({ error: "name and loc are required." });
  }
  const data = loadData();
  const dep = {
    id: `fixed-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: b.name,
    loc: b.loc,
    days: b.days || "5D/4N",
    price: Number(b.price) || 0,
    fromCity: b.fromCity || "",
    badge: b.badge || "",
    shortDesc: b.shortDesc || "",
    dateOptions: Array.isArray(b.dateOptions) ? b.dateOptions.map((o) => ({
      d: o.d || "", m: o.m || "", date: o.date || "", seats: Number(o.seats) || 0,
    })) : [],
    highlights: Array.isArray(b.highlights) ? b.highlights : [],
    dayWise: Array.isArray(b.dayWise) ? b.dayWise : [],
    hotel: b.hotel && typeof b.hotel === "object" ? b.hotel : {},
    included: Array.isArray(b.included) ? b.included : [],
    exclusions: Array.isArray(b.exclusions) ? b.exclusions : [],
    createdAt: new Date().toISOString(),
  };
  data.departures.unshift(dep);
  saveData(data);
  res.json({ ok: true, departure: withDerivedFields(dep) });
});

// Admin: edit a departure's fields (not its date options — see /dates below).
router.put("/:id", adminLimiter, (req, res) => {
  if (!checkAdmin(req, res)) return;
  const data = loadData();
  const idx = data.departures.findIndex((f) => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Fixed departure not found." });
  const body = req.body || {};
  const allowed = [
    "name", "loc", "days", "price", "fromCity", "badge", "shortDesc",
    "highlights", "dayWise", "hotel", "included", "exclusions", "dateOptions",
  ];
  allowed.forEach((field) => {
    if (body[field] !== undefined) data.departures[idx][field] = body[field];
  });
  saveData(data);
  res.json({ ok: true, departure: withDerivedFields(data.departures[idx]) });
});

// Admin: delete a departure entirely.
router.delete("/:id", adminLimiter, (req, res) => {
  if (!checkAdmin(req, res)) return;
  const data = loadData();
  const before = data.departures.length;
  data.departures = data.departures.filter((f) => f.id !== req.params.id);
  if (data.departures.length === before) return res.status(404).json({ error: "Fixed departure not found." });
  saveData(data);
  res.json({ ok: true });
});

// Admin: set (or add) one date option's seat count. This is the main
// "update available seats" endpoint — used by the admin dashboard's
// per-date seat editor.
// body: { adminKey, date, d, m, seats }
router.put("/:id/dates", adminLimiter, (req, res) => {
  if (!checkAdmin(req, res)) return;
  const { date, d, m, seats } = req.body || {};
  if (!date) return res.status(400).json({ error: "date is required." });
  const data = loadData();
  const dep = data.departures.find((f) => f.id === req.params.id);
  if (!dep) return res.status(404).json({ error: "Fixed departure not found." });

  dep.dateOptions = dep.dateOptions || [];
  let opt = dep.dateOptions.find((o) => o.date === date);
  if (opt) {
    opt.seats = Number(seats) || 0;
    if (d) opt.d = d;
    if (m) opt.m = m;
  } else {
    opt = { d: d || "", m: m || "", date, seats: Number(seats) || 0 };
    dep.dateOptions.push(opt);
  }
  saveData(data);
  res.json({ ok: true, departure: withDerivedFields(dep) });
});

// Admin: remove one date option from a departure.
router.delete("/:id/dates/:date", adminLimiter, (req, res) => {
  if (!checkAdmin(req, res)) return;
  const data = loadData();
  const dep = data.departures.find((f) => f.id === req.params.id);
  if (!dep) return res.status(404).json({ error: "Fixed departure not found." });
  const target = decodeURIComponent(req.params.date);
  const before = (dep.dateOptions || []).length;
  dep.dateOptions = (dep.dateOptions || []).filter((o) => o.date !== target);
  if (dep.dateOptions.length === before) return res.status(404).json({ error: "Date option not found." });
  saveData(data);
  res.json({ ok: true, departure: withDerivedFields(dep) });
});

module.exports = router;
module.exports.reserveSeat = reserveSeat;
module.exports.FIXED_TOUR_TERMS = FIXED_TOUR_TERMS;
