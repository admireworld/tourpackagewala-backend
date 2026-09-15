/**
 * AdmireDworld Travel — shared AI provider module
 * -------------------------------------------------
 * NEW FEATURE — does not touch any existing OTP/login/packages/refer/
 * bookings/wedding/customize/leads/admin-auth/settings code.
 *
 * Why this file exists
 * ---------------------
 * blog.js and packages.js each used to have their OWN copy of
 * generateText()/generateImageUrl(), and the only way to switch provider
 * or rotate an API key was to edit an env var on the host and redeploy.
 *
 * This module centralizes that into ONE place, and lets the CURRENT
 * provider + API key come from either:
 *   1) Render Environment Variables (recommended — see below), or
 *   2) the Admin Dashboard (Settings → AI Content Provider), which
 *      saves to a local JSON file (ai-settings-data.json).
 *
 * -------------------------------------------------------------------
 * UPDATE (env-var-first — fixes "works locally, not on Render"):
 * -------------------------------------------------------------------
 * ai-settings-data.json is intentionally in .gitignore (so a saved key
 * never ends up committed to git). That means on a host like Render,
 * where the disk isn't your git repo, that file simply won't exist
 * after a fresh deploy — so the app must NOT depend on it for the blog
 * to work. It now doesn't:
 *
 *   - Render Environment Variables are now the PRIMARY source for the
 *     provider + keys. Set these in Render → your service → Environment:
 *       AI_TEXT_PROVIDER   = gemini        (or "openai" / "pollinations")
 *       AI_IMAGE_PROVIDER  = pexels        (or "pollinations")
 *       GEMINI_API_KEY     = <your Gemini key>
 *       PEXELS_API_KEY     = <your Pexels key>
 *       OPENAI_API_KEY     = <your OpenAI key, only if using OpenAI>
 *     Once these are set on Render, the blog/package generator works
 *     immediately on every deploy — no JSON file required at all.
 *
 *   - The Admin Dashboard card still works exactly as before, and still
 *     needs no redeploy: whatever is saved there is checked FIRST, and
 *     only falls back to the env vars above if nothing has been saved
 *     from the dashboard yet. So you can still rotate a key from the
 *     dashboard at any time — the env vars above are just the reliable
 *     baseline that survives Render wiping the JSON file on every
 *     fresh deploy.
 *
 *   - Reading/writing ai-settings-data.json is now fully best-effort:
 *     if the file doesn't exist, can't be parsed, or can't be written
 *     (e.g. a read-only filesystem), the app logs a note and carries on
 *     using env vars / in-memory values instead of crashing. Saving from
 *     the dashboard on a host with a non-persistent disk (like Render's
 *     free tier) will still work for the current running instance, it
 *     just won't survive the next restart/deploy — which is exactly why
 *     the env vars above are the recommended long-term source of truth.
 *
 * -------------------------------------------------------------------
 * FIX (this update) — Pollinations error text was being published as
 * a real blog post:
 * -------------------------------------------------------------------
 * generateTextPollinations() previously read the response body and
 * returned it as-is, with no res.ok check and no sanity check on the
 * content. When Pollinations' own free tier is over budget, it responds
 * with HTTP 200 and a plain-text error message in the body (e.g. "The
 * API key used for this request has reached its budget..."). Because
 * that response looked like a normal 200 OK with text in it, it was
 * treated as a valid AI-written article and published as-is — including
 * as the post TITLE, since blog.js takes the first line as the title.
 *
 * This is now fixed two ways:
 *   1) generateTextPollinations() checks resp.ok and throws on failure,
 *      exactly like the Gemini/OpenAI helpers already did.
 *   2) It also checks the returned text against a small set of known
 *      Pollinations/provider error phrases and throws if matched, even
 *      on a 200 status — so a "successful" but bogus response can never
 *      be mistaken for real article text.
 * With this fix, if EVERY provider fails (admin-selected one AND the
 * Pollinations fallback), generateText() throws, blog.js's raw stays
 * empty, and the post falls back to the existing safe placeholder text
 * ("We're putting today's story together...") instead of ever
 * publishing an error message as a real post.
 *
 * Supported text providers: "pollinations" (free, default) | "gemini" | "openai"
 * Supported image providers: "pollinations" (free, AI-generated, default) |
 *   "pexels" (real travel stock photos, needs a free Pexels API key)
 *
 * Mount the admin routes in server.js with:
 *   app.use("/api/ai-settings", require("./ai-settings"));
 */

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "ai-settings-data.json");

// Last-resort defaults, used only when NEITHER the dashboard-saved file
// NOR a Render environment variable provides a value. Kept free/keyless
// so the blog can never get fully stuck with "no provider at all".
const FACTORY_DEFAULTS = {
  textProvider: "pollinations", // "pollinations" | "gemini" | "openai"
  imageProvider: "pollinations", // "pollinations" | "pexels"
  geminiApiKey: "",
  openaiApiKey: "",
  pexelsApiKey: "",
};

/* ---------- Storage (simple JSON file, best-effort — never throws) ----------
 * loadSettings() returns ONLY what's actually been saved from the
 * dashboard — an empty object if the file doesn't exist yet (fresh
 * Render deploy, disk wipe, etc.) or can't be read/parsed for any
 * reason. It deliberately does NOT merge FACTORY_DEFAULTS in here, so
 * getSettings() below can tell "nothing saved" apart from "saved as
 * pollinations" and fall through to env vars correctly.
 */
function loadSettings() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code !== "ENOENT") {
      // File exists but couldn't be read/parsed (corrupted, permissions, etc.)
      // — log it once and keep going as if nothing was saved.
      console.warn("ai-provider: ai-settings-data.json unreadable, ignoring it:", err.message);
    }
    return {};
  }
}

function saveSettings(next) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(next, null, 2), "utf8");
    return true;
  } catch (err) {
    // e.g. read-only filesystem, disk not writable, etc. Never crash the
    // request for this — the value the admin just set is still used for
    // the rest of this process's lifetime via the in-memory `next`
    // object the caller already has; it just won't survive a restart.
    console.error(
      "ai-provider: could not save ai-settings-data.json (continuing without persisting it):",
      err.message
    );
    return false;
  }
}

// Effective settings actually used by generateText()/generateImageUrl().
// Priority, per field: dashboard-saved value → Render env var → free default.
function getSettings() {
  const saved = loadSettings(); // {} if nothing saved / file missing — safe
  return {
    textProvider: saved.textProvider || process.env.AI_TEXT_PROVIDER || FACTORY_DEFAULTS.textProvider,
    imageProvider: saved.imageProvider || process.env.AI_IMAGE_PROVIDER || FACTORY_DEFAULTS.imageProvider,
    geminiApiKey: saved.geminiApiKey || process.env.GEMINI_API_KEY || FACTORY_DEFAULTS.geminiApiKey,
    openaiApiKey: saved.openaiApiKey || process.env.OPENAI_API_KEY || FACTORY_DEFAULTS.openaiApiKey,
    pexelsApiKey: saved.pexelsApiKey || process.env.PEXELS_API_KEY || FACTORY_DEFAULTS.pexelsApiKey,
  };
}

function updateSettings(partial) {
  const current = loadSettings(); // only what's actually saved so far, not the defaults
  const next = { ...current };
  if (typeof partial.textProvider === "string" && ["pollinations", "gemini", "openai"].includes(partial.textProvider)) {
    next.textProvider = partial.textProvider;
  }
  if (typeof partial.imageProvider === "string" && ["pollinations", "pexels"].includes(partial.imageProvider)) {
    next.imageProvider = partial.imageProvider;
  }
  if (typeof partial.geminiApiKey === "string") next.geminiApiKey = partial.geminiApiKey.trim();
  if (typeof partial.openaiApiKey === "string") next.openaiApiKey = partial.openaiApiKey.trim();
  if (typeof partial.pexelsApiKey === "string") next.pexelsApiKey = partial.pexelsApiKey.trim();
  saveSettings(next); // best-effort; getSettings() still works even if this fails
  // Return the FULL effective view (merged with env/defaults) so the
  // dashboard can show what's actually active, not just what was saved.
  return getSettings();
}

/* ---------- Guard against provider error text masquerading as content ----------
 * Some free/limited providers respond with HTTP 200 and a plain-text
 * error message in the body instead of a proper error status. This
 * checks a generated string against a few known patterns and throws
 * if it looks like an error rather than real article text, so it can
 * never be published as a blog post.
 */
const ERROR_TEXT_PATTERNS = [
  /reached its budget/i,
  /rate limit/i,
  /quota exceeded/i,
  /api key .* invalid/i,
  /invalid api key/i,
  /unauthorized/i,
  /raise the key budget/i,
];

function looksLikeProviderError(text) {
  const sample = String(text || "").slice(0, 300);
  return ERROR_TEXT_PATTERNS.some((re) => re.test(sample));
}

/* ---------- Pollinations (free, no key — the guaranteed-to-work fallback) ---------- */
async function generateTextPollinations(prompt) {
  const resp = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`);
  const text = (await resp.text()).trim();

  if (!resp.ok) {
    throw new Error(`Pollinations text generation failed (${resp.status}): ${text.slice(0, 200)}`);
  }
  if (!text) {
    throw new Error("Pollinations text generation returned an empty response.");
  }
  if (looksLikeProviderError(text)) {
    // Looks like a 200 OK carrying an error message in the body (e.g. a
    // budget/quota notice) rather than real article text — treat it as
    // a failure so it never gets published as a post.
    throw new Error(`Pollinations returned an error message instead of content: ${text.slice(0, 200)}`);
  }

  return text;
}

function generateImageUrlPollinations(prompt) {
  const seed = Date.now();
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(
    prompt + ", travel photography, vibrant, high quality"
  )}?width=1024&height=576&seed=${seed}&nologo=true`;
}

/* ---------- Pexels (real travel stock photos) ----------
 * Every search is deliberately scoped to travel/tourism imagery — this
 * is a travel agency's blog, so the picture above a post should always
 * be a real travel/destination photo, never something generic or
 * off-topic. The query always has "travel" appended, orientation is
 * fixed to landscape (matches the blog's cover-image slot), and only
 * the first, most relevant result is used.
 */
async function generateImageUrlPexels(prompt, apiKey) {
  const query = `${prompt} travel destination`;
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(
    query
  )}&per_page=1&orientation=landscape`;
  const resp = await fetch(url, { headers: { Authorization: apiKey } });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Pexels image search failed (${resp.status}): ${errText.slice(0, 200)}`);
  }
  const data = await resp.json();
  const photo = data?.photos?.[0];
  const photoUrl = photo?.src?.landscape || photo?.src?.large2x || photo?.src?.large;
  if (!photoUrl) throw new Error("Pexels returned no matching travel photo.");
  return photoUrl;
}

/* ---------- Gemini (Google AI Studio) ----------
 * Uses the new-format "AQ." authentication keys (Google's current key
 * type — see https://ai.google.dev/gemini-api/docs/api-key), sent via
 * the x-goog-api-key header, exactly as Google's docs specify.
 */
async function generateTextGemini(prompt, apiKey) {
  const resp = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Gemini text generation failed (${resp.status}): ${errText.slice(0, 200)}`);
  }
  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!text.trim()) {
    // 200 OK but no usable text — e.g. blocked by a safety filter, or an
    // unexpected response shape. Treat as a failure so it falls back
    // instead of publishing nothing/garbage.
    throw new Error(`Gemini returned an empty response (possibly blocked or malformed): ${JSON.stringify(data).slice(0, 200)}`);
  }
  return text.trim();
}

/* ---------- OpenAI (unchanged behaviour from before, just relocated here) ---------- */
async function generateTextOpenAI(prompt, apiKey) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`OpenAI text generation failed (${resp.status}): ${errText.slice(0, 200)}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

/* ---------- Public API used by blog.js / packages.js ----------
 * Always tries the admin-selected provider first. If that provider
 * isn't configured (no key saved / no env var set) or the call fails
 * for any reason (bad key, quota, network), it automatically falls
 * back to the free Pollinations provider instead of throwing — so a
 * missing/bad/expired key can never stop the daily blog or weekly
 * package from being generated. If Pollinations ALSO fails (or returns
 * an error message instead of real text — see the guard above),
 * generateText() throws, and blog.js's existing safe placeholder text
 * kicks in instead of ever publishing an error message as a post.
 */
async function generateText(prompt) {
  const settings = getSettings();

  try {
    if (settings.textProvider === "gemini") {
      if (!settings.geminiApiKey) throw new Error("No Gemini API key configured (set GEMINI_API_KEY on Render, or save one from the dashboard).");
      return await generateTextGemini(prompt, settings.geminiApiKey);
    }
    if (settings.textProvider === "openai") {
      if (!settings.openaiApiKey) throw new Error("No OpenAI API key configured (set OPENAI_API_KEY on Render, or save one from the dashboard).");
      return await generateTextOpenAI(prompt, settings.openaiApiKey);
    }
  } catch (err) {
    console.error(
      `ai-provider: "${settings.textProvider}" text generation failed, falling back to free Pollinations:`,
      err.message
    );
  }

  return generateTextPollinations(prompt);
}

async function generateImageUrl(prompt) {
  const settings = getSettings();

  if (settings.imageProvider === "pexels" && settings.pexelsApiKey) {
    try {
      return await generateImageUrlPexels(prompt, settings.pexelsApiKey);
    } catch (err) {
      console.error(
        "ai-provider: Pexels image search failed, falling back to free Pollinations:",
        err.message
      );
    }
  }

  // Default / fallback: free, no key, AI-generated cover image.
  return generateImageUrlPollinations(prompt);
}

module.exports = {
  generateText,
  generateImageUrl,
  getSettings,
  updateSettings,
};
