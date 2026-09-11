/**
 * AdmireDworld Travel — AI Content Provider settings (admin routes)
 * -------------------------------------------------------------------
 * NEW FEATURE — does not touch any existing OTP/login/blog/packages/
 * refer/bookings/wedding/customize/leads/admin-auth/settings code.
 * Mount this router in server.js with: app.use("/api/ai-settings", require("./ai-settings"));
 *
 * What it does
 * ------------
 * Lets an admin see and change which AI provider (and API key) the
 * daily blog (blog.js) and weekly auto-package (packages.js) use to
 * write content — from the Admin Dashboard, Settings → "AI Content
 * Provider" card. No code change or redeploy needed to rotate a key or
 * switch provider; blog.js/packages.js pick up the new value on their
 * very next run via ai-provider.js.
 *
 * - GET /api/ai-settings          -> admin-key protected, returns the
 *   current provider settings (including the saved key, so the admin
 *   can confirm what's currently active).
 * - PUT /api/ai-settings          -> admin-key protected, updates
 *   whichever fields are sent (textProvider, imageProvider,
 *   geminiApiKey, openaiApiKey). Leaving a field out keeps its current
 *   value — e.g. switching provider without resending the key.
 *
 * Env vars used: ADMIN_KEY (already used everywhere else in this project).
 */

const express = require("express");
const { getSettings, updateSettings } = require("./ai-provider");

const router = express.Router();

const ADMIN_KEY = process.env.ADMIN_KEY || "";

function checkAdminKey(req, res) {
  const adminKey = req.query.adminKey || req.headers["x-admin-key"] || (req.body || {}).adminKey;
  if (ADMIN_KEY && adminKey !== ADMIN_KEY) {
    res.status(401).json({ error: "Invalid admin key." });
    return false;
  }
  return true;
}

// Admin: view the currently active AI provider + key.
router.get("/", (req, res) => {
  if (!checkAdminKey(req, res)) return;
  res.json({ ok: true, settings: getSettings() });
});

// Admin: update provider and/or key(s). Only fields actually sent are changed.
router.put("/", (req, res) => {
  if (!checkAdminKey(req, res)) return;
  const { adminKey, ...updates } = req.body || {};
  const next = updateSettings(updates);
  res.json({ ok: true, settings: next });
});

module.exports = router;
