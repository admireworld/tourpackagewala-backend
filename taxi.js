/**
 * AdmireDworld Travel — Taxi Service / Fare Calculator module
 * ------------------------------------------------------------
 * NEW FEATURE — does not touch any existing OTP/login/blog/packages/refer/
 * bookings/wedding/customize/leads/settings/offers/admin-auth code.
 * Mounted in server.js with: app.use("/api/taxi", require("./taxi"));
 *
 * What it does
 * ------------
 * Powers the public "Taxi Service — Fare Calculator" page (frontend:
 * taxi-fare-calculator.html). Every city name and every price on that page
 * comes from here, so you can add / edit / delete routes from the Admin
 * Dashboard -> "Taxi Fares" tab without touching any code.
 *
 * One "route" =
 *   from, to          city names (e.g. Haldwani -> Nainital)
 *   distanceKm        number (shown as "35 KM")
 *   sedan, ertiga, innova, tempo     prices in INR (0 / empty = "On request")
 *   bothWays          true (default): the same fare also works for To -> From,
 *                     so the calculator finds Nainital -> Haldwani too.
 *   active            false hides a route from the public page (not deleted)
 *
 * Storage uses store.js, exactly like offers/bookings/leads: MongoDB when
 * MONGODB_URI is set (permanent), local JSON file otherwise. If nothing has
 * ever been saved, the first load returns the starter route below (the one
 * from the design: Haldwani -> Nainital) — it is only written to storage
 * the first time an admin saves anything.
 *
 * Endpoints
 * ---------
 *   PUBLIC
 *   GET    /api/taxi/routes            -> { ok, routes: [...active only], notes: [...] }
 *   ADMIN (x-admin-key header or ?adminKey= — same ADMIN_KEY as every other admin route)
 *   GET    /api/taxi/admin/all         -> { ok, routes: [...all] }
 *   POST   /api/taxi/admin             -> create one route
 *   PUT    /api/taxi/admin/:id         -> update one route (send only the fields to change)
 *   DELETE /api/taxi/admin/:id         -> delete one route
 *   POST   /api/taxi/admin/bulk        -> { lines: "From,To,KM,Sedan,Ertiga,Innova,Tempo\n..." }
 *                                         adds new routes / updates existing From+To pairs
 */

const express = require("express");
const store = require("./store");

const router = express.Router();

const ADMIN_KEY = process.env.ADMIN_KEY || "";
const MAX_ROUTES = 500; // safety cap so the store can't grow forever
const MAX_CITY_LEN = 60;
const MAX_PRICE = 10000000;

// Shown under the fare table on the public page.
const NOTES = [
  "All prices are inclusive of driver allowance, fuel & tolls. Extra night charges ₹300/night may apply.",
  "Pricing is approximate and may vary based on demand & time.",
];

// Starter data (only used until an admin saves something from the dashboard).
const SEED_ROUTES = [
  {
    id: "tx-seed-haldwani-nainital",
    from: "Haldwani",
    to: "Nainital",
    distanceKm: 35,
    sedan: 1500,
    ertiga: 2000,
    innova: 2500,
    tempo: 4000,
    bothWays: true,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

/* ---------- helpers ---------- */
function checkAdmin(req, res) {
  const adminKey = req.query.adminKey || req.headers["x-admin-key"] || (req.body || {}).adminKey;
  if (ADMIN_KEY && adminKey !== ADMIN_KEY) {
    res.status(401).json({ error: "Invalid admin key." });
    return false;
  }
  return true;
}

const newId = () => "tx-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const safeId = (id) => /^tx-[a-z0-9-]+$/i.test(String(id || ""));

function slugify(str) {
  return (
    String(str || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "city"
  );
}
const routeSlug = (r) => `${slugify(r.from)}-to-${slugify(r.to)}`;
const sameCity = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

function cleanCity(v) {
  return String(v || "").replace(/\s+/g, " ").trim().slice(0, MAX_CITY_LEN);
}
function cleanPrice(v) {
  if (v === "" || v === null || v === undefined) return 0;
  const n = Math.round(Number(String(v).replace(/[₹,\s]/g, "")));
  if (!Number.isFinite(n) || n < 0 || n > MAX_PRICE) return NaN;
  return n;
}
function cleanKm(v) {
  if (v === "" || v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > 10000) return NaN;
  return Math.round(n * 10) / 10;
}

async function loadRoutes() {
  const data = await store.load("taxi", { routes: SEED_ROUTES });
  if (!data || !Array.isArray(data.routes)) return { routes: JSON.parse(JSON.stringify(SEED_ROUTES)) };
  return data;
}
const saveRoutes = (data) => store.save("taxi", data);

const publicView = (r) => ({
  id: r.id,
  from: r.from,
  to: r.to,
  slug: routeSlug(r),
  distanceKm: r.distanceKm || 0,
  prices: { sedan: r.sedan || 0, ertiga: r.ertiga || 0, innova: r.innova || 0, tempo: r.tempo || 0 },
  bothWays: r.bothWays !== false,
  active: r.active !== false,
  updatedAt: r.updatedAt || r.createdAt || null,
});

// Validates + normalises the editable fields. Returns { fields } or { error }.
function parseFields(body, { partial = false, existing = null } = {}) {
  const b = body || {};
  const out = {};

  if (!partial || "from" in b) {
    out.from = cleanCity(b.from);
    if (!out.from) return { error: "Please enter the 'From' city." };
  }
  if (!partial || "to" in b) {
    out.to = cleanCity(b.to);
    if (!out.to) return { error: "Please enter the 'To' city." };
  }
  const finalFrom = out.from || (existing && existing.from);
  const finalTo = out.to || (existing && existing.to);
  if (finalFrom && finalTo && sameCity(finalFrom, finalTo)) {
    return { error: "'From' and 'To' city cannot be the same." };
  }

  if (!partial || "distanceKm" in b) {
    out.distanceKm = cleanKm(b.distanceKm);
    if (Number.isNaN(out.distanceKm)) return { error: "Distance must be a number of kilometres." };
  }
  for (const key of ["sedan", "ertiga", "innova", "tempo"]) {
    if (!partial || key in b) {
      out[key] = cleanPrice(b[key]);
      if (Number.isNaN(out[key])) return { error: `Invalid ${key} price — use numbers only.` };
    }
  }
  if ("bothWays" in b) out.bothWays = b.bothWays === true || String(b.bothWays) === "true";
  else if (!partial) out.bothWays = true;
  if ("active" in b) out.active = b.active === true || String(b.active) === "true";
  else if (!partial) out.active = true;

  return { fields: out };
}

// True if another route already covers this exact From -> To pair.
function duplicateOf(routes, from, to, ignoreId) {
  return routes.find((r) => r.id !== ignoreId && sameCity(r.from, from) && sameCity(r.to, to));
}

/* =====================  PUBLIC  ===================== */

router.get("/routes", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "public, max-age=30"); // price edits show up within ~30s
    const { routes } = await loadRoutes();
    // Saved order is kept on purpose: the FIRST route is the one the public page
    // pre-selects when it opens (dropdowns are sorted A-Z by the page itself).
    const list = routes.filter((r) => r.active !== false).map(publicView);
    res.json({ ok: true, routes: list, notes: NOTES });
  } catch (err) {
    console.error("taxi: /routes failed:", err.message);
    res.status(500).json({ error: "Could not load taxi fares right now." });
  }
});

/* =====================  ADMIN  ===================== */

router.get("/admin/all", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const { routes } = await loadRoutes();
    const list = routes.map(publicView).sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
    res.json({ ok: true, routes: list });
  } catch (err) {
    console.error("taxi: admin/all failed:", err.message);
    res.status(500).json({ error: "Could not load taxi routes." });
  }
});

router.post("/admin", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const parsed = parseFields(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const data = await loadRoutes();
    if (data.routes.length >= MAX_ROUTES) {
      return res.status(400).json({ error: `Maximum ${MAX_ROUTES} routes. Please delete some old ones first.` });
    }
    if (duplicateOf(data.routes, parsed.fields.from, parsed.fields.to)) {
      return res.status(400).json({ error: `${parsed.fields.from} → ${parsed.fields.to} already exists. Edit that route instead.` });
    }
    const now = new Date().toISOString();
    const route = { id: newId(), ...parsed.fields, createdAt: now, updatedAt: now };
    data.routes.push(route);
    await saveRoutes(data);
    res.json({ ok: true, route: publicView(route) });
  } catch (e) {
    console.error("taxi: create failed:", e.message);
    res.status(500).json({ error: "Could not save the route. Please try again." });
  }
});

router.put("/admin/:id", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    if (!safeId(req.params.id)) return res.status(400).json({ error: "Invalid route id." });
    const data = await loadRoutes();
    const route = data.routes.find((r) => r.id === req.params.id);
    if (!route) return res.status(404).json({ error: "Route not found." });

    const parsed = parseFields(req.body, { partial: true, existing: route });
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const nextFrom = parsed.fields.from || route.from;
    const nextTo = parsed.fields.to || route.to;
    if (duplicateOf(data.routes, nextFrom, nextTo, route.id)) {
      return res.status(400).json({ error: `${nextFrom} → ${nextTo} already exists as another route.` });
    }

    Object.assign(route, parsed.fields, { updatedAt: new Date().toISOString() });
    await saveRoutes(data);
    res.json({ ok: true, route: publicView(route) });
  } catch (e) {
    console.error("taxi: update failed:", e.message);
    res.status(500).json({ error: "Could not update the route." });
  }
});

router.delete("/admin/:id", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    if (!safeId(req.params.id)) return res.status(400).json({ error: "Invalid route id." });
    const data = await loadRoutes();
    const before = data.routes.length;
    data.routes = data.routes.filter((r) => r.id !== req.params.id);
    if (data.routes.length === before) return res.status(404).json({ error: "Route not found." });
    await saveRoutes(data);
    res.json({ ok: true });
  } catch (e) {
    console.error("taxi: delete failed:", e.message);
    res.status(500).json({ error: "Could not delete the route." });
  }
});

// Bulk add / update. One route per line:
//   From, To, KM, Sedan, Ertiga, Innova, Tempo Traveller
// Existing From+To pairs are updated, new ones are added. Bad lines are
// skipped and reported back — good lines are still saved.
router.post("/admin/bulk", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const text = String((req.body || {}).lines || "");
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return res.status(400).json({ error: "Paste at least one line." });
    if (lines.length > 150) return res.status(400).json({ error: "Max 150 lines at a time." });

    const data = await loadRoutes();
    const now = new Date().toISOString();
    let added = 0;
    let updated = 0;
    const skipped = [];

    lines.forEach((line, i) => {
      // allow a header row like "From,To,KM,..."
      if (i === 0 && /^from\s*[,\t]/i.test(line)) return;
      const parts = line.split(/\t|,/).map((p) => p.trim());
      if (parts.length < 2) { skipped.push(`Line ${i + 1}: need at least From, To`); return; }
      const [from, to, km, sedan, ertiga, innova, tempo] = parts;
      const parsed = parseFields({ from, to, distanceKm: km, sedan, ertiga, innova, tempo });
      if (parsed.error) { skipped.push(`Line ${i + 1}: ${parsed.error}`); return; }

      const dup = duplicateOf(data.routes, parsed.fields.from, parsed.fields.to);
      if (dup) {
        Object.assign(dup, parsed.fields, { bothWays: dup.bothWays !== false, active: dup.active !== false, updatedAt: now });
        updated++;
      } else if (data.routes.length >= MAX_ROUTES) {
        skipped.push(`Line ${i + 1}: route limit reached`);
      } else {
        data.routes.push({ id: newId(), ...parsed.fields, createdAt: now, updatedAt: now });
        added++;
      }
    });

    if (added || updated) await saveRoutes(data);
    res.json({ ok: true, added, updated, skipped });
  } catch (e) {
    console.error("taxi: bulk failed:", e.message);
    res.status(500).json({ error: "Could not import the routes." });
  }
});

module.exports = router;
