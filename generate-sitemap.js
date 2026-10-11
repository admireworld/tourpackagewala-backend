#!/usr/bin/env node
/**
 * generate-sitemap.js
 * ---------------------------------------------------------------
 * Regenerates sitemap.xml from LIVE package data on the backend, so the
 * package URLs always match whatever is actually in the India/International
 * grids (including packages added later from the Admin dashboard) — instead
 * of the hand-written list that ships in this zip as a starting point.
 *
 * Run it locally whenever packages change, or wire it into your deploy step
 * (e.g. a `postbuild` / pre-deploy script) so sitemap.xml never goes stale:
 *
 *   node generate-sitemap.js
 *
 * It needs Node 18+ (for built-in fetch). No npm install required.
 */

const fs = require("fs");
const path = require("path");

const API_BASE_URL = "https://tourpackagewala-backend.onrender.com";
const SITE_ORIGIN = "https://www.tourpackagewala.in";
const OUTPUT_PATH = path.join(__dirname, "sitemap.xml");

// Keep this in sync with slugify()/pkgDetailPath() in script.js.
function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "package";
}

function pkgUrl(type, p) {
  return `${SITE_ORIGIN}/package/${type}/${slugify(p.name)}--${p.id}`;
}

async function fetchPackages(endpoint) {
  const res = await fetch(`${API_BASE_URL}/api/packages/${endpoint}`);
  if (!res.ok) throw new Error(`${endpoint}: HTTP ${res.status}`);
  const data = await res.json();
  return data.packages || [];
}

function urlEntry(loc, { changefreq = "weekly", priority = "0.8" } = {}) {
  return `  <url><loc>${loc}</loc><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
}

// Taxi Service — one URL per route (/taxi-fare/<from>-to-<to>), straight from the backend.
async function fetchTaxiRoutes() {
  const res = await fetch(`${API_BASE_URL}/api/taxi/routes`);
  if (!res.ok) throw new Error(`taxi: HTTP ${res.status}`);
  const data = await res.json();
  return data.routes || [];
}

async function main() {
  const [indiaPackages, intlPackages] = await Promise.all([
    fetchPackages("india").catch((err) => { console.error("Could not fetch India packages:", err.message); return []; }),
    fetchPackages("international").catch((err) => { console.error("Could not fetch International packages:", err.message); return []; }),
  ]);

  const taxiRoutes = await fetchTaxiRoutes().catch((err) => { console.error("Could not fetch taxi routes:", err.message); return []; });
  const taxiEntries = taxiRoutes.map((r) => urlEntry(`${SITE_ORIGIN}/taxi-fare/${r.slug}`, { changefreq: "weekly", priority: "0.7" }));

  const staticEntries = [
    urlEntry(`${SITE_ORIGIN}/`, { changefreq: "daily", priority: "1.0" }),
    urlEntry(`${SITE_ORIGIN}/taxi-fare-calculator`, { changefreq: "weekly", priority: "0.8" }),
    urlEntry(`${SITE_ORIGIN}/policies.html`, { changefreq: "yearly", priority: "0.3" }),
  ];

  const indiaEntries = indiaPackages.map((p) => urlEntry(pkgUrl("india", p)));
  const intlEntries = intlPackages.map((p) => urlEntry(pkgUrl("international", p)));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticEntries.join("\n")}

  <!-- India packages (/package/india/<slug>--<id>) -->
${indiaEntries.join("\n") || "  <!-- none returned by the backend -->"}

  <!-- International packages (/package/international/<slug>--<id>) -->
${intlEntries.join("\n") || "  <!-- none returned by the backend -->"}

  <!-- Taxi fare routes (/taxi-fare/<from>-to-<to>) -->
${taxiEntries.join("\n") || "  <!-- none returned by the backend -->"}
</urlset>
`;

  fs.writeFileSync(OUTPUT_PATH, xml);
  console.log(`Wrote ${OUTPUT_PATH} with ${indiaEntries.length} India + ${intlEntries.length} International package URLs + ${taxiEntries.length} taxi route URLs.`);
}

main().catch((err) => {
  console.error("Failed to generate sitemap:", err);
  process.exit(1);
});
