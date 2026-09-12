/**
 * AdmireDworld Travel — shared data store (Mongo-first, local-file fallback)
 * ---------------------------------------------------------------------------
 * NEW FEATURE — does not touch any existing OTP/login/blog/packages/
 * admin-auth/ai-settings/settings code.
 *
 * Used by bookings.js, leads.js, refer.js and wedding.js so real customer
 * data (bookings, leads, referral earnings, wedding enquiries + venues)
 * survives Render restarts/redeploys instead of living only on the free
 * tier's temporary disk.
 *
 * How it works
 * ------------
 * - If MONGODB_URI is set (see db.js + README-DEPLOY.md → "Permanent
 *   storage"), each "store" below is kept as ONE document in MongoDB:
 *     { _id: "<name>", data: <whatever object was passed to save()> }
 *   This keeps every file's existing shape completely unchanged — e.g.
 *   bookings.js still works with a plain { bookings: [...] } object — the
 *   only thing that moved is WHERE it's persisted, not its structure.
 * - If MONGODB_URI is NOT set, or the MongoDB connection fails for any
 *   reason, this transparently falls back to the exact same local-JSON-
 *   file behaviour used before, so nothing breaks for a deployment that
 *   hasn't set up MongoDB Atlas yet — it just keeps the old restart-reset
 *   risk until MONGODB_URI is added.
 *
 * Every module using this just calls:
 *   const store = require("./store");
 *   const data = await store.load("bookings", { bookings: [] });
 *   await store.save("bookings", data);
 * instead of doing its own fs.readFileSync/writeFileSync.
 */

const fs = require("fs");
const path = require("path");
const { getDb, isConfigured } = require("./db");

function localFile(name) {
  return path.join(__dirname, `${name}-data.json`);
}

function loadLocal(name, fallback) {
  try {
    const raw = fs.readFileSync(localFile(name), "utf8");
    return JSON.parse(raw);
  } catch {
    return JSON.parse(JSON.stringify(fallback)); // deep clone — callers can't mutate the shared default
  }
}

function saveLocal(name, data) {
  try {
    fs.writeFileSync(localFile(name), JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (err) {
    console.error(`store: could not save ${name}-data.json (continuing without persisting it):`, err.message);
    return false;
  }
}

// Load a named store. Always resolves — never throws — so a Mongo hiccup
// never breaks a request; it just quietly falls back to the local file.
async function load(name, fallback) {
  if (isConfigured()) {
    try {
      const db = await getDb();
      if (db) {
        const doc = await db.collection("stores").findOne({ _id: name });
        return doc ? doc.data : JSON.parse(JSON.stringify(fallback));
      }
    } catch (err) {
      console.error(`store: MongoDB read failed for "${name}", falling back to the local file:`, err.message);
    }
  }
  return loadLocal(name, fallback);
}

// Save a named store. Always resolves — never throws.
async function save(name, data) {
  if (isConfigured()) {
    try {
      const db = await getDb();
      if (db) {
        await db
          .collection("stores")
          .updateOne({ _id: name }, { $set: { data, updatedAt: new Date() } }, { upsert: true });
        return true;
      }
    } catch (err) {
      console.error(
        `store: MongoDB write failed for "${name}", falling back to the local file (this change may not survive a restart):`,
        err.message
      );
    }
  }
  return saveLocal(name, data);
}

module.exports = { load, save };
