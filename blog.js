/**
 * AdmireDworld Travel — AI Daily Blog module
 * -------------------------------------------
 * Persists posts via store.js (MongoDB-first, local-file fallback) so
 * posts survive Render restarts/redeploys.
 * A failed generation is never saved as "today's post" — it's retried
 * automatically instead of locking in a placeholder for the day.
 * Wikipedia research is used only to help the AI write accurate
 * articles — it is never shown to readers as a source/citation.
 * Each post also carries relatedSlugs (last 3 other posts) for a
 * "You might also like" section, and the prompt now explicitly asks
 * for correct grammar/apostrophes (fixes things like "Keralas" instead
 * of "Kerala's").
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

async function loadData() {
  return store.load(STORE_NAME, DEFAULT_DATA);
}

async function saveData(data) {
  return store.save(STORE_NAME, data);
}

function todayKey() {
  const now = new Date();
  const ist = new Date(now.getTime() + (5.5 * 60 - now.getTimezoneOffset()) * 60000);
  return ist.toISOString().slice(0, 10);
}

function pickAutoTopic(data) {
  const topic = TOPIC_POOL[data.topicCursor % TOPIC_POOL.length];
  data.topicCursor = (data.topicCursor + 1) % TOPIC_POOL.length;
  return topic;
}

function normalizeForDupeCheck(text) {
  return String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
}

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

async function ensureTodaysPost() {
  const data = await loadData();
  const key = todayKey();

  const existing = data.posts.find((p) => p.date === key);
  if (existing) return existing;

  const topic = (data.nextTopic && data.nextTopic.trim()) || pickAutoTopic(data);
  data.nextTopic = null;

  const normalizedTopic = normalizeForDupeCheck(topic);
  const alreadyExists = data.posts.some(
    (p) => normalizeForDupeCheck(p.topic) === normalizedTopic || normalizeForDupeCheck(p.title) === normalizedTopic
  );
  if (alreadyExists) {
    console.warn(`blog: "${topic}" already published before — skipping duplicate, not replacing anything.`);
    await saveData(data);
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
      `your own words, and do not copy any sentence as-is. Do not mention Wikipedia ` +
      `or cite any source by name anywhere in the article — just use the facts:\n"${research.extract}"\n`
    : "";

  const articlePrompt =
    `Write a warm, helpful travel blog post for an Indian travel agency called ` +
    `AdmireDworld Travel, about: "${topic}". Give it a catchy title on the first ` +
    `line, then 4-6 short paragraphs. Friendly, practical tone, no markdown symbols. ` +
    `Ground the post in specific, accurate details rather than vague generalities. ` +
    `Use correct English grammar and punctuation throughout — especially apostrophes ` +
    `for possessives (e.g. "Kerala's backwaters", "India's coastline"), never drop them. ` +
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

  if (!raw) {
    console.warn(`blog: all AI providers failed for "${topic}" — not persisting a placeholder, will retry.`);
    return {
      id: `pending-${key}`,
      date: key,
      topic,
      title,
      content,
      imageUrl: null,
      slug: slugify(title) || slugify(topic) || key,
      metaTitle: `${title} | AdmireDworld Travel Blog`.slice(0, 65),
      metaDescription: buildMetaDescription(content, topic),
      keywords: [],
      relatedSlugs: [],
      createdAt: new Date().toISOString(),
    };
  }

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
    // NEW: up to 3 most recent OTHER posts' slugs, for a "You might also
    // like" section — internal linking helps Google crawl/rank the blog
    // as a connected set of pages rather than isolated one-off posts.
    relatedSlugs: data.posts.slice(0, 3).map((p) => p.slug),
    createdAt: new Date().toISOString(),
  };

  data.posts.unshift(post);
  data.posts = data.posts.slice(0, 60);
  await saveData(data);

  // NEW: ping search engines that the sitemap has fresh content, so new
  // posts get discovered/crawled faster instead of waiting for the next
  // scheduled crawl. Fire-and-forget — never blocks or fails the request.
  pingSitemapToSearchEngines();

  return post;
}

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

// NEW: best-effort ping to Google + Bing telling them the sitemap changed.
// SITE_URL must point at your public frontend domain, e.g.
// https://www.tourpackagewala.in — set it as an env var so this works
// without editing code if the domain ever changes.
const SITE_URL = process.env.SITE_URL || "";
function pingSitemapToSearchEngines() {
  if (!SITE_URL) return; // not configured — silently skip, nothing breaks
  const sitemapUrl = `${SITE_URL.replace(/\/$/, "")}/sitemap.xml`;
  const targets = [
    `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
    `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
  ];
  for (const url of targets) {
    fetch(url).catch((err) => console.error("blog: sitemap ping failed (non-fatal):", err.message));
  }
}

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

setInterval(() => {
  ensureTodaysPost().catch((err) => console.error("blog: scheduled generation failed:", err.message));
}, 30 * 60 * 1000).unref();

setTimeout(() => {
  ensureTodaysPost().catch((err) => console.error("blog: startup generation failed:", err.message));
}, 15 * 1000).unref();
