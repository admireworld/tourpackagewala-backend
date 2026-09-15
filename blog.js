/**
 * AdmireDworld Travel — AI Daily Blog module
 * -------------------------------------------
 * CHANGED (persistence fix): this used to store posts in a local
 * blog-data.json file. On Render's free tier, the disk is wiped on every
 * restart/redeploy/sleep-wake cycle, so posts were silently disappearing
 * (e.g. a Bali post vanishing the day a Kashmir post was generated) — it
 * wasn't an overwrite bug, the whole file was just gone.
 * Now uses the shared store.js (MongoDB-first, local-file fallback) —
 * the exact same pattern already used by bookings.js/leads.js/refer.js/
 * wedding.js — so posts survive restarts once MONGODB_URI is set, with
 * zero new dependencies.
 *
 * CHANGED (quality/SEO fix): two related problems showed up together —
 * a day where every AI text provider failed (Gemini rate-limited/retired
 * model, Pollinations over budget) resulted in a placeholder post
 * ("We're putting today's story together...") that STILL showed a
 * "Source: en.wikipedia.org/..." link underneath it, as if a real,
 * researched article was backing that placeholder. That's misleading to
 * readers and looks like thin/low-quality content to search engines.
 * Fixed two ways:
 *   1) researchSourceUrl is now only ever attached when real AI-written
 *      content was actually produced (raw is non-empty) — never on a
 *      placeholder.
 *   2) A placeholder is no longer saved as "today's post" at all. Instead
 *      it's returned just for that one request, so the next visitor or
 *      the next 30-minute retry tries generation again — meaning a
 *      transient provider failure no longer locks in a low-quality post
 *      for the rest of the day.
 *
 * Mount this router in server.js with: app.use("/api/blog", require("./blog"));
 */

const express = require("express");
const rateLimit = require("express-rate-limit");
const store = require("./store");
const { generateText, generateImageUrl } = require("./ai-provider");

const router = express.Router();

const ADMIN_KEY = process.env.ADMIN_KEY || "";
const STORE_NAME = "blog";
const DEFAULT_DATA = { posts: [], nextTopic: null, topicCursor: 0 };

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

/* ---------- Storage (MongoDB-first via store.js, local-file fallback) ---------- */
async function loadData() {
  return store.load(STORE_NAME, DEFAULT_DATA);
}

async function saveData(data) {
  return store.save(STORE_NAME, data);
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

function normalizeForDupeCheck(text) {
  return String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/* ---------- Lightweight fact research (free, no API key, no extra signup) ---------- */
const RESEARCH_SKIP_KEYWORDS = [
  "film", "movie", "tv series", "television series", "web series",
  "documentary", "song", "album", "novel", "book", "video game",
  "actor", "actress", "musician", "singer", "band",
];

function looksOffTopicForTravel(description) {
  const text = String(description || "").toLowerCase();
  return RESEARCH_SKIP_KEYWORDS.some((kw) => text.includes(kw));
}

async function researchTopic(topic) {
  try {
    const searchUrl =
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=` +
      `${encodeURIComponent(topic)}&format=json&srlimit=5&origin=*`;
    const searchResp = await fetch(searchUrl);
    const searchData = await searchResp.json();
    const results = searchData?.query?.search || [];
    if (!results.length) return null;

    for (const result of results) {
      const title = result?.title;
      if (!title) continue;

      let summaryData;
      try {
        const summaryResp = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
        );
        if (!summaryResp.ok) continue;
        summaryData = await summaryResp.json();
      } catch {
        continue;
      }

      const description = summaryData?.description || "";
      if (looksOffTopicForTravel(description)) {
        console.warn(`blog: skipping off-topic Wikipedia match "${title}" (${description}) for research on "${topic}"`);
        continue;
      }

      const extract = (summaryData?.extract || "").trim();
      if (!extract) continue;

      return {
        title,
        extract: extract.slice(0, 700),
        sourceUrl: summaryData?.content_urls?.desktop?.page || null,
      };
    }

    return null;
  } catch (err) {
    console.error("blog: research lookup failed (continuing without it):", err.message);
    return null;
  }
}

/* ---------- Keyword research (free, no API key) ---------- */
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

/* ---------- Slug + meta helpers ---------- */
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

/* ---------- Core: generate today's post if it doesn't exist yet ---------- */
async function ensureTodaysPost() {
  const data = await loadData();
  const key = todayKey();

  const existing = data.posts.find((p) => p.date === key);
  if (existing) return existing;

  const topic = (data.nextTopic && data.nextTopic.trim()) || pickAutoTopic(data);
  data.nextTopic = null; // consumed

  const normalizedTopic = normalizeForDupeCheck(topic);
  const alreadyExists = data.posts.some(
    (p) => normalizeForDupeCheck(p.topic) === normalizedTopic || normalizeForDupeCheck(p.title) === normalizedTopic
  );
  if (alreadyExists) {
    console.warn(`blog: "${topic}" already published before — skipping duplicate, not replacing anything.`);
    await saveData(data); // persist the consumed nextTopic/topicCursor advance
    return data.posts[0] || null;
  }

  const keywordData = await researchKeywords(topic);
  const keywordBlock = keywordData.relatedKeywords.length
    ? `\n\nReal phrases people search for around this topic (from Google autocomplete): ` +
      `${keywordData.relatedKeywords.slice(0, 5).join(", ")}. Naturally work in 2-3 of the ` +
      `most relevant ones, in your own words — never force all of them in, and never make ` +
      `a sentence read like a keyword list.\n`
    : "";

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

  // NEW: if every AI provider failed today, don't persist a placeholder
  // as "today's post" at all — a placeholder is not real, useful content
  // and shouldn't count as a permanent published post or occupy today's
  // date slot. Return it just for this one request instead, so the next
  // visitor (or the 30-min background retry below) attempts generation
  // again from scratch until it actually succeeds.
  if (!raw) {
    console.warn(`blog: all AI providers failed for "${topic}" — not persisting a placeholder, will retry.`);
    return {
      id: `pending-${key}`,
      date: key,
      topic,
      title,
      content,
      imageUrl: null,
      // No researchSourceUrl here either — nothing to cite for content
      // that was never actually generated.
      researchSourceUrl: null,
      slug: slugify(title) || slugify(topic) || key,
      metaTitle: `${title} | AdmireDworld Travel Blog`.slice(0, 65),
      metaDescription: buildMetaDescription(content, topic),
      keywords: [],
      createdAt: new Date().toISOString(),
    };
  }

  // NEW: also guard on the FINAL generated title, in case the AI's title
  // wording happens to collide with an older post even though the seed
  // topic differed.
  const normalizedFinalTitle = normalizeForDupeCheck(title);
  const finalTitleAlreadyExists = data.posts.some(
    (p) => normalizeForDupeCheck(p.title) === normalizedFinalTitle
  );
  if (finalTitleAlreadyExists) {
    console.warn(`blog: generated title "${title}" duplicates an existing post — skipping, not replacing anything.`);
    await saveData(data);
    return data.posts[0] || null;
  }

  const post = {
    id: `${key}-${Math.random().toString(36).slice(2, 8)}`,
    date: key,
    topic,
    title,
    content,
    imageUrl: await generateImageUrl(topic),
    // CHANGED: only attach a research source when real AI-written content
    // was actually produced (raw is guaranteed non-empty here, since the
    // !raw branch above already returned). Never cite a source for a
    // placeholder — that branch never reaches this line at all now.
    researchSourceUrl: research?.sourceUrl || null,
    slug: (() => {
      const base = slugify(title) || slugify(topic) || key;
      const existingSlugs = new Set(data.posts.map((p) => p.slug));
      if (!existingSlugs.has(base)) return base;
      let n = 2;
      while (existingSlugs.has(`${base}-${n}`)) n += 1;
      return `${base}-${n}`;
    })(),
    metaTitle: `${title} | AdmireDworld Travel Blog`.slice(0, 65),
    metaDescription: buildMetaDescription(content, topic),
    keywords: keywordData.relatedKeywords,
    createdAt: new Date().toISOString(),
  };

  data.posts.unshift(post);
  data.posts = data.posts.slice(0, 60);
  await saveData(data);
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

function isAdminAuthed(req) {
  const key = req.headers["x-admin-key"] || req.query.adminKey || req.body?.adminKey;
  if (!ADMIN_KEY) return true;
  return key === ADMIN_KEY;
}

/* ---------- Routes ---------- */

router.get("/latest", async (req, res) => {
  try {
    const post = await ensureTodaysPost();
    res.json({ ok: true, post });
  } catch (err) {
    console.error("blog latest error:", err);
    res.status(500).json({ error: "Could not load today's blog post." });
  }
});

router.get("/list", async (req, res) => {
  try {
    const data = await loadData();
    res.json({ ok: true, posts: data.posts.slice(0, 30) });
  } catch (err) {
    console.error("blog list error:", err);
    res.status(500).json({ error: "Could not load blog posts." });
  }
});

router.get("/admin/export", async (req, res) => {
  if (!isAdminAuthed(req)) {
    return res.status(401).json({ error: "Invalid admin key." });
  }
  try {
    const data = await loadData();
    res.json({ ok: true, posts: data.posts });
  } catch (err) {
    console.error("blog admin/export error:", err);
    res.status(500).json({ error: "Could not export blog posts." });
  }
});

router.post("/set-topic", setTopicLimiter, async (req, res) => {
  const { topic } = req.body || {};
  if (!isAdminAuthed(req)) {
    return res.status(401).json({ error: "Invalid admin key." });
  }
  if (!topic || !topic.trim()) {
    return res.status(400).json({ error: "Please provide a topic." });
  }
  try {
    const data = await loadData();
    data.nextTopic = topic.trim();
    await saveData(data);
    res.json({ ok: true, queuedTopic: data.nextTopic });
  } catch (err) {
    console.error("blog set-topic error:", err);
    res.status(500).json({ error: "Could not queue topic." });
  }
});

router.delete("/:id", deletePostLimiter, async (req, res) => {
  if (!isAdminAuthed(req)) {
    return res.status(401).json({ error: "Invalid admin key." });
  }
  try {
    const { id } = req.params;
    const data = await loadData();
    const idx = data.posts.findIndex((p) => String(p.id) === String(id));
    if (idx === -1) {
      return res.status(404).json({ error: "Post not found." });
    }
    const [removed] = data.posts.splice(idx, 1);
    await saveData(data);
    res.json({ ok: true, deletedId: removed.id });
  } catch (err) {
    console.error("blog delete error:", err);
    res.status(500).json({ error: "Could not delete post." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const data = await loadData();
    const post = data.posts.find((p) => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: "Post not found." });
    res.json({ ok: true, post });
  } catch (err) {
    console.error("blog get-by-id error:", err);
    res.status(500).json({ error: "Could not load post." });
  }
});

module.exports = router;
module.exports.loadData = loadData;

/* ---------- Keep the blog reliably daily, even on a quiet day ---------- */
setInterval(() => {
  ensureTodaysPost().catch((err) => console.error("blog: scheduled generation failed:", err.message));
}, 30 * 60 * 1000).unref();

setTimeout(() => {
  ensureTodaysPost().catch((err) => console.error("blog: startup generation failed:", err.message));
}, 15 * 1000).unref();
