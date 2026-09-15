/**
 * AdmireDworld Travel — AI Daily Blog module
 * -------------------------------------------
 * NEW FEATURE — does not touch any existing OTP/login code.
 * Mount this router in server.js with: app.use("/api/blog", require("./blog"));
 *
 * What it does
 * ------------
 * - Once a day, auto-writes a travel blog post (title + article + a
 *   matching cover image). Generation is "lazy": the first visitor of the
 *   day triggers it, so it works fine even on free hosting that sleeps —
 *   PLUS a background check every 30 minutes (see the bottom of this
 *   file) that writes today's post even if nobody visits, as long as the
 *   server process is awake.
 * - The cover image is a real travel photo from Pexels by default (falls
 *   back to a free AI-generated image if Pexels isn't configured or a
 *   search fails) — the search query is always scoped to travel/tourism,
 *   and the article prompt itself is instructed to stay strictly on
 *   travel/tourism topics, since this is a travel agency's blog.
 * - Admin can set tomorrow's topic ahead of time via POST /api/blog/set-topic.
 *   If nothing is set, the server picks the next topic itself from a
 *   rotating travel-topic list.
 * - Posts are saved to a local JSON file (blog-data.json) so they
 *   survive server restarts as long as the disk isn't wiped. For a
 *   real production deploy with guaranteed persistence, swap the two
 *   read/save functions at the bottom for a database call.
 * - Provider is swappable at any time from the Admin Dashboard
 *   (Settings → "AI Content Provider") — Pollinations (free), Gemini,
 *   or OpenAI, with the API key stored on the server and editable from
 *   there. No code change or redeploy needed to switch provider or
 *   rotate a key — see ai-provider.js / ai-settings.js.
 * - KEYWORD RESEARCH (new): before writing, the topic is expanded into
 *   the actual long-tail phrases people type into Google for it, using
 *   Google's own free autocomplete suggestion API (no key, no signup —
 *   see researchKeywords() below). 2-3 of those real search phrases are
 *   handed to the AI as "phrases to naturally work in", so the post
 *   matches real search intent instead of guessing keywords. A slug,
 *   SEO title, and meta description are also generated and saved with
 *   each post (extra fields only — nothing existing is removed), ready
 *   for whenever individual blog post pages are built on the frontend.
 * - ADMIN DELETE (new): admin can permanently delete a specific post via
 *   DELETE /api/blog/:id from the Admin Dashboard. Protected by
 *   ADMIN_KEY, same as every other admin endpoint in this project.
 *
 * Env vars used (all optional — see ai-provider.js for the AI provider/key,
 * which is normally managed from the Admin Dashboard instead):
 *   ADMIN_KEY            -> secret to protect the "set topic" / "delete" endpoints
 */

const express = require("express");
const fs = require("fs");
const path = require("path");
const rateLimit = require("express-rate-limit");
const { generateText, generateImageUrl } = require("./ai-provider");

const router = express.Router();

const DATA_FILE = path.join(__dirname, "blog-data.json");
const ADMIN_KEY = process.env.ADMIN_KEY || ""; // set this on Render for real admin protection

/* ---------- Fallback topic pool (used when no admin topic is queued) ---------- */
const TOPIC_POOL = [
  "Best time of year to visit Kashmir",
  "Budget travel tips for a Kerala backwaters trip",
  "Hidden offbeat destinations in Northeast India",
  "What to pack for a Ladakh road trip",
  "Bali vs Thailand — which beach holiday suits you",
  "First-timer's guide to visa-free destinations for Indians",
  "How to plan a Char Dham Yatra without the stress",
  "Top honeymoon destinations under budget",
  "Solo female travel safety tips for India trips",
  "Best hill stations near Delhi for a weekend trip",
  "How far in advance should you book a fixed departure tour",
  "Street food you must try in Bangkok",
  "A relaxed 5-day Goa itinerary for families",
  "Switzerland on a budget — is it possible",
  "Why Meghalaya's living root bridges are worth the trek",
  "Dubai desert safari — what actually happens on the tour",
  "Packing checklist for a Maldives overwater villa trip",
  "Best months to see Rajasthan without the peak-season crowds",
  "How to customize a trip itinerary that actually fits your budget",
  "Group tour vs customized trip — pros and cons",
];

/* ---------- Storage (simple JSON file) ---------- */
function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return { posts: [], nextTopic: null, topicCursor: 0 };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function todayKey() {
  // IST date, so "today" lines up with India-facing content
  const now = new Date();
  const ist = new Date(now.getTime() + (5.5 * 60 - now.getTimezoneOffset()) * 60000);
  return ist.toISOString().slice(0, 10); // YYYY-MM-DD
}

function pickAutoTopic(data) {
  const topic = TOPIC_POOL[data.topicCursor % TOPIC_POOL.length];
  data.topicCursor = (data.topicCursor + 1) % TOPIC_POOL.length;
  return topic;
}

/* ---------- Lightweight fact research (free, no API key, no extra signup) ----------
 * Before writing the article, look up the topic's core subject (usually a
 * place name, like "Kashmir" or "Bali") on Wikipedia's free public API and
 * pull a short, factual summary. That summary is handed to the AI as
 * "verified facts to use" so the post is grounded in something real instead
 * of the model just guessing — which matters for two reasons:
 *   1. Readers get an accurate, genuinely useful post instead of vague
 *      filler, so they're more likely to trust it and act on the
 *      "get a free custom itinerary" line at the end (more leads).
 *   2. AI answer engines (Google AI Overviews, ChatGPT, Perplexity, etc.)
 *      and Google's own ranking both favour accurate, source-backed content
 *      over generic AI filler — this is the single biggest lever for a
 *      daily AI-written blog to actually rank and get cited.
 * If the lookup fails for any reason, generation still proceeds exactly as
 * before — this is a pure best-effort addition, nothing else changes.
 */
async function researchTopic(topic) {
  try {
    const searchUrl =
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=` +
      `${encodeURIComponent(topic)}&format=json&srlimit=1&origin=*`;
    const searchResp = await fetch(searchUrl);
    const searchData = await searchResp.json();
    const title = searchData?.query?.search?.[0]?.title;
    if (!title) return null;

    const summaryResp = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
    );
    if (!summaryResp.ok) return null;
    const summaryData = await summaryResp.json();
    const extract = (summaryData?.extract || "").trim();
    if (!extract) return null;

    return {
      title,
      extract: extract.slice(0, 700),
      sourceUrl: summaryData?.content_urls?.desktop?.page || null,
    };
  } catch (err) {
    console.error("blog: research lookup failed (continuing without it):", err.message);
    return null;
  }
}

/* ---------- Keyword research (free, no API key) ----------
 * Uses Google's own public autocomplete endpoint to see what people
 * actually type when searching around this topic (real long-tail
 * search intent), instead of the AI guessing keywords on its own.
 * This is the same signal SEO tools charge for — Google is just giving
 * it back to us directly, for free, unauthenticated.
 * Best-effort: if it fails or is blocked on a given host, generation
 * proceeds exactly as before with no keyword block in the prompt.
 */
async function researchKeywords(topic) {
  const seeds = [topic, `${topic} tips`, `best ${topic}`, `${topic} itinerary`];
  const suggestions = new Set();

  for (const seed of seeds) {
    try {
      const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=in&q=${encodeURIComponent(
        seed
      )}`;
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const data = await resp.json();
      const list = Array.isArray(data?.[1]) ? data[1] : [];
      for (const s of list) {
        const clean = String(s || "").trim();
        // Skip near-duplicates of the seed itself and anything too short to be useful
        if (clean && clean.toLowerCase() !== seed.toLowerCase() && clean.length > 8) {
          suggestions.add(clean);
        }
      }
    } catch (err) {
      console.error(`blog: keyword research failed for "${seed}" (continuing without it):`, err.message);
    }
  }

  const relatedKeywords = Array.from(suggestions).slice(0, 8);
  return { primaryKeyword: topic, relatedKeywords };
}

/* ---------- Slug + meta helpers (for SEO — used on saved posts) ---------- */
function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function buildMetaDescription(content, topic) {
  const flat = String(content || "").replace(/\s+/g, " ").trim();
  if (!flat) return `Read our guide on ${topic} from AdmireDworld Travel.`;
  if (flat.length <= 155) return flat;
  const cut = flat.slice(0, 155);
  return cut.slice(0, cut.lastIndexOf(" ")) + "…";
}

/* ---------- AI provider ----------
 * generateText()/generateImageUrl() now live in ai-provider.js and are
 * shared with packages.js. The active provider + API key are stored in
 * ai-settings-data.json and editable any time from the Admin Dashboard
 * (Settings → "AI Content Provider") — no code change or redeploy
 * needed to switch provider or rotate a key. If the selected provider
 * ever fails (bad/expired key, quota, etc.), ai-provider.js
 * automatically falls back to the free Pollinations provider so the
 * daily blog is never blocked.
 */

/* ---------- Core: generate today's post if it doesn't exist yet ---------- */
async function ensureTodaysPost() {
  const data = loadData();
  const key = todayKey();

  const existing = data.posts.find((p) => p.date === key);
  if (existing) return existing;

  const topic = (data.nextTopic && data.nextTopic.trim()) || pickAutoTopic(data);
  data.nextTopic = null; // consumed

  // Keyword research first (what people actually search for), then facts, then writing.
  const keywordData = await researchKeywords(topic);
  const keywordBlock = keywordData.relatedKeywords.length
    ? `\n\nReal phrases people search for around this topic (from Google autocomplete): ` +
      `${keywordData.relatedKeywords.slice(0, 5).join(", ")}. Naturally work in 2-3 of the ` +
      `most relevant ones, in your own words — never force all of them in, and never make ` +
      `a sentence read like a keyword list.\n`
    : "";

  // Research first, write second — see researchTopic() above.
  const research = await researchTopic(topic);
  const researchBlock = research
    ? `\n\nHere are some verified, factual notes on the subject (from Wikipedia) — ` +
      `use only the parts genuinely relevant to "${topic}", rephrase everything in ` +
      `your own words, and do not copy any sentence as-is:\n"${research.extract}"\n`
    : "";

  const articlePrompt =
    `Write a warm, helpful travel blog post for an Indian travel agency called ` +
    `AdmireDworld Travel, about: "${topic}". Give it a catchy title on the first ` +
    `line, then 4-6 short paragraphs. Friendly, practical tone, no markdown symbols. ` +
    `Ground the post in specific, accurate details rather than vague generalities. ` +
    `Stay strictly on travel and tourism — destinations, itineraries, packing, ` +
    `visas, budgets, food, culture, best time to visit, etc. — and never drift into ` +
    `any unrelated subject, since this is a travel agency's blog. ` +
    `End the last paragraph with one natural, non-pushy line inviting the reader to ` +
    `get a free custom itinerary from AdmireDworld Travel for this kind of trip — ` +
    `written as genuine advice, not an ad slogan.` +
    keywordBlock +
    researchBlock;

  let raw = "";
  try {
    raw = await generateText(articlePrompt);
  } catch (err) {
    console.error("blog: text generation failed:", err.message);
  }

  let title = topic;
  let content = raw;
  if (raw) {
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      title = lines[0].replace(/^["#*\s]+|["#*\s]+$/g, "");
      content = lines.slice(1).join("\n\n");
    }
  }
  if (!content) {
    content = `We're putting today's story together — check back shortly for our take on "${topic}".`;
  }

  const post = {
    id: `${key}-${Math.random().toString(36).slice(2, 8)}`,
    date: key,
    topic,
    title,
    content,
    imageUrl: await generateImageUrl(topic), // FIX: was missing "await" — imageUrl was being saved
    // as an unresolved Promise object (serializes to "{}" in JSON), so the
    // frontend never got a real image URL for the blog cover photo.
    researchSourceUrl: research?.sourceUrl || null, // where the grounding facts came from, if any
    // --- SEO fields (new, additive) — used by generate-blog-pages.js to
    // give each post its own real, crawlable page at /blog/<slug>.html. ---
    slug: (() => {
      const base = slugify(title) || slugify(topic) || key;
      const existingSlugs = new Set(data.posts.map((p) => p.slug));
      if (!existingSlugs.has(base)) return base;
      let n = 2;
      while (existingSlugs.has(`${base}-${n}`)) n += 1;
      return `${base}-${n}`; // e.g. "kashmir-in-winter-2" if today's title slug repeats an older post
    })(),
    metaTitle: `${title} | AdmireDworld Travel Blog`.slice(0, 65),
    metaDescription: buildMetaDescription(content, topic),
    keywords: keywordData.relatedKeywords,
    createdAt: new Date().toISOString(),
  };

  data.posts.unshift(post);
  data.posts = data.posts.slice(0, 60); // keep last 60 days
  saveData(data);
  return post;
}

/* ---------- Rate limiting for the admin endpoints ---------- */
const setTopicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const deletePostLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

/* ---------- Shared admin-key check ---------- */
function isAdminAuthed(req) {
  const key = req.headers["x-admin-key"] || req.query.adminKey || req.body?.adminKey;
  if (!ADMIN_KEY) return true; // no key configured on the server -> admin routes are open (matches existing behaviour)
  return key === ADMIN_KEY;
}

/* ---------- Routes ---------- */

// Public: today's post (auto-generates on first hit of the day)
router.get("/latest", async (req, res) => {
  try {
    const post = await ensureTodaysPost();
    res.json({ ok: true, post });
  } catch (err) {
    console.error("blog latest error:", err);
    res.status(500).json({ error: "Could not load today's blog post." });
  }
});

// Public: recent posts list
router.get("/list", (req, res) => {
  const data = loadData();
  res.json({ ok: true, posts: data.posts.slice(0, 30) });
});

// Admin: export ALL saved posts as plain JSON.
// Added so a separate frontend repo's CI (GitHub Action) can fetch
// today's post data over HTTP and build the static /blog/<slug>.html pages,
// without needing filesystem access to this server's blog-data.json.
// Protected by ADMIN_KEY, same as every other admin endpoint in this project.
// NOTE: this must be defined BEFORE the "/:id" route below, otherwise
// Express would try to treat "admin" as an :id value.
router.get("/admin/export", (req, res) => {
  if (!isAdminAuthed(req)) {
    return res.status(401).json({ error: "Invalid admin key." });
  }
  const data = loadData();
  res.json({ ok: true, posts: data.posts });
});

// Admin: queue a topic for the NEXT auto-generated post.
// Protected by ADMIN_KEY (set this env var on your host).
router.post("/set-topic", setTopicLimiter, (req, res) => {
  const { topic } = req.body || {};
  if (!isAdminAuthed(req)) {
    return res.status(401).json({ error: "Invalid admin key." });
  }
  if (!topic || !topic.trim()) {
    return res.status(400).json({ error: "Please provide a topic." });
  }
  const data = loadData();
  data.nextTopic = topic.trim();
  saveData(data);
  res.json({ ok: true, queuedTopic: data.nextTopic });
});

// Admin: permanently delete a specific post by id.
// Protected by ADMIN_KEY, same pattern as every other admin endpoint here.
// Matches what the Admin Dashboard's "Delete" button on the blog list calls.
router.delete("/:id", deletePostLimiter, (req, res) => {
  if (!isAdminAuthed(req)) {
    return res.status(401).json({ error: "Invalid admin key." });
  }
  const { id } = req.params;
  const data = loadData();
  const idx = data.posts.findIndex((p) => String(p.id) === String(id));
  if (idx === -1) {
    return res.status(404).json({ error: "Post not found." });
  }
  const [removed] = data.posts.splice(idx, 1);
  saveData(data);
  res.json({ ok: true, deletedId: removed.id });
});

// Public: single post by id.
// NOTE: kept LAST among the "/:id"-shaped routes so it never intercepts
// "/admin/export", "/list", or "/latest" above.
router.get("/:id", (req, res) => {
  const data = loadData();
  const post = data.posts.find((p) => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: "Post not found." });
  res.json({ ok: true, post });
});

module.exports = router;
module.exports.loadData = loadData; // used by generate-blog-pages.js to build static /blog/<slug>.html pages

/* ---------- Keep the blog reliably daily, even on a quiet day ----------
 * Before this, ensureTodaysPost() only ran when a visitor actually opened
 * the blog tab (GET /api/blog/latest) — so on a day with zero visitors,
 * no post got written at all. As long as this server process is awake,
 * this checks every 30 minutes and writes today's post the moment it's
 * missing, so the blog publishes daily regardless of traffic. This is a
 * belt-and-braces addition on top of the existing visitor-triggered path,
 * not a replacement — the very first visitor of the day still gets an
 * instant post exactly as before, and this doesn't help on a free host
 * that's fully asleep (nothing runs at all while asleep), only once the
 * process is running.
 */
setInterval(() => {
  ensureTodaysPost().catch((err) => console.error("blog: scheduled generation failed:", err.message));
}, 30 * 60 * 1000).unref();

// Also try once shortly after every server start/restart, in case it
// happens mid-day and no visitor has hit the blog tab yet.
setTimeout(() => {
  ensureTodaysPost().catch((err) => console.error("blog: startup generation failed:", err.message));
}, 15 * 1000).unref();
