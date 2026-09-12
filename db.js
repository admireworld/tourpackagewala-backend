/**
 * AdmireDworld Travel — shared MongoDB connection
 * -------------------------------------------------
 * NEW FEATURE — does not touch any existing OTP/login/blog/packages/
 * admin-auth/ai-settings code.
 *
 * Why this file exists
 * ---------------------
 * bookings.js, leads.js, refer.js and wedding.js used to save real
 * customer data (bookings, leads, referral earnings, wedding enquiries)
 * to a local JSON file on disk. That works fine while the server keeps
 * running, but Render's free tier disk is NOT permanent — it gets wiped
 * on every restart/redeploy/sleep-wake cycle, silently losing that data.
 *
 * This module gives those files a shared, OPTIONAL connection to a free
 * MongoDB Atlas cluster instead, via store.js. See README-DEPLOY.md →
 * "Permanent storage for bookings/leads/referrals/wedding enquiries" for
 * step-by-step setup instructions (free, ~5 minutes, no credit card).
 *
 * IMPORTANT: if MONGODB_URI is not set, every function here simply
 * returns null / does nothing — store.js then transparently falls back
 * to the exact same local-file behaviour as before. Nothing breaks for a
 * deployment that hasn't set up MongoDB Atlas yet.
 *
 * Env vars used:
 *   MONGODB_URI      -> connection string from MongoDB Atlas (optional —
 *                        leave unset to keep using local JSON files)
 *   MONGODB_DB_NAME  -> optional, defaults to "admiredworld"
 */

const { MongoClient } = require("mongodb");

const MONGODB_URI = process.env.MONGODB_URI || "";
const DB_NAME = process.env.MONGODB_DB_NAME || "admiredworld";

let clientPromise = null;
let loggedConnected = false;

function isConfigured() {
  return !!MONGODB_URI;
}

/**
 * Returns a connected Db instance, or null if MongoDB isn't configured or
 * the connection failed (callers should treat null as "fall back to the
 * local file" rather than crash).
 */
async function getDb() {
  if (!MONGODB_URI) return null;

  if (!clientPromise) {
    const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    clientPromise = client.connect().catch((err) => {
      console.error(
        "❌ MongoDB connection failed — bookings/leads/referrals/wedding enquiries will fall back to local files " +
          "(data will NOT survive a restart) until this is fixed. Reason: " + err.message
      );
      clientPromise = null; // allow a fresh retry on the next call instead of caching the failure forever
      throw err;
    });
  }

  try {
    const client = await clientPromise;
    if (!loggedConnected) {
      loggedConnected = true;
      console.log("✅ MongoDB connected — bookings/leads/referrals/wedding enquiries are now permanent.");
    }
    return client.db(DB_NAME);
  } catch {
    return null;
  }
}

module.exports = { getDb, isConfigured };
