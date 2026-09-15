/**
 * AdmireDworld Travel — Real Google Reviews
 * ------------------------------------------------
 * Fetches real reviews from this business's Google Business Profile
 * (via the Google Places API "Place Details" endpoint) and caches them
 * in memory so the homepage doesn't hit Google on every page load
 * (Google Places API is metered/billed per request).
 *
 * Env vars needed (add these in Render → Environment):
 *   GOOGLE_PLACES_API_KEY   -> your Places API key
 *   GOOGLE_PLACE_ID         -> the Place ID for THIS business
 *                              (find it: https://developers.google.com/maps/documentation/places/web-service/place-id
 *                               search your business name there, copy the Place ID)
 *
 * Route:
 *   GET /api/reviews          -> returns cached (or freshly fetched) reviews
 *   GET /api/reviews?refresh=1 -> forces a fresh fetch from Google (admin/debug use)
 *
 * Notes:
 *   - Requires Node 18+ on Render (for global fetch). Render's default
 *     Node runtime already has this, so nothing extra to install.
 *   - If GOOGLE_PLACES_API_KEY / GOOGLE_PLACE_ID are missing, or the
 *     Google call fails for any reason, this route returns whatever is
 *     in cache, or an empty-but-valid response — it NEVER throws and
 *     NEVER crashes the server, so a bad/blank API key just means no
 *     reviews show up, not a broken site.
 */

const express = require("express");
const router = express.Router();

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — plenty fresh, keeps API cost near-zero

let cache = {
  data: null, // { rating, userRatingCount, reviews: [...] }
  fetchedAt: 0,
  lastError: null,
};

async function fetchFromGoogle() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;

  if (!apiKey || !placeId) {
    throw new Error(
      "GOOGLE_PLACES_API_KEY and/or GOOGLE_PLACE_ID are not set in Render Environment Variables."
    );
  }

  // New Places API (Place Details) — field mask keeps the request cheap
  // by only asking Google for the fields we actually use.
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "rating,userRatingCount,reviews,displayName,googleMapsUri",
    },
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const reason =
      (body && body.error && body.error.message) ||
      `Google Places API returned HTTP ${response.status}`;
    throw new Error(reason);
  }

  const reviews = Array.isArray(body.reviews)
    ? body.reviews.map((r) => ({
        authorName: (r.authorAttribution && r.authorAttribution.displayName) || "Google user",
        authorPhoto: (r.authorAttribution && r.authorAttribution.photoUri) || null,
        rating: r.rating || null,
        text: (r.text && r.text.text) || (r.originalText && r.originalText.text) || "",
        relativeTime: r.relativePublishTimeDescription || "",
        publishTime: r.publishTime || null,
      }))
    : [];

  return {
    businessName: body.displayName ? body.displayName.text : null,
    googleMapsUri: body.googleMapsUri || null,
    rating: typeof body.rating === "number" ? body.rating : null,
    userRatingCount: typeof body.userRatingCount === "number" ? body.userRatingCount : null,
    reviews,
  };
}

async function getReviews(forceRefresh) {
  const isStale = Date.now() - cache.fetchedAt > CACHE_TTL_MS;

  if (!forceRefresh && cache.data && !isStale) {
    return { data: cache.data, fromCache: true, error: null };
  }

  try {
    const fresh = await fetchFromGoogle();
    cache = { data: fresh, fetchedAt: Date.now(), lastError: null };
    return { data: fresh, fromCache: false, error: null };
  } catch (err) {
    console.error("reviews.js — Google Places fetch failed:", err.message);
    cache.lastError = err.message;

    // Serve stale cache if we have it, so a temporary Google hiccup
    // doesn't blank out the homepage testimonials.
    if (cache.data) {
      return { data: cache.data, fromCache: true, error: err.message };
    }

    // No cache at all yet (e.g. fresh deploy, bad key) — return an
    // empty-but-valid shape instead of throwing, so the frontend can
    // just render "no reviews yet" instead of breaking.
    return {
      data: { businessName: null, googleMapsUri: null, rating: null, userRatingCount: null, reviews: [] },
      fromCache: false,
      error: err.message,
    };
  }
}

router.get("/", async (req, res) => {
  const forceRefresh = req.query.refresh === "1";
  const { data, fromCache, error } = await getReviews(forceRefresh);

  res.json({
    ok: true,
    fromCache,
    ...(error ? { warning: error } : {}),
    ...data,
  });
});

module.exports = router;
