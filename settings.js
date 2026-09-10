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
 * - GET /api/settings is public — the frontend calls this once on page load
 *   to fill in the footer + WhatsApp links, falling back to the same values
 *   that used to be hardcoded if this call fails for any reason.
 * - PUT /api/settings is admin-key protected (same ADMIN_KEY env var used
 *   by every other admin route in this project) and updates whichever
 *   fields are sent.
 * - Saved to a local JSON file (settings-data.json), same pattern as
 *   blog.js/refer.js/wedding.js/leads.js.
 *
 * Env vars used: ADMIN_KEY (already used everywhere else in this project).
 */

const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const DATA_FILE = path.join(__dirname, "settings-data.json");
const ADMIN_KEY = process.env.ADMIN_KEY || "";

const DEFAULT_SETTINGS = {
  contactEmail: "hello@admiredworld.travel",
  contactPhone: "+91 96393 43585",
  contactPhoneAlt: "+91 78381 91329",
  whatsappNumber: "919639343585", // digits only, no + or spaces — used for wa.me links
};

/* ---------- Storage (simple JSON file) ---------- */
function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

/* ---------- Routes ---------- */

// Public: read the current contact settings. Called by the frontend on
// every page load to populate the footer + WhatsApp links.
router.get("/", (req, res) => {
  res.json({ ok: true, settings: loadData() });
});

// Admin: update contact settings. Only the fields actually sent are
// changed — everything else keeps its current value.
router.put("/", (req, res) => {
  const { adminKey, ...updates } = req.body || {};
  if (ADMIN_KEY && adminKey !== ADMIN_KEY) {
    return res.status(401).json({ error: "Invalid admin key." });
  }

  const data = loadData();

  if (typeof updates.contactEmail === "string" && updates.contactEmail.trim()) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.contactEmail.trim())) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    data.contactEmail = updates.contactEmail.trim();
  }
  if (typeof updates.contactPhone === "string" && updates.contactPhone.trim()) {
    data.contactPhone = updates.contactPhone.trim();
  }
  if (typeof updates.contactPhoneAlt === "string") {
    data.contactPhoneAlt = updates.contactPhoneAlt.trim();
  }
  if (typeof updates.whatsappNumber === "string" && updates.whatsappNumber.trim()) {
    const digits = updates.whatsappNumber.replace(/[^0-9]/g, "");
    if (digits.length < 10) {
      return res.status(400).json({ error: "Please enter a valid WhatsApp number (with country code, digits only)." });
    }
    data.whatsappNumber = digits;
  }

  saveData(data);
  res.json({ ok: true, settings: data });
});

module.exports = router;
