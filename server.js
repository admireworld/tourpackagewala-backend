/**
 * AdmireDworld Travel — secure OTP login backend
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

const app = express();

const PORT =4000;
const JWT_SECRET = "tourpackagewala_secret_123";
const ALLOWED_ORIGIN = "*";

app.set("trust proxy", 1);

if (!JWT_SECRET) {
  console.error("Missing JWT_SECRET in .env — refusing to start.");
  process.exit(1);
}

/* ---------- Security middleware ---------- */

app.use(helmet());

app.use(
  cors({
    origin: ALLOWED_ORIGIN,
    credentials: false,
  })
);

app.use(express.json({ limit: "10kb" }));

/* ---------- Gmail Mailer ---------- */
/*
  TEMPORARY TESTING:
  Gmail credentials are hard-coded here.

  IMPORTANT:
  Use a Gmail APP PASSWORD, not your normal Gmail password.
*/

const GMAIL_USER = "saffron.shaileshtiwari@gmail.com";
const GMAIL_APP_PASSWORD = "vpgvckgrybspgmnd";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD,
  },
});

/* ---------- SMTP verification ---------- */

transporter.verify((err) => {
  if (err) {
    console.error("❌ Gmail SMTP verification failed:", err.message);
  } else {
    console.log("✅ Gmail SMTP verified — OTP emails can be sent.");
  }
});

/* ---------- Send OTP Email ---------- */

async function sendOtpEmail(toEmail, toName, otp) {
  await transporter.sendMail({
    from: `"AdmireDworld Travel" <${GMAIL_USER}>`,
    to: toEmail,
    subject: "Your AdmireDworld Travel login OTP",

    text:
      `Hi ${toName},\n\n` +
      `Your OTP is ${otp}.\n\n` +
      `It is valid for 5 minutes.\n\n` +
      `If you didn't request this, you can ignore this email.`,

    html:
      `<p>Hi ${toName},</p>` +
      `<p>Your OTP is ` +
      `<strong style="font-size:20px;letter-spacing:3px;">${otp}</strong>` +
      `.</p>` +
      `<p>It is valid for 5 minutes.</p>` +
      `<p>If you didn't request this, you can ignore this email.</p>`,
  });
}

/* ---------- OTP store ---------- */

const otpStore = new Map();

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

function cleanExpired() {
  const now = Date.now();

  for (const [email, rec] of otpStore.entries()) {
    if (rec.expiresAt < now) {
      otpStore.delete(email);
    }
  }
}

setInterval(cleanExpired, 60 * 1000).unref();

/* ---------- Validation ---------- */

const isValidEmail = (v) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

const isValidPhone = (v) =>
  /^[0-9]{10}$/.test(v);

/* ---------- Rate limiters ---------- */

/*
  TEMPORARILY DISABLED FOR OTP TESTING.
  Once OTP works, restore a proper rate limiter here.
*/
const sendOtpLimiter = (req, res, next) => next();

const verifyOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,

  message: {
    error: "Too many attempts. Please try again later.",
  },
});

/* ---------- Modules ---------- */

app.use("/api/blog", require("./blog"));

app.use("/api/packages", require("./packages"));

app.use("/api/fixed", require("./fixed"));

app.use("/api/refer", require("./refer"));

app.use("/api/bookings", require("./bookings"));

app.use("/api/wedding", require("./wedding"));

app.use("/api/customize", require("./customize"));

app.use("/api/leads", require("./leads"));

app.use("/api/admin", require("./admin-auth"));

app.use("/api/settings", require("./settings"));

app.use("/api/ai-settings", require("./ai-settings"));

/* ---------- MongoDB ---------- */

if (process.env.MONGODB_URI) {
  require("./db")
    .getDb()
    .then((db) => {
      if (!db) {
        console.error(
          "❌ MONGODB_URI is set but the connection failed."
        );
      }
    });
} else {
  console.warn(
    "⚠️ MONGODB_URI is not set — using local JSON storage."
  );
}

/* ---------- Health ---------- */

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

/* ---------- Status ---------- */

app.get("/status", (req, res) => {
  res.json({
    status: "ok",
    service: "AdmireDworld Travel Backend",
    timestamp: new Date().toISOString(),
  });
});

/* ---------- Test Email ---------- */

app.post("/api/admin/test-email", async (req, res) => {
  const { adminKey, to } = req.body || {};

  const ADMIN_KEY_CHECK = process.env.ADMIN_KEY || "";

  if (ADMIN_KEY_CHECK && adminKey !== ADMIN_KEY_CHECK) {
    return res.status(401).json({
      error: "Invalid admin key.",
    });
  }

  if (!to || !isValidEmail(to)) {
    return res.status(400).json({
      error: "Provide a valid 'to' email address.",
    });
  }

  try {
    await transporter.sendMail({
      from: `"AdmireDworld Travel" <${GMAIL_USER}>`,
      to,

      subject: "AdmireDworld Travel — test email",

      text:
        "If you received this email, Gmail SMTP is working correctly.",
    });

    res.json({
      ok: true,
      message:
        `Test email sent to ${to}. Check inbox and spam folder.`,
    });
  } catch (err) {
    console.error("test-email error:", err);

    res.status(500).json({
      error: err.message || "Failed to send test email.",
    });
  }
});

/* ---------- SEND OTP ---------- */

app.post(
  "/api/send-otp",
  sendOtpLimiter,
  async (req, res) => {
    try {
      const { name, phone } = req.body || {};

      const email = String(
        (req.body || {}).email || ""
      )
        .trim()
        .toLowerCase();

      if (
        !name ||
        !isValidPhone(phone) ||
        !isValidEmail(email)
      ) {
        return res.status(400).json({
          error:
            "Please provide a valid name, 10-digit phone, and email.",
        });
      }

      /* Generate 6 digit OTP */

      const otp = String(
        Math.floor(
          100000 + Math.random() * 900000
        )
      );

      /* Hash OTP */

      const hash = await bcrypt.hash(otp, 10);

      /* Store OTP */

      otpStore.set(email, {
        hash,

        expiresAt:
          Date.now() + OTP_TTL_MS,

        attempts: 0,

        name,

        phone,
      });

      /* Send email */

      await sendOtpEmail(
        email,
        name,
        otp
      );

      res.json({
        ok: true,
        message: "OTP sent.",
      });

    } catch (err) {
      console.error(
        "send-otp error:",
        err
      );

      res.status(500).json({
        error:
          "Could not send OTP right now. Please try again.",
      });
    }
  }
);

/* ---------- VERIFY OTP ---------- */

app.post(
  "/api/verify-otp",
  verifyOtpLimiter,
  async (req, res) => {
    try {
      const { otp } =
        req.body || {};

      const email = String(
        (req.body || {}).email || ""
      )
        .trim()
        .toLowerCase();

      if (
        !isValidEmail(email) ||
        !/^[0-9]{6}$/.test(otp || "")
      ) {
        return res.status(400).json({
          error: "Invalid request.",
        });
      }

      const rec =
        otpStore.get(email);

      if (!rec) {
        return res.status(400).json({
          error:
            "No OTP request found. Please request a new OTP.",
        });
      }

      if (
        rec.expiresAt < Date.now()
      ) {
        otpStore.delete(email);

        return res.status(400).json({
          error:
            "OTP expired. Please request a new one.",
        });
      }

      if (
        rec.attempts >=
        MAX_VERIFY_ATTEMPTS
      ) {
        otpStore.delete(email);

        return res.status(429).json({
          error:
            "Too many incorrect attempts. Please request a new OTP.",
        });
      }

      /* Compare OTP */

      const match =
        await bcrypt.compare(
          otp,
          rec.hash
        );

      if (!match) {
        rec.attempts += 1;

        return res.status(400).json({
          error: "Incorrect OTP.",
        });
      }

      /* Single use */

      otpStore.delete(email);

      /* JWT */

      const token =
        jwt.sign(
          {
            email,
            name: rec.name,
            phone: rec.phone,
          },
          JWT_SECRET,
          {
            expiresIn: "7d",
          }
        );

      res.json({
        ok: true,

        token,

        user: {
          name: rec.name,
          phone: rec.phone,
          email,
        },
      });

    } catch (err) {
      console.error(
        "verify-otp error:",
        err
      );

      res.status(500).json({
        error:err.message
          
      });
    }
  }
);

/* ---------- Auth middleware ---------- */

function requireAuth(
  req,
  res,
  next
) {
  const authHeader =
    req.headers.authorization || "";

  const token =
    authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

  if (!token) {
    return res.status(401).json({
      error: "Not logged in.",
    });
  }

  try {
    req.user =
      jwt.verify(
        token,
        JWT_SECRET
      );

    next();

  } catch {
    return res.status(401).json({
      error:
        "Session expired. Please log in again.",
    });
  }
}

/* ---------- Current User ---------- */

app.get(
  "/api/me",
  requireAuth,
  (req, res) => {
    res.json({
      user: req.user,
    });
  }
);

/* ---------- Start Server ---------- */

app.listen(
  PORT,
  () => {
    console.log(
      `AdmireDworld Travel backend running on port ${PORT}`
    );
  }
);
