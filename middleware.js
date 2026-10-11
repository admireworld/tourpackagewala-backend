/**
 * AdmireDworld Travel — Dynamic SEO for package detail pages (Vercel Routing/Edge Middleware)
 * ---------------------------------------------------------------------------------------------
 * NEW FILE — does not touch vercel.json or any backend file. Vercel auto-detects a
 * `middleware.js` at the project root; nothing else needs to be wired up.
 *
 * WHY THIS FILE EXISTS
 * ---------------------
 * script.js already builds a full package detail view (name, destination, duration, price,
 * description, day-wise itinerary, hotel info, inclusions, exclusions — see pkgDetailHTML(),
 * pkgSeoTitle() / pkgSeoDescription() / setPageSEO() around the "PACKAGE DETAIL PAGE" section)
 * and renders it client-side once a visitor opens a package. That's great for real visitors,
 * but it means the RAW HTML response for e.g. /package/india/kashmir-valley-escape--in1 starts
 * out with an EMPTY detail container and the generic homepage <title>/description, only filled
 * in after JavaScript runs AND the package fetch resolves. Any crawler/bot that doesn't run JS
 * (or times out before that fetch completes — the Render free-tier backend can cold-start)
 * would see none of the actual package content, which is the exact problem this file fixes.
 *
 * WHAT THIS DOES
 * ---------------
 * For every request to /package/india/<slug>--<id> or /package/international/<slug>--<id>
 * (same URL shape already used across the project — see generate-sitemap.js's pkgUrl() and
 * script.js's pkgDetailPath()/parsePkgDetailPath() — URLs are completely unchanged):
 *   1. Extracts the package id from the URL the same way script.js already does.
 *   2. Fetches that ONE package from the existing backend endpoint the frontend already calls
 *      (GET /api/packages/:type/:id) — no new backend route, no backend change at all.
 *   3. Builds:
 *        - <title> / meta description (same formula as script.js's pkgSeoTitle()/pkgSeoDescription())
 *        - a real, single <h1> + all the required on-page package content (destination, duration,
 *          price, description, day-wise itinerary, hotel info, inclusions, exclusions), using the
 *          SAME field names / structure / CSS classes as pkgDetailHTML() in script.js, so it's
 *          visually identical to what JS renders a moment later — no layout shift, no duplicate
 *          text once script.js takes over.
 *        - a per-package FAQ section (buildPkgFaqHTML(), plain <h2>/<h3>/<p>, never hidden behind
 *          JS) plus matching FAQPage JSON-LD (buildPkgFaqSchema()), generated ONLY from this
 *          package's own data — mirrors pkgFaqData()/pkgFaqHTML()/pkgFaqSchemaJSON() in script.js.
 *   4. Fetches the project's own static index.html, demotes every PRE-EXISTING <h1> on the page
 *      (the homepage/tab hero headings) to <h2> for this ONE response only — so the crawled page
 *      has exactly one relevant H1 (the package's), never zero, never many. This never touches
 *      the actual index.html file or what a normal "/" visit renders; it only ever happens in the
 *      HTML bytes generated for this one /package/... request/response, and every demoted heading
 *      is part of an inactive tab section that isn't even visible on a package page anyway (it's
 *      either display:none or sitting behind the package detail overlay), so nothing looks any
 *      different — this is a semantic-only, per-request fix. The site's actual homepage and its
 *      headings are completely untouched.
 *   5. Fills the existing (until now always-empty) #pkgDetailContent container with that content,
 *      and swaps the <title id="pageTitleTag"> / <meta id="metaDescriptionTag"> tags — everything
 *      else in the file is byte-for-byte the same index.html already being served.
 *
 * Keeping this in sync with script.js: if you ever change pkgDetailHTML()/pkgSeoTitle()/
 * pkgSeoDescription() in script.js, mirror the wording/structure change in buildTitle()/
 * buildDescription()/buildPkgDetailContent() below so the pre-render and the client-rendered
 * version never disagree. Same rule for the FAQ: pkgFaqData()/pkgFaqHTML()/pkgFaqSchemaJSON()
 * in script.js must stay word-for-word in sync with buildPkgFaqData()/buildPkgFaqHTML()/
 * buildPkgFaqSchema() below.
 *
 * Since the id/name/duration/price/itinerary always come straight from the live package record
 * (seed, weekly AI auto-added, or manually added from the admin dashboard), a brand-new package
 * gets correct, unique, fully-crawlable content automatically the moment its detail page is
 * requested — nothing to hardcode or update by hand.
 *
 * FAILURE BEHAVIOUR (never breaks the site)
 * -------------------------------------------
 * If the backend is unreachable, cold-starting, slow, or returns anything unexpected, this
 * middleware gives up quickly (short timeout) and falls through to the normal static index.html
 * exactly as before this file existed — the page still loads and script.js's own client-side
 * rendering still runs as it always has. Nothing here can 404 or blank-page the site.
 */

export const config = {
  matcher: "/package/:path*",
};

const API_BASE_URL = "https://tourpackagewala-backend.onrender.com";
const BACKEND_TIMEOUT_MS = 3500; // fail fast — Render free-tier cold starts shouldn't hang the page

// Same regex/parsing rule as parsePkgDetailPath() in script.js.
const PKG_PATH_RE = /^\/package\/(india|international)\/([a-z0-9-]+)$/;

function extractId(rest) {
  const sepIdx = rest.lastIndexOf("--");
  return sepIdx === -1 ? rest : rest.slice(sepIdx + 2);
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN");
}

// Mirrors pkgSeoTitle() in script.js exactly (the <title> tag / SERP text).
function buildTitle(p, typeLabel) {
  return `${p.name} — ${p.tag || ""} ${typeLabel} Package | AdmireDworld Travel`.replace(/\s+/g, " ").trim();
}

// Mirrors pkgSeoDescription() in script.js exactly (the meta description).
function buildDescription(p) {
  const hotelBit = p.hotelName ? `Stay at ${p.hotelName}` : `${p.hotelCategory || "Quality"} hotel`;
  return `${p.desc ? p.desc + " " : ""}${p.tag || ""} itinerary for ${p.loc} — day-wise plan, ${hotelBit}, inclusions & exclusions. Book with AdmireDworld Travel.`
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------------------------------------------------------------------
 * Related (same-destination) packages — internal linking, pre-rendered
 * for crawlers. Mirrors isKashmirPackage()/relatedAnchorText()/
 * getRelatedPackages()/relatedPackagesHTML() in script.js EXACTLY (same
 * matching rule, same markup), so a bot that never runs script.js still
 * sees the same "Related Kashmir Tour Packages" section and real links
 * a JS-enabled visitor sees a moment later. If you change one, change
 * the other. Every link is built from a package actually returned by
 * GET /api/packages/india moments earlier in this same request — never
 * a hardcoded id/name/URL.
 * ------------------------------------------------------------------- */
// Mirrors slugify() in script.js exactly.
function slugify(str) {
  return String(str || "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "package";
}
// Mirrors pkgDetailPath() in script.js exactly.
function pkgPath(type, p) {
  return `/package/${type}/${slugify(p.name)}--${p.id}`;
}
// Mirrors isKashmirPackage() in script.js exactly.
function isKashmirPackage(p) {
  const hay = `${p.name || ""} ${p.destination || ""} ${p.loc || ""}`.toLowerCase();
  return hay.includes("kashmir");
}
// Mirrors relatedAnchorText() in script.js exactly.
function relatedAnchorText(p) {
  return p.name || "Kashmir Tour Package";
}
// Mirrors relatedPackagesHTML() in script.js exactly (given the same
// already-fetched India packages list instead of reading pkgDetailStore).
function buildRelatedPackagesHTML(current, allIndiaPackages) {
  if (!isKashmirPackage(current)) return "";
  const related = (allIndiaPackages || []).filter(p => p.id !== current.id && isKashmirPackage(p));
  if (!related.length) return "";
  return `
    <section class="pkg-related-section" aria-labelledby="pkgRelatedHeading">
      <h2 id="pkgRelatedHeading">Related Kashmir Tour Packages</h2>
      <div class="pkg-related-grid">
        ${related.map(p => `
          <a class="pkg-related-link" href="${pkgPath("india", p)}">
            <span class="pkg-related-name">${escapeHtml(relatedAnchorText(p))}</span>
            <span class="pkg-related-loc">${escapeHtml(p.loc || p.destination || "")}</span>
          </a>`).join("")}
      </div>
    </section>
  `;
}

// Mirrors pkgDetailHTML() in script.js — same classes/structure, so this is visually
// identical to what script.js renders a moment later. The ONLY <h1> on the page for this
// request lives here (matches the required "Package Name – Duration" example exactly).
function buildPkgDetailContent(p, relatedHTML) {
  const hasDiscount = p.discountPrice && p.discountPrice < p.price;
  const dayWise = Array.isArray(p.dayWise) ? p.dayWise : [];
  const inclusions = Array.isArray(p.inclusions) ? p.inclusions : [];
  const exclusions = Array.isArray(p.exclusions) ? p.exclusions : [];
  const name = escapeHtml(p.name);
  const tag = escapeHtml(p.tag || "");
  const loc = escapeHtml(p.loc || p.destination || "");
  const desc = escapeHtml(p.desc || "");
  const hotelCategory = escapeHtml(p.hotelCategory || "3-star");
  const hotelName = p.hotelName ? escapeHtml(p.hotelName) : "";

  return `
    <div class="pkg-detail-hero">
      <div class="pkg-detail-head">
        <div>
          <h1>${name}${tag ? ` – ${tag}` : ""}</h1>
          <p class="pkg-loc">Destination: ${loc}</p>
          <div class="pkg-detail-chips">
            ${tag ? `<span class="pkg-detail-chip">Duration: ${tag}</span>` : ""}
            <span class="pkg-detail-chip">🏨 Hotel category: ${hotelCategory}</span>
            ${hotelName ? `<span class="pkg-detail-chip">🏩 ${hotelName}</span>` : ""}
          </div>
        </div>
      </div>
      <div class="pkg-detail-price">
        ${hasDiscount ? `<span class="old">${money(p.price)}</span>` : ""}
        <span class="new">${money(hasDiscount ? p.discountPrice : p.price)}</span>
        <span class="pkg-detail-price-unit">per person</span>
      </div>
    </div>
    <div class="pkg-detail-card">
    <p>${desc}</p>
    <h2>Day-wise itinerary</h2>
    ${dayWise.length ? `
      ${dayWise.map(d => `
        <div class="pkg-day-row">
          <span class="pd-num">Day ${escapeHtml(d.day)}</span>
          <div><strong>${escapeHtml(d.title)}</strong><p style="margin:2px 0 0;">${escapeHtml(d.desc || "")}</p></div>
        </div>`).join("")}
    ` : `<p style="color:var(--ink-soft);">Detailed day-wise plan will be shared once your dates are confirmed.</p>`}
    <div class="pkg-inc-exc">
      <div><h3>Inclusions</h3><ul>${inclusions.map(i => `<li>${escapeHtml(i)}</li>`).join("") || "<li>—</li>"}</ul></div>
      <div><h3>Exclusions</h3><ul>${exclusions.map(i => `<li>${escapeHtml(i)}</li>`).join("") || "<li>—</li>"}</ul></div>
    </div>
    <button class="btn-primary btn-block" style="margin-top:20px;" data-pkg-enquire="${escapeHtml(p.id)}">Book Now</button>
    </div>
    ${relatedHTML || ""}
    ${buildPkgFaqHTML(p)}
  `;
}

/* ---------------------------------------------------------------------
 * Package-page FAQ (AEO) — mirrors pkgFaqData()/pkgFaqHTML()/
 * pkgFaqSchemaJSON() in script.js EXACTLY (same questions, same wording),
 * so the visible FAQ text a crawler sees in this pre-rendered response is
 * identical to what a real visitor sees once script.js takes over a
 * moment later. If you change one, change the other.
 *
 * Every answer is built only from THIS package's own record (tag/loc/
 * price/inclusions/hotelCategory/cat/etc.) or phrased as general,
 * non-destination-specific seasonal guidance with a caveat to confirm
 * with the travel team — never invented, package-specific facts.
 * ------------------------------------------------------------------- */
const PKG_FAQ_BEST_TIME_BY_CAT = {
  hills: (d) => `Hill destinations like ${d} are generally most pleasant between March–June and September–November; the monsoon months (July–August) can bring heavy rain and landslide risk in mountain areas.`,
  offbeat: (d) => `${d} is generally best visited between October and April, avoiding the monsoon months (June–September).`,
  heritage: (d) => `${d} is generally best visited between October and March, avoiding the peak summer heat (April–June).`,
  beach: (d) => `Beach destinations like ${d} are usually best visited between October and March, when the weather is cooler and drier; the monsoon (June–September) is best avoided.`,
  city: (d) => `${d} is largely a year-round destination; many travellers prefer the cooler months for outdoor sightseeing.`,
  scenic: (d) => `${d} is popular in summer (May–September) for greenery and outdoor activities, and in winter (December–February) for snow and winter-sport itineraries.`,
  honeymoon: (d) => `${d} is generally driest and most pleasant from November to April.`,
};

function buildPkgFaqData(p) {
  const name = p.name || "This package";
  const places = String(p.loc || "").split("·").map((s) => s.trim()).filter(Boolean);
  const destLabel = places[0] || String(p.destination || "").split(",")[0].trim() || name;
  const placesText = places.length ? places.join(", ") : (p.destination || destLabel);

  const durMatch = /(\d+)\s*D\s*\/?\s*(\d+)\s*N/i.exec(p.tag || "");
  const durationText = durMatch ? `${durMatch[1]} days and ${durMatch[2]} nights` : (p.tag || "a few days");

  const hasDiscount = p.discountPrice && p.discountPrice < p.price;
  const priceNow = hasDiscount ? p.discountPrice : p.price;
  const priceText = priceNow
    ? `${money(priceNow)} per person${hasDiscount ? ` (discounted from ${money(p.price)})` : ""}`
    : "available on request — contact our travel team for a quote";

  const inclusions = Array.isArray(p.inclusions) ? p.inclusions : [];
  const inclusionsText = inclusions.length
    ? inclusions.join(", ")
    : "hotel stay, breakfast and transfers as per the itinerary";

  const hasHotelInInclusions = inclusions.some((i) => /hotel|stay|houseboat|resort|villa/i.test(i));
  const hotelBit = p.hotelName
    ? `at ${p.hotelName} (${p.hotelCategory || "quality"} category)`
    : `in a ${p.hotelCategory || "3-star"} category hotel`;
  const hotelAnswer = (hasHotelInInclusions || p.hotelCategory || p.hotelName)
    ? `Yes, accommodation is included, ${hotelBit}, for the full duration of the trip. The exact hotel/houseboat may vary based on availability at the time of travel.`
    : `Please check with our travel team — accommodation details for this package are confirmed at the time of booking.`;

  const hasTransferInInclusions = inclusions.some((i) => /transfer|cab|transport|pickup|drop/i.test(i));
  const transportAnswer = hasTransferInInclusions
    ? `Yes, airport/station transfers and sightseeing transport by private cab are included, as listed in this package's inclusions.`
    : `Local transfers are not listed in this package's inclusions — please confirm transport arrangements with our travel team before booking.`;

  const isHoneymoon = p.cat === "honeymoon"
    || /honeymoon/i.test(p.tag || "")
    || /honeymoon|romantic/i.test(p.desc || "")
    || /honeymoon/i.test(p.name || "");
  const honeymoonAnswer = isHoneymoon
    ? `Yes, ${name} is designed as a honeymoon-friendly itinerary, with a pace and set of experiences well suited to couples. Let our team know it's a honeymoon trip and we'll arrange romantic touches like a candlelight dinner or room upgrade where available.`
    : `${name} is a general holiday itinerary rather than a dedicated honeymoon package, but it can be customized for couples — mention it's a honeymoon trip while enquiring and we'll suggest romantic add-ons and room upgrades where available.`;

  const bestTimeFn = PKG_FAQ_BEST_TIME_BY_CAT[p.cat];
  const bestTimeAnswer = (bestTimeFn ? bestTimeFn(destLabel) : `The best time to visit ${destLabel} varies by season.`)
    + ` Speak to our travel team for a month-wise recommendation based on your exact travel dates.`;

  return [
    { q: `What is included in the ${name} package?`, a: `This package includes: ${inclusionsText}.` },
    { q: `How many days do I need for the ${destLabel} trip?`, a: `${name} is a ${durationText} itinerary${places.length ? ` covering ${placesText}` : ""}.` },
    { q: `Which places are covered in the ${name} package?`, a: places.length ? `This package covers ${placesText}.` : `This package covers ${p.destination || destLabel}.` },
    { q: `What is the price of the ${name} package?`, a: `The ${name} package is priced at ${priceText}. Final pricing may vary based on travel dates, number of travellers and any customization.` },
    { q: `What is the best time to visit ${destLabel}?`, a: bestTimeAnswer },
    { q: `Is hotel accommodation included in this package?`, a: hotelAnswer },
    { q: `Is transportation included in this package?`, a: transportAnswer },
    { q: `Is the ${name} package suitable for a honeymoon?`, a: honeymoonAnswer },
  ];
}

// Plain, always-visible <h2>/<h3>/<p> markup, byte-identical in structure
// to pkgFaqHTML() in script.js — this is what makes the FAQ crawlable by
// bots that never run JavaScript at all (most AI/answer-engine crawlers).
function buildPkgFaqHTML(p) {
  const faqs = buildPkgFaqData(p);
  return `
    <section class="pkg-faq-section" aria-labelledby="pkgFaqHeading">
      <h2 id="pkgFaqHeading">Frequently Asked Questions</h2>
      ${faqs.map((f) => `
        <div class="pkg-faq-item">
          <h3>${escapeHtml(f.q)}</h3>
          <p>${escapeHtml(f.a)}</p>
        </div>`).join("")}
    </section>
  `;
}

// Same questions/answers as buildPkgFaqHTML() above, as FAQPage JSON-LD —
// mirrors pkgFaqSchemaJSON() in script.js so the schema never claims
// content that isn't the actual visible text on the page.
function buildPkgFaqSchema(p) {
  const faqs = buildPkgFaqData(p);
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map((f) => ({
      "@type": "Question",
      "name": f.q,
      "acceptedAnswer": { "@type": "Answer", "text": f.a },
    })),
  });
}

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const match = PKG_PATH_RE.exec(url.pathname);
  if (!match) return; // not a package detail URL — let Vercel serve the site exactly as before

  const [, type, rest] = match;
  const id = extractId(rest);
  if (!id) return;

  let pkg = null;
  let title = null;
  let description = null;

  try {
    const apiRes = await fetchWithTimeout(`${API_BASE_URL}/api/packages/${type}/${id}`, BACKEND_TIMEOUT_MS);
    if (apiRes.ok) {
      const data = await apiRes.json();
      const p = data && data.package;
      if (p && p.name) {
        pkg = p;
        const typeLabel = type === "india" ? "India" : "International";
        title = buildTitle(p, typeLabel);
        description = buildDescription(p);
      }
    }
  } catch {
    // Backend unreachable / cold-start timeout / bad JSON — fall through below,
    // the page still loads exactly as it did before this file existed.
  }

  if (!pkg || !title || !description) return; // nothing to inject — serve the normal static page

  // Related Kashmir packages (see buildRelatedPackagesHTML() above) — only
  // worth a second backend call when this page IS a Kashmir package. Same
  // fail-quiet behaviour as the fetch above: if this call is slow/unreachable,
  // the section is just omitted, never blocks or breaks the page.
  let relatedHTML = "";
  if (type === "india" && isKashmirPackage(pkg)) {
    try {
      const listRes = await fetchWithTimeout(`${API_BASE_URL}/api/packages/india`, BACKEND_TIMEOUT_MS);
      if (listRes.ok) {
        const listData = await listRes.json();
        relatedHTML = buildRelatedPackagesHTML(pkg, listData && listData.packages);
      }
    } catch {
      // leave relatedHTML empty — falls through to no related section
    }
  }

  let html;
  try {
    const pageRes = await fetch(new URL("/index.html", url.origin));
    if (!pageRes.ok) return;
    html = await pageRes.text();
  } catch {
    return; // couldn't fetch the shell — fall back to default routing rather than error out
  }

  // 1) Title + meta description.
  html = html.replace(
    /<title id="pageTitleTag">[\s\S]*?<\/title>/,
    `<title id="pageTitleTag">${escapeHtml(title)}</title>`
  );
  html = html.replace(
    /(<meta id="metaDescriptionTag"[^>]*content=")[^"]*(")/,
    `$1${escapeHtml(description)}$2`
  );

  // 2) Demote every pre-existing <h1> (homepage/tab hero headings) to <h2> for THIS response
  // only, so the package's own <h1> below is the one and only H1 a crawler sees on this URL.
  // These headings belong to inactive tab sections not shown on a package page anyway, so this
  // has no visible effect for a real visitor — purely a semantic fix, scoped to this response.
  html = html.replace(/<h1(\s[^>]*)?>/g, "<h2$1>").replace(/<\/h1>/g, "</h2>");

  // 3) Fill the (previously always-empty) package detail container with the real content
  // (day-wise itinerary, hotel, inclusions/exclusions — buildPkgDetailContent() now also
  // appends the package's own FAQ section, see buildPkgFaqHTML() above).
  html = html.replace(
    '<div class="pkg-detail-body" id="pkgDetailContent"></div>',
    `<div class="pkg-detail-body" id="pkgDetailContent">${buildPkgDetailContent(pkg, relatedHTML)}</div>`
  );

  // 4) Populate the FAQPage JSON-LD placeholder (index.html ships it as
  // "null" so it's a no-op on every other page) with THIS package's own
  // FAQ schema — same questions/answers as the visible section above, so
  // structured data never claims content beyond what's on the page.
  html = html.replace(
    /<script type="application\/ld\+json" id="pkgFaqSchemaTag">[\s\S]*?<\/script>/,
    `<script type="application/ld+json" id="pkgFaqSchemaTag">${buildPkgFaqSchema(pkg)}</script>`
  );

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
