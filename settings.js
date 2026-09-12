/**
 * AdmireDworld Travel — Site Settings module
 * -------------------------------------------
 * NEW FEATURE — does not touch any existing OTP/login/blog/packages/refer/
 * bookings/wedding/customize/leads/admin-auth code.
 * Mount this router in server.js with: app.use("/api/settings", require("./settings"));
 *
 * What it does
 * ------------
 * Lets an admin change the site's public-facing contact details from the
 * Admin Dashboard instead of editing frontend code by hand:
 *   - contactEmail       -> shown in the footer + used for the mailto: link
 *   - contactPhone       -> shown in the footer (primary) + used for the tel: link
 *   - contactPhoneAlt    -> shown in the footer (secondary number, optional)
 *   - whatsappNumber     -> digits only (e.g. "919639343585"), used for every
 *                           "Chat on WhatsApp" button/link across the site
 *                           (package cards, wedding hero, floating button)
 *
 * -------------------------------------------------------------------
 * FIX (env-var-first — same root cause/fix as ai-provider.js):
 * -------------------------------------------------------------------
 * PROBLEM this fixes: a change made from the Admin Dashboard used to show
 * up immediately on the device that made it (and any request served by
 * that same still-running server process), but reverted back to the old
 * hardcoded value everywhere else after a little while. That's because
 * settings-data.json lives on the SAME disk Render wipes clean every time
 * the free-tier service goes to sleep and wakes back up (or on every
 * redeploy) — the disk is not your git repo and is not permanent storage.
 * So the saved change only ever lived in that one process's lifetime.
 *
 * Fix, mirroring ai-provider.js exactly:
 *   - Render Environment Variables are now the RELIABLE, PERMANENT source.
 *     Set these in Render → your service → Environment to make a change
 *     stick across every restart/redeploy/device, forever:
 *       CONTACT_EMAIL       = hello@admiredworld.travel
 *       CONTACT_PHONE       = +91 96393 43585
 *       CONTACT_PHONE_ALT   = +91 78381 91329
 *       WHATSAPP_NUMBER     = 919639343585
 *   - The Admin Dashboard "Save" button still works instantly, with no
 *     redeploy — whatever was last saved there is checked FIRST, and only
 *     falls back to the env vars above if nothing has been saved from the
 *     dashboard since the server last restarted. This is perfect for a
 *     quick, same-day tweak; the env vars above are what makes a change
 *     survive long-term across every device and every server restart.
 *   - Reading/writing settings-data.json is now fully best-effort: if it
 *     can't be read or written for any reason, the app logs a note and
 *     falls back to env vars / defaults instead of ever crashing.
 *
 * - GET /api/settings is public — the frontend calls this once on page load
 *   to fill in the footer + WhatsApp links, falling back to the same values
 *   that used to be hardcoded if this call fails for any reason.
 * - PUT /api/settings is admin-key protected (same ADMIN_KEY env var used
 *   by every other admin route in this project) and updates whichever
 *   fields are sent.
 *
 * Env vars used: ADMIN_KEY, CONTACT_EMAIL, CONTACT_PHONE, CONTACT_PHONE_ALT,
 * WHATSAPP_NUMBER (all optional — see fallback chain above).
 */

const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const DATA_FILE = path.join(__dirname, "settings-data.json");
const ADMIN_KEY = process.env.ADMIN_KEY || "";

// Last-resort defaults, used only when NEITHER the dashboard-saved file
// NOR a Render environment variable provides a value.
const FACTORY_DEFAULTS = {
  contactEmail: "hello@admiredworld.travel",
  contactPhone: "+91 96393 43585",
  contactPhoneAlt: "+91 78381 91329",
  whatsappNumber: "919639343585", // digits only, no + or spaces — used for wa.me links
};

/* ---------- Storage (simple JSON file, best-effort — never throws) ----------
 * loadSaved() returns ONLY what's actually been saved from the dashboard —
 * an empty object if the file doesn't exist yet (fresh Render deploy, disk
 * wipe after sleep, etc.) or can't be read/parsed for any reason. It does
 * NOT merge FACTORY_DEFAULTS in here, so getSettings() below can tell
 * "nothing saved" apart from "saved as X" and fall through to the env var
 * correctly, field by field.
 */
function loadSaved() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn("settings: settings-data.json unreadable, ignoring it:", err.message);
    }
    return {};
  }
}

function saveToDisk(next) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(next, null, 2), "utf8");
    return true;
  } catch (err) {
    // e.g. read-only filesystem — never crash the request for this. The
    // value the admin just set is still used for the rest of this
    // process's lifetime via the in-memory value already returned to the
    // caller; it just won't survive a restart unless it's also set as an
    // env var (see the module header above).
    console.error("settings: could not save settings-data.json (continuing without persisting it):", err.message);
    return false;
  }
}

// Effective settings actually used by the site. Priority, per field:
// dashboard-saved value (this process's lifetime) → Render env var
// (survives restarts) → factory default.
function getSettings() {
  const saved = loadSaved();
  return {
    contactEmail: saved.contactEmail || process.env.CONTACT_EMAIL || FACTORY_DEFAULTS.contactEmail,
    contactPhone: saved.contactPhone || process.env.CONTACT_PHONE || FACTORY_DEFAULTS.contactPhone,
    contactPhoneAlt:
      saved.contactPhoneAlt !== undefined
        ? saved.contactPhoneAlt
        : process.env.CONTACT_PHONE_ALT || FACTORY_DEFAULTS.contactPhoneAlt,
    whatsappNumber: saved.whatsappNumber || process.env.WHATSAPP_NUMBER || FACTORY_DEFAULTS.whatsappNumber,
  };
}

/* ---------- Routes ---------- */

// Public: read the current contact settings. Called by the frontend on
// every page load to populate the footer + WhatsApp links.
router.get("/", (req, res) => {
  res.json({ ok: true, settings: getSettings() });
});

// Admin: update contact settings. Only the fields actually sent are
// changed — everything else keeps its current effective value.
router.put("/", (req, res) => {
  const { adminKey, ...updates } = req.body || {};
  if (ADMIN_KEY && adminKey !== ADMIN_KEY) {
    return res.status(401).json({ error: "Invalid admin key." });
  }

  const next = { ...loadSaved() };

  if (typeof updates.contactEmail === "string" && updates.contactEmail.trim()) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.contactEmail.trim())) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    next.contactEmail = updates.contactEmail.trim();
  }
  if (typeof updates.contactPhone === "string" && updates.contactPhone.trim()) {
    next.contactPhone = updates.contactPhone.trim();
  }
  if (typeof updates.contactPhoneAlt === "string") {
    next.contactPhoneAlt = updates.contactPhoneAlt.trim();
  }
  if (typeof updates.whatsappNumber === "string" && updates.whatsappNumber.trim()) {
    const digits = updates.whatsappNumber.replace(/[^0-9]/g, "");
    if (digits.length < 10) {
      return res.status(400).json({ error: "Please enter a valid WhatsApp number (with country code, digits only)." });
    }
    next.whatsappNumber = digits;
  }

  saveToDisk(next); // best-effort; getSettings() still works even if this fails
  // Return the FULL effective view (merged with env/defaults) so the
  // dashboard shows what's actually active right now, not just what was saved.
  res.json({ ok: true, settings: getSettings() });
});

module.exports = router;
