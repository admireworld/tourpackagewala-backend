/**
 * AdmireDworld Travel — India Packages module
 * ---------------------------------------------
 * NEW FEATURE — does not touch any existing OTP/blog code.
 * Mount in server.js with: app.use("/api/packages", require("./packages"));
 *
 * What it does
 * ------------
 * - India Packages now live on the BACKEND (not hardcoded in the
 *   frontend). Each package has: destination, day-wise itinerary,
 *   hotel category, inclusions, exclusions, price, discount price
 *   (plus the card fields the site already uses: name, route, tag,
 *   filter category, short description, cover image).
 * - Once a week, the server AUTO-ADDS one new India package using the
 *   same free AI provider as the blog (Pollinations.ai — no key, no
 *   cost). This is "lazy": the first visitor of the week triggers it,
 *   so it works fine on free hosting that sleeps.
 * - You (admin) get FULL access from the backend to add, edit, or
 *   delete any package at any time — AI-added or your own — via the
 *   endpoints below, protected by the same ADMIN_KEY used for the blog.
 * - Data is stored in a local JSON file (packages-data.json), seeded
 *   on first run with the 6 packages the site already had, so nothing
 *   visually breaks on switch-over. Swap loadData/saveData for a real
 *   database later if you need guaranteed persistence.
 *
 * Env vars used:
 *   ADMIN_KEY  -> same secret as blog.js, protects add/edit/delete
 *   (AI provider/key is shared with blog.js via ai-provider.js, and is
 *   normally managed from the Admin Dashboard instead of env vars)
 *
 * Endpoints
 * ---------
 *   GET    /api/packages/india          -> list (auto-adds this week's AI pick first)
 *   GET    /api/packages/india/:id      -> single package (full detail incl. itinerary)
 *   POST   /api/packages/india          -> add a package  { ...fields, adminKey }
 *   PUT    /api/packages/india/:id      -> edit a package  { ...fields, adminKey }
 *   DELETE /api/packages/india/:id      -> remove a package  { adminKey } (in body)
 */

const express = require("express");
const fs = require("fs");
const path = require("path");
const rateLimit = require("express-rate-limit");
const { generateText, generateImageUrl } = require("./ai-provider");

const router = express.Router();

const DATA_FILE = path.join(__dirname, "packages-data.json");
const ADMIN_KEY = process.env.ADMIN_KEY || "";

/* ---------- SEO-friendly slug helper ----------
 * Builds each package's crawlable URL slug, e.g.
 * "coorg-and-chikmagalur-karnataka-coffee-estate-escape".
 *
 * NOW PERSISTED (additive — nothing above/below this block changes):
 * every package gets a `slug` field saved to its JSON file the first
 * time it's loaded after this update, and every NEW package (manual,
 * AI auto-add) gets its slug assigned at creation time. Once a slug is
 * saved it stays stable even if the package is later renamed — that's
 * what makes it safe to use as a permanent public URL / share link.
 * Uniqueness is guaranteed *within* each file (india / international)
 * by appending "-2", "-3", etc. on a collision.
 */
function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "package";
}

// Makes sure every package in the array has a stable, unique `slug`.
// Mutates the array in place (fills in `p.slug` where missing/duplicate)
// and returns true if anything changed, so the caller knows whether the
// file needs to be re-saved.
function ensureSlugs(pkgs) {
  const used = new Set();
  let changed = false;
  for (const p of pkgs) {
    const base = slugify(p.name);
    let slug = typeof p.slug === "string" && p.slug ? p.slug : null;
    if (!slug || used.has(slug)) {
      let candidate = slug && !used.has(slug) ? slug : base;
      let n = 2;
      while (used.has(candidate)) candidate = `${base}-${n++}`;
      if (candidate !== p.slug) {
        p.slug = candidate;
        changed = true;
      }
      slug = candidate;
    }
    used.add(slug);
  }
  return changed;
}

// Picks a fresh, unique slug for a brand-new package being created right
// now (admin add / weekly AI auto-add), given the packages already in
// that file.
function nextUniqueSlug(name, existingPkgs) {
  const used = new Set((existingPkgs || []).map((p) => p.slug).filter(Boolean));
  const base = slugify(name);
  let slug = base;
  let n = 2;
  while (used.has(slug)) slug = `${base}-${n++}`;
  return slug;
}

function withSlug(p) {
  if (!p) return p;
  return p.slug ? p : { ...p, slug: slugify(p.name) };
}

/* ---------- Seed data (same 6 packages the frontend already had) ---------- */
const SEED_PACKAGES = [
  { id: "in1", destination: "Srinagar, Gulmarg, Pahalgam", name: "Kashmir Valley Escape",
    loc: "Srinagar · Gulmarg · Pahalgam", tag: "6D/5N", cat: "hills",
    desc: "Shikara stays, snow-capped meadows and Mughal gardens.",
    hotelCategory: "4-star", hotelName: "The Khyber Himalayan Resort & Spa (or similar)", price: 24999, discountPrice: 22999,
    dayWise: [
      { day: 1, title: "Arrival in Srinagar", desc: "Check-in, evening Shikara ride on Dal Lake." },
      { day: 2, title: "Gulmarg excursion", desc: "Gondola ride, meadow views, return to Srinagar." },
      { day: 3, title: "Pahalgam day trip", desc: "Betaab Valley, Aru Valley sightseeing." },
      { day: 4, title: "Mughal Gardens", desc: "Nishat, Shalimar and Chashme Shahi gardens." },
      { day: 5, title: "Leisure day", desc: "Local market, houseboat stay." },
      { day: 6, title: "Departure", desc: "Transfer to airport." },
    ],
    inclusions: ["Hotel/houseboat stay", "Daily breakfast & dinner", "Airport transfers", "Sightseeing by private cab", "Shikara ride"],
    exclusions: ["Flights", "Personal expenses", "Anything not mentioned in inclusions", "GST as applicable"],
    imageUrl: null, source: "seed" },

  { id: "in2", destination: "Alleppey, Kumarakom, Munnar", name: "Kerala Backwaters",
    loc: "Alleppey · Kumarakom · Munnar", tag: "5D/4N", cat: "offbeat",
    desc: "Houseboat nights and tea garden mornings.",
    hotelCategory: "4-star", hotelName: "Backwater Ripples / Lake Resort (or similar)", price: 21999, discountPrice: 19999,
    dayWise: [
      { day: 1, title: "Arrival, transfer to Alleppey", desc: "Check-in to houseboat, backwater cruise." },
      { day: 2, title: "Kumarakom", desc: "Bird sanctuary, lake resort stay." },
      { day: 3, title: "Munnar transfer", desc: "Tea gardens en route, evening at leisure." },
      { day: 4, title: "Munnar sightseeing", desc: "Eravikulam National Park, tea museum." },
      { day: 5, title: "Departure", desc: "Transfer to airport/station." },
    ],
    inclusions: ["Houseboat overnight stay", "Hotel stay", "Daily breakfast", "All transfers", "Sightseeing"],
    exclusions: ["Flights", "Lunch & dinner (except on houseboat)", "Personal expenses"],
    imageUrl: null, source: "seed" },

  { id: "in3", destination: "Jaipur, Udaipur, Jodhpur", name: "Royal Rajasthan",
    loc: "Jaipur · Udaipur · Jodhpur", tag: "7D/6N", cat: "heritage",
    desc: "A combo of forts, havelis and desert sunsets.",
    hotelCategory: "4-star heritage", hotelName: "Heritage Haveli Group Hotel (or similar)", price: 28999, discountPrice: 26499,
    dayWise: [
      { day: 1, title: "Arrival in Jaipur", desc: "Check-in, evening at Johari Bazaar." },
      { day: 2, title: "Jaipur sightseeing", desc: "Amber Fort, City Palace, Hawa Mahal." },
      { day: 3, title: "Transfer to Udaipur", desc: "En route stop, evening Lake Pichola boat ride." },
      { day: 4, title: "Udaipur sightseeing", desc: "City Palace, Saheliyon ki Bari." },
      { day: 5, title: "Transfer to Jodhpur", desc: "Check-in, Clock Tower market." },
      { day: 6, title: "Jodhpur sightseeing", desc: "Mehrangarh Fort, Jaswant Thada." },
      { day: 7, title: "Departure", desc: "Transfer to airport/station." },
    ],
    inclusions: ["Hotel stay", "Daily breakfast", "All transfers", "Sightseeing by private cab", "Boat ride at Udaipur"],
    exclusions: ["Flights", "Lunch & dinner", "Monument entry fees", "Personal expenses"],
    imageUrl: null, source: "seed" },

  { id: "in4", destination: "North & South Goa", name: "Goa Beach Break",
    loc: "North & South Goa", tag: "4D/3N", cat: "beach",
    desc: "Beach shacks, water sports and laid-back vibes.",
    hotelCategory: "3-star", hotelName: "Local Partner Hotel (or similar)", price: 15999, discountPrice: 13999,
    dayWise: [
      { day: 1, title: "Arrival, North Goa", desc: "Check-in, Baga & Calangute beach visit." },
      { day: 2, title: "Water sports & Fort Aguada", desc: "Optional water sports, Fort Aguada visit." },
      { day: 3, title: "South Goa", desc: "Colva & Palolem beach, laid-back day." },
      { day: 4, title: "Departure", desc: "Transfer to airport." },
    ],
    inclusions: ["Hotel stay", "Daily breakfast", "Airport transfers", "One sightseeing tour"],
    exclusions: ["Flights", "Water sports charges", "Lunch & dinner", "Personal expenses"],
    imageUrl: null, source: "seed" },

  { id: "in5", destination: "Manali, Shimla, Kasol", name: "Himachal Hills",
    loc: "Manali · Shimla · Kasol", tag: "6D/5N", cat: "hills",
    desc: "Pine forests, river valleys and mountain cafes.",
    hotelCategory: "3-star", hotelName: "Local Partner Hotel (or similar)", price: 19999, discountPrice: 17999,
    dayWise: [
      { day: 1, title: "Arrival in Manali", desc: "Check-in, Mall Road evening." },
      { day: 2, title: "Solang Valley", desc: "Snow point / adventure activities." },
      { day: 3, title: "Kasol day trip", desc: "Riverside cafes, Parvati Valley." },
      { day: 4, title: "Transfer to Shimla", desc: "Scenic drive, check-in." },
      { day: 5, title: "Shimla sightseeing", desc: "Ridge, Mall Road, Jakhoo Temple." },
      { day: 6, title: "Departure", desc: "Transfer onward." },
    ],
    inclusions: ["Hotel stay", "Daily breakfast", "All transfers", "Sightseeing by private cab"],
    exclusions: ["Flights/train", "Adventure activity charges", "Lunch & dinner", "Personal expenses"],
    imageUrl: null, source: "seed" },

  { id: "in6", destination: "Shillong, Cherrapunji", name: "Meghalaya Offbeat",
    loc: "Shillong · Cherrapunji", tag: "5D/4N", cat: "offbeat",
    desc: "Living root bridges and waterfall trails.",
    hotelCategory: "3-star", hotelName: "Local Partner Hotel (or similar)", price: 23999, discountPrice: 21499,
    dayWise: [
      { day: 1, title: "Arrival in Shillong", desc: "Check-in, Police Bazar evening." },
      { day: 2, title: "Shillong sightseeing", desc: "Elephant Falls, Shillong Peak." },
      { day: 3, title: "Cherrapunji", desc: "Living root bridges trek, waterfalls." },
      { day: 4, title: "Dawki", desc: "Umngot river boating (season permitting)." },
      { day: 5, title: "Departure", desc: "Transfer to airport." },
    ],
    inclusions: ["Hotel stay", "Daily breakfast", "All transfers", "Sightseeing by private cab"],
    exclusions: ["Flights", "Trekking guide charges", "Lunch & dinner", "Personal expenses"],
    imageUrl: null, source: "seed" },
];

/* ---------- Rotating topics for the weekly AI auto-add ---------- */
const AUTO_DESTINATIONS = [
  "Coorg and Chikmagalur, Karnataka — coffee estate escape",
  "Rann of Kutch, Gujarat — white desert experience",
  "Andaman Islands — beaches and scuba diving",
  "Spiti Valley, Himachal Pradesh — cold desert road trip",
  "Varanasi and Rishikesh — spiritual India circuit",
  "Coorg to Wayanad — Western Ghats hill trail",
  "Sikkim — Gangtok, Pelling and Nathula",
  "Hampi, Karnataka — heritage ruins getaway",
  "Gokarna, Karnataka — quiet beach alternative to Goa",
  "Darjeeling and Kalimpong — tea and toy train trip",
];

/* ---------- Storage ---------- */
function loadData() {
  let data;
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    data = JSON.parse(raw);
    data.packages = data.packages || [];
  } catch {
    data = { packages: SEED_PACKAGES.map((p) => ({ ...p })), lastAutoWeek: null, destCursor: 0 };
  }
  // Backfill/repair slugs (new field) and persist once so every future
  // load already has them — no-op once every package has a stable slug.
  if (ensureSlugs(data.packages)) saveData(data);
  return data;
}
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function isoWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${week}`;
}

/* ---------- AI helpers ----------
 * generateText()/generateImageUrl() are shared with blog.js, imported
 * from ai-provider.js at the top of this file. Provider + API key are
 * editable any time from the Admin Dashboard (Settings → "AI Content
 * Provider") — no code change or redeploy needed.
 */

function pickAutoDestination(data) {
  const dest = AUTO_DESTINATIONS[data.destCursor % AUTO_DESTINATIONS.length];
  data.destCursor = (data.destCursor + 1) % AUTO_DESTINATIONS.length;
  return dest;
}

const CATS = ["hills", "beach", "heritage", "offbeat"];

/* ---------- Core: weekly auto-add ---------- */
async function ensureWeeklyPackage() {
  const data = loadData();
  const week = isoWeekKey();
  if (data.lastAutoWeek === week) return data.packages;

  const destination = pickAutoDestination(data);
  const prompt =
    `Create one India travel package as strict JSON only (no markdown, no extra text). ` +
    `Destination: "${destination}". JSON shape: ` +
    `{"name":"short catchy package name","loc":"place1 · place2 · place3","tag":"6D/5N",` +
    `"desc":"one short sentence","hotelCategory":"3-star/4-star/luxury etc",` +
    `"hotelName":"a plausible hotel/resort name for this destination, add (or similar) at the end",` +
    `"dayWise":[{"day":1,"title":"...","desc":"..."}],` +
    `"inclusions":["...","..."],"exclusions":["...","..."],` +
    `"price":24999,"discountPrice":21999}`;

  let pkg = null;
  try {
    const raw = await generateText(prompt);
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");
    const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
    pkg = {
      id: `auto-${Date.now()}`,
      destination,
      name: parsed.name || destination,
      loc: parsed.loc || destination,
      tag: parsed.tag || "5D/4N",
      cat: CATS[data.destCursor % CATS.length],
      desc: parsed.desc || `Explore ${destination}.`,
      hotelCategory: parsed.hotelCategory || "3-star",
      hotelName: parsed.hotelName || "",
      dayWise: Array.isArray(parsed.dayWise) ? parsed.dayWise : [],
      inclusions: Array.isArray(parsed.inclusions) ? parsed.inclusions : [],
      exclusions: Array.isArray(parsed.exclusions) ? parsed.exclusions : [],
      price: Number(parsed.price) || 24999,
      discountPrice: Number(parsed.discountPrice) || undefined,
      imageUrl: await generateImageUrl(destination),
      source: "ai",
      createdAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("packages: AI generation failed, using fallback:", err.message);
    pkg = {
      id: `auto-${Date.now()}`,
      destination,
      name: destination.split("—")[0].trim(),
      loc: destination,
      tag: "5D/4N",
      cat: CATS[data.destCursor % CATS.length],
      desc: `A fresh itinerary for ${destination}.`,
      hotelCategory: "3-star",
      hotelName: "",
      dayWise: [{ day: 1, title: "Arrival", desc: "Details being finalized — check back soon." }],
      inclusions: ["Hotel stay", "Breakfast", "Transfers"],
      exclusions: ["Flights", "Personal expenses"],
      price: 24999,
      discountPrice: undefined,
      imageUrl: await generateImageUrl(destination),
      source: "ai",
      createdAt: new Date().toISOString(),
    };
  }

  pkg.slug = nextUniqueSlug(pkg.name, data.packages);
  data.packages.unshift(pkg);
  data.lastAutoWeek = week;
  saveData(data);
  return data.packages;
}

/* ---------- Admin auth + rate limit ---------- */
function checkAdmin(req, res) {
  const key = req.body?.adminKey || req.query?.adminKey;
  if (ADMIN_KEY && key !== ADMIN_KEY) {
    res.status(401).json({ error: "Invalid admin key." });
    return false;
  }
  return true;
}
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });

/* ---------- Routes ---------- */
router.get("/india", async (req, res) => {
  try {
    const packages = await ensureWeeklyPackage();
    res.json({ ok: true, packages: packages.map(withSlug) });
  } catch (err) {
    console.error("packages list error:", err);
    res.status(500).json({ error: "Could not load packages." });
  }
});

router.get("/india/:id", (req, res) => {
  const data = loadData();
  const pkg = data.packages.find((p) => p.id === req.params.id);
  if (!pkg) return res.status(404).json({ error: "Package not found." });
  res.json({ ok: true, package: withSlug(pkg) });
});

router.post("/india", adminLimiter, (req, res) => {
  if (!checkAdmin(req, res)) return;
  const body = req.body || {};
  if (!body.name || !body.loc) {
    return res.status(400).json({ error: "name and loc are required." });
  }
  const data = loadData();
  const pkg = {
    id: `manual-${Date.now()}`,
    destination: body.destination || body.loc,
    name: body.name,
    loc: body.loc,
    tag: body.tag || "5D/4N",
    cat: body.cat || "offbeat",
    desc: body.desc || "",
    hotelCategory: body.hotelCategory || "3-star",
    hotelName: (body.hotelName || "").trim(),
    dayWise: Array.isArray(body.dayWise) ? body.dayWise : [],
    inclusions: Array.isArray(body.inclusions) ? body.inclusions : [],
    exclusions: Array.isArray(body.exclusions) ? body.exclusions : [],
    price: Number(body.price) || 0,
    discountPrice: body.discountPrice ? Number(body.discountPrice) : undefined,
    imageUrl: body.imageUrl || null,
    source: "admin",
    createdAt: new Date().toISOString(),
  };
  pkg.slug = nextUniqueSlug(pkg.name, data.packages);
  data.packages.unshift(pkg);
  saveData(data);
  res.json({ ok: true, package: withSlug(pkg) });
});

router.put("/india/:id", adminLimiter, (req, res) => {
  if (!checkAdmin(req, res)) return;
  const data = loadData();
  const idx = data.packages.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Package not found." });
  const body = req.body || {};
  const allowed = [
    "destination", "name", "loc", "tag", "cat", "desc", "hotelCategory", "hotelName",
    "dayWise", "inclusions", "exclusions", "price", "discountPrice", "imageUrl",
  ];
  allowed.forEach((field) => {
    if (body[field] !== undefined) data.packages[idx][field] = body[field];
  });
  saveData(data);
  res.json({ ok: true, package: withSlug(data.packages[idx]) });
});

router.delete("/india/:id", adminLimiter, (req, res) => {
  if (!checkAdmin(req, res)) return;
  const data = loadData();
  const before = data.packages.length;
  data.packages = data.packages.filter((p) => p.id !== req.params.id);
  if (data.packages.length === before) return res.status(404).json({ error: "Package not found." });
  saveData(data);
  res.json({ ok: true });
});

/* ================================================================
   INTERNATIONAL PACKAGES — same idea as India above (weekly AI
   auto-add + full admin CRUD), kept fully separate so nothing in
   the India section above is touched. Reuses the generic helpers
   (generateText, generateImageUrl, checkAdmin, adminLimiter,
   isoWeekKey) already defined above.
================================================================ */

const DATA_FILE_INTL = path.join(__dirname, "packages-international-data.json");

const SEED_PACKAGES_INTL = [
  { id: "it1", destination: "Ubud, Seminyak, Nusa Penida (Bali)", name: "Bali Island Retreat",
    loc: "Ubud · Seminyak · Nusa Penida", tag: "6D/5N", cat: "beach",
    desc: "Rice terraces, beach clubs and temple visits.",
    hotelCategory: "4-star", hotelName: "Ubud/Seminyak Resort Collection (or similar)", price: 54999, discountPrice: 49999,
    dayWise: [
      { day: 1, title: "Arrival, Seminyak", desc: "Check-in, beach club evening." },
      { day: 2, title: "Ubud", desc: "Rice terraces, monkey forest, transfer to Ubud." },
      { day: 3, title: "Ubud temples", desc: "Tirta Empul, local market visit." },
      { day: 4, title: "Nusa Penida day trip", desc: "Kelingking Beach, Angel's Billabong." },
      { day: 5, title: "Leisure day", desc: "Spa, optional water sports." },
      { day: 6, title: "Departure", desc: "Transfer to airport." },
    ],
    inclusions: ["Hotel stay", "Daily breakfast", "Airport transfers", "Nusa Penida day trip"],
    exclusions: ["International flights", "Visa fees", "Personal expenses"],
    imageUrl: null, source: "seed" },

  { id: "it2", destination: "Downtown Dubai, Palm Jumeirah", name: "Dubai City Lights",
    loc: "Downtown · Palm Jumeirah", tag: "5D/4N", cat: "city",
    desc: "Desert safari, skyline views and shopping.",
    hotelCategory: "4-star", hotelName: "Downtown Dubai Hotel (or similar)", price: 49999, discountPrice: 45999,
    dayWise: [
      { day: 1, title: "Arrival", desc: "Check-in, Dubai Mall & fountain show." },
      { day: 2, title: "Desert safari", desc: "Dune bashing, BBQ dinner with entertainment." },
      { day: 3, title: "Burj Khalifa & Downtown", desc: "At the Top visit, Downtown walk." },
      { day: 4, title: "Palm Jumeirah", desc: "Atlantis area, beach time." },
      { day: 5, title: "Departure", desc: "Transfer to airport." },
    ],
    inclusions: ["Hotel stay", "Daily breakfast", "Desert safari with dinner", "Burj Khalifa tickets", "Airport transfers"],
    exclusions: ["International flights", "Visa fees", "Personal expenses"],
    imageUrl: null, source: "seed" },

  { id: "it3", destination: "Zurich, Interlaken, Lucerne", name: "Switzerland Alps",
    loc: "Zurich · Interlaken · Lucerne", tag: "7D/6N", cat: "scenic",
    desc: "Snow trains and alpine lake towns.",
    hotelCategory: "4-star", hotelName: "Alpine Lake View Hotel (or similar)", price: 129999, discountPrice: 119999,
    dayWise: [
      { day: 1, title: "Arrival Zurich", desc: "Check-in, old town walk." },
      { day: 2, title: "Zurich to Lucerne", desc: "Chapel Bridge, lake cruise." },
      { day: 3, title: "Mount Titlis", desc: "Cable car, snow activities." },
      { day: 4, title: "Transfer to Interlaken", desc: "Scenic train ride." },
      { day: 5, title: "Jungfraujoch", desc: "Top of Europe excursion." },
      { day: 6, title: "Leisure in Interlaken", desc: "Lake activities, local cafes." },
      { day: 7, title: "Departure", desc: "Transfer to airport." },
    ],
    inclusions: ["Hotel stay", "Daily breakfast", "Swiss rail passes as per itinerary", "Cable car/excursion tickets"],
    exclusions: ["International flights", "Visa fees", "Personal expenses", "Meals not mentioned"],
    imageUrl: null, source: "seed" },

  { id: "it4", destination: "Male Atoll, Maldives", name: "Maldives Overwater",
    loc: "Male Atoll", tag: "4D/3N", cat: "honeymoon",
    desc: "Overwater villas and coral reef snorkeling.",
    hotelCategory: "5-star", hotelName: "Overwater Villa Resort (or similar)", price: 89999, discountPrice: 82999,
    dayWise: [
      { day: 1, title: "Arrival", desc: "Speedboat/seaplane transfer, overwater villa check-in." },
      { day: 2, title: "Snorkeling excursion", desc: "Coral reef snorkeling trip." },
      { day: 3, title: "Leisure day", desc: "Spa, sunset cruise." },
      { day: 4, title: "Departure", desc: "Transfer to airport." },
    ],
    inclusions: ["Overwater villa stay", "All meals", "Airport-resort transfers", "One snorkeling excursion"],
    exclusions: ["International flights", "Visa/entry fees where applicable", "Personal expenses"],
    imageUrl: null, source: "seed" },

  { id: "it5", destination: "Bangkok, Phuket, Krabi", name: "Thailand Highlights",
    loc: "Bangkok · Phuket · Krabi", tag: "6D/5N", cat: "beach",
    desc: "Islands, street food and night markets.",
    hotelCategory: "3-star", hotelName: "Bangkok/Phuket/Krabi Hotel Group (or similar)", price: 44999, discountPrice: 39999,
    dayWise: [
      { day: 1, title: "Arrival Bangkok", desc: "Check-in, night market visit." },
      { day: 2, title: "Bangkok sightseeing", desc: "Grand Palace, temples." },
      { day: 3, title: "Transfer to Phuket", desc: "Beach evening." },
      { day: 4, title: "Phi Phi Islands", desc: "Island hopping day tour." },
      { day: 5, title: "Krabi day trip", desc: "Railay Beach, viewpoints." },
      { day: 6, title: "Departure", desc: "Transfer to airport." },
    ],
    inclusions: ["Hotel stay", "Daily breakfast", "Island hopping tour", "Airport transfers"],
    exclusions: ["International flights", "Visa fees", "Personal expenses"],
    imageUrl: null, source: "seed" },

  { id: "it6", destination: "Marina Bay, Sentosa (Singapore)", name: "Singapore Explorer",
    loc: "Marina Bay · Sentosa", tag: "5D/4N", cat: "city",
    desc: "Skyline views, theme parks and gardens.",
    hotelCategory: "4-star", hotelName: "Marina Bay Area Hotel (or similar)", price: 59999, discountPrice: 54999,
    dayWise: [
      { day: 1, title: "Arrival", desc: "Check-in, Marina Bay Sands SkyPark." },
      { day: 2, title: "Gardens by the Bay", desc: "Cloud Forest, light show." },
      { day: 3, title: "Sentosa", desc: "Universal Studios day." },
      { day: 4, title: "City exploration", desc: "Chinatown, Little India." },
      { day: 5, title: "Departure", desc: "Transfer to airport." },
    ],
    inclusions: ["Hotel stay", "Daily breakfast", "Sentosa & Gardens by the Bay tickets", "Airport transfers"],
    exclusions: ["International flights", "Visa fees", "Personal expenses"],
    imageUrl: null, source: "seed" },
];

const AUTO_DESTINATIONS_INTL = [
  "Phuket, Thailand — beach and nightlife",
  "Paris, France — city and culture break",
  "Vietnam — Hanoi and Ha Long Bay",
  "Georgia (Tbilisi and Kazbegi) — offbeat Europe",
  "Mauritius — beach and honeymoon escape",
  "Turkey — Istanbul and Cappadocia",
  "Nepal — Kathmandu and Pokhara",
  "Sri Lanka — beaches and hill country",
  "Vietnam — Da Nang and Hoi An",
  "Azerbaijan — Baku city break",
];

const CATS_INTL = ["beach", "city", "scenic", "honeymoon"];

function loadDataIntl() {
  let data;
  try {
    const raw = fs.readFileSync(DATA_FILE_INTL, "utf8");
    data = JSON.parse(raw);
    data.packages = data.packages || [];
  } catch {
    data = { packages: SEED_PACKAGES_INTL.map((p) => ({ ...p })), lastAutoWeek: null, destCursor: 0 };
  }
  // Backfill/repair slugs the same way loadData() does for India packages.
  if (ensureSlugs(data.packages)) saveDataIntl(data);
  return data;
}
function saveDataIntl(data) {
  fs.writeFileSync(DATA_FILE_INTL, JSON.stringify(data, null, 2), "utf8");
}

function pickAutoDestinationIntl(data) {
  const dest = AUTO_DESTINATIONS_INTL[data.destCursor % AUTO_DESTINATIONS_INTL.length];
  data.destCursor = (data.destCursor + 1) % AUTO_DESTINATIONS_INTL.length;
  return dest;
}

async function ensureWeeklyPackageIntl() {
  const data = loadDataIntl();
  const week = isoWeekKey();
  if (data.lastAutoWeek === week) return data.packages;

  const destination = pickAutoDestinationIntl(data);
  const prompt =
    `Create one international travel package as strict JSON only (no markdown, no extra text). ` +
    `Destination: "${destination}". JSON shape: ` +
    `{"name":"short catchy package name","loc":"place1 · place2 · place3","tag":"6D/5N",` +
    `"desc":"one short sentence","hotelCategory":"3-star/4-star/luxury etc",` +
    `"hotelName":"a plausible hotel/resort name for this destination, add (or similar) at the end",` +
    `"dayWise":[{"day":1,"title":"...","desc":"..."}],` +
    `"inclusions":["...","..."],"exclusions":["...","..."],` +
    `"price":49999,"discountPrice":45999}`;

  let pkg = null;
  try {
    const raw = await generateText(prompt);
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");
    const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
    pkg = {
      id: `auto-intl-${Date.now()}`,
      destination,
      name: parsed.name || destination,
      loc: parsed.loc || destination,
      tag: parsed.tag || "5D/4N",
      cat: CATS_INTL[data.destCursor % CATS_INTL.length],
      desc: parsed.desc || `Explore ${destination}.`,
      hotelCategory: parsed.hotelCategory || "4-star",
      hotelName: parsed.hotelName || "",
      dayWise: Array.isArray(parsed.dayWise) ? parsed.dayWise : [],
      inclusions: Array.isArray(parsed.inclusions) ? parsed.inclusions : [],
      exclusions: Array.isArray(parsed.exclusions) ? parsed.exclusions : [],
      price: Number(parsed.price) || 49999,
      discountPrice: Number(parsed.discountPrice) || undefined,
      imageUrl: await generateImageUrl(destination),
      source: "ai",
      createdAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("packages(intl): AI generation failed, using fallback:", err.message);
    pkg = {
      id: `auto-intl-${Date.now()}`,
      destination,
      name: destination.split("—")[0].trim(),
      loc: destination,
      tag: "5D/4N",
      cat: CATS_INTL[data.destCursor % CATS_INTL.length],
      desc: `A fresh itinerary for ${destination}.`,
      hotelCategory: "4-star",
      hotelName: "",
      dayWise: [{ day: 1, title: "Arrival", desc: "Details being finalized — check back soon." }],
      inclusions: ["Hotel stay", "Breakfast", "Transfers"],
      exclusions: ["International flights", "Visa fees", "Personal expenses"],
      price: 49999,
      discountPrice: undefined,
      imageUrl: await generateImageUrl(destination),
      source: "ai",
      createdAt: new Date().toISOString(),
    };
  }

  pkg.slug = nextUniqueSlug(pkg.name, data.packages);
  data.packages.unshift(pkg);
  data.lastAutoWeek = week;
  saveDataIntl(data);
  return data.packages;
}

/* ---------- International routes ---------- */
router.get("/international", async (req, res) => {
  try {
    const packages = await ensureWeeklyPackageIntl();
    res.json({ ok: true, packages: packages.map(withSlug) });
  } catch (err) {
    console.error("packages(intl) list error:", err);
    res.status(500).json({ error: "Could not load packages." });
  }
});

router.get("/international/:id", (req, res) => {
  const data = loadDataIntl();
  const pkg = data.packages.find((p) => p.id === req.params.id);
  if (!pkg) return res.status(404).json({ error: "Package not found." });
  res.json({ ok: true, package: withSlug(pkg) });
});

router.post("/international", adminLimiter, (req, res) => {
  if (!checkAdmin(req, res)) return;
  const body = req.body || {};
  if (!body.name || !body.loc) {
    return res.status(400).json({ error: "name and loc are required." });
  }
  const data = loadDataIntl();
  const pkg = {
    id: `manual-intl-${Date.now()}`,
    destination: body.destination || body.loc,
    name: body.name,
    loc: body.loc,
    tag: body.tag || "5D/4N",
    cat: body.cat || "city",
    desc: body.desc || "",
    hotelCategory: body.hotelCategory || "4-star",
    hotelName: (body.hotelName || "").trim(),
    dayWise: Array.isArray(body.dayWise) ? body.dayWise : [],
    inclusions: Array.isArray(body.inclusions) ? body.inclusions : [],
    exclusions: Array.isArray(body.exclusions) ? body.exclusions : [],
    price: Number(body.price) || 0,
    discountPrice: body.discountPrice ? Number(body.discountPrice) : undefined,
    imageUrl: body.imageUrl || null,
    source: "admin",
    createdAt: new Date().toISOString(),
  };
  pkg.slug = nextUniqueSlug(pkg.name, data.packages);
  data.packages.unshift(pkg);
  saveDataIntl(data);
  res.json({ ok: true, package: withSlug(pkg) });
});

router.put("/international/:id", adminLimiter, (req, res) => {
  if (!checkAdmin(req, res)) return;
  const data = loadDataIntl();
  const idx = data.packages.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Package not found." });
  const body = req.body || {};
  const allowed = [
    "destination", "name", "loc", "tag", "cat", "desc", "hotelCategory", "hotelName",
    "dayWise", "inclusions", "exclusions", "price", "discountPrice", "imageUrl",
  ];
  allowed.forEach((field) => {
    if (body[field] !== undefined) data.packages[idx][field] = body[field];
  });
  saveDataIntl(data);
  res.json({ ok: true, package: withSlug(data.packages[idx]) });
});

router.delete("/international/:id", adminLimiter, (req, res) => {
  if (!checkAdmin(req, res)) return;
  const data = loadDataIntl();
  const before = data.packages.length;
  data.packages = data.packages.filter((p) => p.id !== req.params.id);
  if (data.packages.length === before) return res.status(404).json({ error: "Package not found." });
  saveDataIntl(data);
  res.json({ ok: true });
});

/* ================================================================
   SLUG SUPPORT (new) — flat, SEO-friendly URLs across BOTH India and
   International packages, e.g. GET /api/packages/coorg-and-
   chikmagalur-karnataka-coffee-estate-escape. Registered LAST so the
   existing literal routes above (/india, /india/:id, /international,
   /international/:id and their POST/PUT/DELETE) keep matching first —
   these two routes only catch what nothing above already handled.

   IMPORTANT: these two routes read from the SAME JSON files as
   everything above (packages-data.json / packages-international-
   data.json) via the same loadData()/loadDataIntl() — nothing new to
   deploy, no database required. Every package in both files now also
   carries a persisted `slug` field (see ensureSlugs() above), so this
   works immediately on next server start with zero manual migration.
================================================================ */

// Public: full package detail by slug — checks India packages first,
// then International. Used for the customer-facing package detail page
// (SEO-friendly URL) instead of looking the package up by its internal id.
router.get("/:slug", (req, res) => {
  const slug = String(req.params.slug || "").trim().toLowerCase();
  if (!slug) return res.status(404).json({ error: "Package not found." });

  const indiaData = loadData();
  let pkg = indiaData.packages.find((p) => p.slug === slug);
  let category = "india";

  if (!pkg) {
    const intlData = loadDataIntl();
    pkg = intlData.packages.find((p) => p.slug === slug);
    category = "international";
  }

  if (!pkg) return res.status(404).json({ error: "Package not found." });
  res.json({ ok: true, category, package: withSlug(pkg) });
});

// Public: flat list of every package (India + International) with just
// enough fields for a sitemap — id, slug, name, category, last-updated.
// Does NOT trigger the weekly AI auto-add (that only happens on the
// existing /india and /international list routes) so hitting this for
// a sitemap build never costs an AI call.
router.get("/", (req, res) => {
  try {
    const indiaData = loadData();
    const intlData = loadDataIntl();
    const packages = [
      ...indiaData.packages.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        category: "india",
        updatedAt: p.createdAt || null,
      })),
      ...intlData.packages.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        category: "international",
        updatedAt: p.createdAt || null,
      })),
    ];
    res.json({ ok: true, total: packages.length, packages });
  } catch (err) {
    console.error("packages: sitemap list error:", err);
    res.status(500).json({ error: "Could not load packages." });
  }
});

module.exports = router;
