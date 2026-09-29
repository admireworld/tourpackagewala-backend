/**
 * AdmireDworld Travel — Festival Offer Popup module
 * ---------------------------------------------------
 * NEW FEATURE — does not touch any existing OTP/login/blog/packages/refer/
 * bookings/wedding/customize/leads/settings/admin-auth code.
 * Mounted in server.js with: app.use("/api/offers", require("./offers"));
 *
 * What it does
 * ------------
 * Lets the admin upload a festival/offer image (Navratri, Diwali, Holi ...)
 * with a title from the Admin Dashboard -> "Festival Offers" tab and switch
 * it ON/OFF. While an offer is ON, every visitor of the website's home page
 * sees it as a popup ~3 seconds after the page opens (see the frontend's
 * offer-popup.js).
 *
 * Rules
 * -----
 * - Only ONE offer can be ON at a time. Turning one ON automatically turns
 *   every other one OFF, so visitors never get stacked/competing popups.
 * - Older offers stay saved (switched OFF), so next year you can just turn
 *   "Navratri" ON again instead of re-uploading.
 * - Images: JPG / PNG / WEBP / GIF, max 3 MB (checked by real file bytes,
 *   not just the file name; SVG is deliberately NOT allowed).
 * - Storage uses store.js, exactly like bookings/leads: MongoDB when
 *   MONGODB_URI is set (permanent), local JSON file otherwise (Render's
 *   free-tier disk is wiped on restart, so set MONGODB_URI to keep offers).
 *
 * Endpoints
 * ---------
 *   PUBLIC
 *   GET    /api/offers/active            -> { ok, offer: {id,title,imagePath,version} | null }
 *   GET    /api/offers/image/:id         -> the image itself (cross-origin allowed, cached)
 *   ADMIN (x-admin-key header or ?adminKey= — same ADMIN_KEY as every other admin route)
 *   GET    /api/offers/admin/all         -> { ok, offers: [...] }
 *   POST   /api/offers/admin             -> multipart: image (file) + title + active("true"/"false")
 *   PATCH  /api/offers/admin/:id         -> { active: true|false }   (toggle on/off)
 *   DELETE /api/offers/admin/:id         -> delete offer + its image
 */

const express = require("express");
const multer = require("multer");
const store = require("./store");

const router = express.Router();

const ADMIN_KEY = process.env.ADMIN_KEY || "";
const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3 MB
const MAX_TITLE_LEN = 80;
const MAX_OFFERS = 50; // safety cap so the store can't grow forever

/* ---------- helpers ---------- */
function checkAdmin(req, res) {
  const adminKey = req.query.adminKey || req.headers["x-admin-key"] || (req.body || {}).adminKey;
  if (ADMIN_KEY && adminKey !== ADMIN_KEY) {
    res.status(401).json({ error: "Invalid admin key." });
    return false;
  }
  return true;
}

const imgKey = (id) => `offerimg-${id}`;
const safeId = (id) => /^of-[a-z0-9]+$/i.test(String(id || ""));
const newId = () => "of-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Detect the REAL image type from the file's first bytes (never trust the
// browser-supplied mimetype/extension alone).
function sniffImageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf.slice(1, 4).toString("latin1") === "PNG") return "image/png";
  if (buf.slice(0, 4).toString("latin1") === "GIF8") return "image/gif";
  if (buf.slice(0, 4).toString("latin1") === "RIFF" && buf.slice(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

async function loadOffers() {
  const data = await store.load("offers", { offers: [] });
  if (!data || !Array.isArray(data.offers)) return { offers: [] };
  return data;
}
const saveOffers = (data) => store.save("offers", data);

// What the admin sees / what is safe to send to the browser (no image bytes).
const publicView = (o) => ({
  id: o.id,
  title: o.title,
  active: !!o.active,
  imagePath: `/api/offers/image/${o.id}?v=${o.version || 1}`,
  version: o.version || 1,
  createdAt: o.createdAt,
  activatedAt: o.activatedAt || null,
});

/* ---------- multer (memory, image only) ---------- */
const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype || "")) return cb(null, true);
    cb(new Error("Only JPG, PNG, WEBP or GIF images are allowed."));
  },
}).single("image");

/* =====================  PUBLIC  ===================== */

// The currently-ON offer (or null). Never cached — an admin switching an
// offer OFF should stop showing to visitors immediately.
router.get("/active", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const { offers } = await loadOffers();
    const active = offers.find((o) => o.active);
    if (!active) return res.json({ ok: true, offer: null });
    const v = publicView(active);
    res.json({ ok: true, offer: { id: v.id, title: v.title, imagePath: v.imagePath, version: v.version } });
  } catch (err) {
    console.error("offers: /active failed:", err.message);
    res.json({ ok: true, offer: null }); // never break the public site because of this
  }
});

// The image bytes. Helmet's default Cross-Origin-Resource-Policy is
// "same-origin", which would stop the Vercel-hosted site from displaying an
// image served by this Render backend — so it's explicitly relaxed here.
router.get("/image/:id", async (req, res) => {
  try {
    if (!safeId(req.params.id)) return res.status(400).end();
    const rec = await store.load(imgKey(req.params.id), null);
    if (!rec || !rec.data) return res.status(404).end();
    const buf = Buffer.from(rec.data, "base64");
    res.setHeader("Content-Type", rec.mime || "image/jpeg");
    res.setHeader("Content-Length", buf.length);
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable"); // URL carries ?v=version
    res.end(buf);
  } catch (err) {
    console.error("offers: image serve failed:", err.message);
    res.status(500).end();
  }
});

/* =====================  ADMIN  ===================== */

router.get("/admin/all", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  const { offers } = await loadOffers();
  const sorted = [...offers].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({ ok: true, offers: sorted.map(publicView) });
});

// Create. Multipart, so the admin key is read from the header/query only
// (the body isn't parsed until multer runs) — same pattern as the voucher upload.
router.post("/admin", (req, res) => {
  if (!checkAdmin(req, res)) return;
  uploadImage(req, res, async (err) => {
    try {
      if (err) {
        const msg = err.code === "LIMIT_FILE_SIZE" ? "Image is too large (max 3 MB)." : err.message || "Upload failed.";
        return res.status(400).json({ error: msg });
      }
      if (!req.file) return res.status(400).json({ error: "Please choose an image (field name: image)." });

      const title = String((req.body || {}).title || "").trim().slice(0, MAX_TITLE_LEN);
      if (!title) return res.status(400).json({ error: "Please enter a title (e.g. Navratri Special Offer)." });

      const mime = sniffImageType(req.file.buffer);
      if (!mime) return res.status(400).json({ error: "This file is not a valid JPG/PNG/WEBP/GIF image." });

      const data = await loadOffers();
      if (data.offers.length >= MAX_OFFERS) {
        return res.status(400).json({ error: `Maximum ${MAX_OFFERS} offers saved. Please delete some old ones first.` });
      }

      const turnOn = String((req.body || {}).active || "true") !== "false";
      const now = new Date().toISOString();
      const offer = {
        id: newId(),
        title,
        active: turnOn,
        version: 1,
        createdAt: now,
        activatedAt: turnOn ? now : null,
      };

      // Save the image first; only then list the offer, so a half-failed
      // upload can never leave an offer pointing at a missing image.
      await store.save(imgKey(offer.id), {
        data: req.file.buffer.toString("base64"),
        mime,
        size: req.file.size,
        filename: req.file.originalname,
      });

      if (turnOn) data.offers.forEach((o) => { o.active = false; }); // only one popup at a time
      data.offers.push(offer);
      await saveOffers(data);

      res.json({ ok: true, offer: publicView(offer) });
    } catch (e) {
      console.error("offers: create failed:", e.message);
      res.status(500).json({ error: "Could not save the offer. Please try again." });
    }
  });
});

// Toggle ON/OFF. Turning one ON turns all the others OFF.
router.patch("/admin/:id", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    if (!safeId(req.params.id)) return res.status(400).json({ error: "Invalid offer id." });
    if (typeof (req.body || {}).active !== "boolean") {
      return res.status(400).json({ error: "Send { active: true } or { active: false }." });
    }
    const data = await loadOffers();
    const offer = data.offers.find((o) => o.id === req.params.id);
    if (!offer) return res.status(404).json({ error: "Offer not found." });

    if (req.body.active) {
      data.offers.forEach((o) => { o.active = false; });
      offer.active = true;
      offer.activatedAt = new Date().toISOString();
      offer.version = (offer.version || 1) + 1; // bumps the "already seen this session" marker so visitors see it again
    } else {
      offer.active = false;
    }
    await saveOffers(data);
    res.json({ ok: true, offer: publicView(offer) });
  } catch (e) {
    console.error("offers: toggle failed:", e.message);
    res.status(500).json({ error: "Could not update the offer." });
  }
});

router.delete("/admin/:id", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    if (!safeId(req.params.id)) return res.status(400).json({ error: "Invalid offer id." });
    const data = await loadOffers();
    const before = data.offers.length;
    data.offers = data.offers.filter((o) => o.id !== req.params.id);
    if (data.offers.length === before) return res.status(404).json({ error: "Offer not found." });
    await saveOffers(data);
    // Clear the image payload (store.js has no delete, so blank it out).
    await store.save(imgKey(req.params.id), { data: "", mime: "", size: 0, deleted: true });
    res.json({ ok: true });
  } catch (e) {
    console.error("offers: delete failed:", e.message);
    res.status(500).json({ error: "Could not delete the offer." });
  }
});

module.exports = router;
