/**
 * =========================================================
 * 🚀 APP.JS (FINAL PRODUCTION 🔥)
 * =========================================================
 * Path: backend/core/app.js
 *
 * ✅ FIX 1: express-mongo-sanitize REMOVED — incompatible with
 *    Express 5. req.query is read-only in Express 5 and the
 *    package tries to overwrite it → crashes every single request.
 *    Replaced with a manual inline sanitizer that only touches
 *    req.body (safe to mutate) and skips req.query.
 *
 * ✅ FIX 2: app.options("*") → app.options("/{*any}")
 *    Express 5 requires named wildcards.
 *
 * ✅ FIX 3: app.use("*") → app.use("/{*any}")
 *    Same Express 5 wildcard requirement.
 * =========================================================
 */

import express     from "express";
import cors        from "cors";
import helmet      from "helmet";
import morgan      from "morgan";
import compression from "compression";
import multer      from "multer";
import path        from "path";
import { fileURLToPath } from "url";

/* ─────────────────────────────────────────
   🍪 COOKIE PARSER (optional)
───────────────────────────────────────── */
let cookieParser = null;

try {
  cookieParser = (await import("cookie-parser")).default;
} catch {
  console.warn("⚠️  cookie-parser not installed — cookies will not be parsed.");
  console.warn("    Fix: npm install cookie-parser");
}

/* ─────────────────────────────────────────
   ❌ express-mongo-sanitize — DISABLED
   Incompatible with Express 5: req.query is
   a read-only getter in Express 5 but the
   package tries to overwrite it, crashing
   every request with:
     "Cannot set property query of
      #<IncomingMessage> which has only a getter"
   A safe manual sanitizer is applied below
   in the middleware chain instead.
───────────────────────────────────────── */

/* ─────────────────────────────────────────
   📊 WINSTON LOGGER + MORGAN STREAM
───────────────────────────────────────── */
let logger, morganStream;

try {
  const logging = await import("../infrastructure/logging/logger.js");
  logger        = logging.logger;
  morganStream  = logging.morganStream;
} catch {
  console.warn("⚠️  Winston logger not found — using console fallback.");
  logger       = { warn: console.warn, error: console.error, info: console.info };
  morganStream = { write: (msg) => process.stdout.write(msg) };
}

/* ─────────────────────────────────────────
   🚦 RATE LIMITER
───────────────────────────────────────── */
let rateLimitMiddleware;

try {
  const rl            = await import("../shared/middleware/rateLimit.middleware.js");
  rateLimitMiddleware = rl.rateLimitMiddleware;
} catch {
  console.warn("⚠️  rateLimit.middleware.js not found — rate limiting disabled.");
  rateLimitMiddleware = (req, res, next) => next();
}

/* ─────────────────────────────────────────
   ❌ CUSTOM ERROR MIDDLEWARE
───────────────────────────────────────── */
let errorMiddleware;

try {
  const em        = await import("../shared/middleware/error.middleware.js");
  errorMiddleware = em.errorMiddleware;
} catch {
  console.warn("⚠️  error.middleware.js not found — using inline error handler.");
  errorMiddleware = null;
}

/* ─────────────────────────────────────────
   📡 CORE ROUTES (always present)
───────────────────────────────────────── */
import authRoutes       from "../modules/auth/routes/auth.routes.js";
import courseRoutes     from "../modules/course/routes/course.routes.js";
import adminRoutes      from "../modules/admin/routes/admin.routes.js";
import instructorRoutes from "../modules/instructor/routes/instructor.routes.js";

/* ─────────────────────────────────────────
   📡 OPTIONAL ROUTES
───────────────────────────────────────── */
let userRoutes,
  notificationRoutes,
  paymentRoutes,
  purchaseRoutes,
  mediaRoutes,
  uploadRoutes,
  discussionRoutes,
  progressRoutes,
  wishlistRoutes;

try {
  userRoutes = (await import("../modules/user/routes/user.routes.js")).default;
} catch {
  console.warn("⚠️  user.routes.js not found — /api/users will return 404");
  userRoutes = express.Router();
}

try {
  notificationRoutes = (await import("../modules/notification/routes/notification.routes.js")).default;
} catch {
  console.warn("⚠️  notification.routes.js not found — /api/notifications will return 404");
  notificationRoutes = express.Router();
}

try {
  paymentRoutes = (await import("../modules/payment/routes/payment.routes.js")).default;
} catch {
  console.warn("⚠️  payment.routes.js not found — /api/payments will return 404");
  paymentRoutes = express.Router();
}

try {
  purchaseRoutes = (await import("../modules/purchase/routes/purchase.routes.js")).default;
} catch {
  console.warn("⚠️  purchase.routes.js not found — /api/purchases will return 404");
  purchaseRoutes = express.Router();
}

try {
  mediaRoutes = (await import("../modules/media/routes/media.routes.js")).default;
} catch {
  console.warn("⚠️  media.routes.js not found — /api/media will return 404");
  mediaRoutes = express.Router();
}

try {
  uploadRoutes = (await import("../modules/media/routes/upload.routes.js")).default;
} catch {
  console.warn("⚠️  upload.routes.js not found — /api/upload will return 404");
  uploadRoutes = express.Router();
}

try {
  discussionRoutes = (await import("../modules/discussion/routes/discussion.routes.js")).default;
} catch {
  console.warn("discussion.routes.js not found - /api/discussions will return 404");
  discussionRoutes = express.Router();
}

try {
  progressRoutes = (await import("../modules/progress/routes/progress.routes.js")).default;
} catch {
  console.warn("progress.routes.js not found - /api/progress will return 404");
  progressRoutes = express.Router();
}

try {
  wishlistRoutes = (await import("../modules/wishlist/routes/wishlist.routes.js")).default;
} catch {
  console.warn("wishlist.routes.js not found - /api/wishlist will return 404");
  wishlistRoutes = express.Router();
}

/* ─────────────────────────────────────────
   ENV
───────────────────────────────────────── */
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const NODE_ENV   = process.env.NODE_ENV   || "development";
const ADMIN_URL  = process.env.ADMIN_URL  || "";
const FRONTEND_URL = process.env.FRONTEND_URL || "";
const CORS_ORIGINS = process.env.CORS_ORIGINS || "";
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const FRONTEND_DIR = path.resolve(__dirname, "../frontend");

/* ═══════════════════════════════════════
   🚀 CREATE APP
═══════════════════════════════════════ */
const app = express();

/* ─────────────────────────────────────────
   🔐 SECURITY HEADERS (Helmet)
───────────────────────────────────────── */
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy:     false,
}));

/* ─────────────────────────────────────────
   🌐 CORS
───────────────────────────────────────── */
const splitOrigins = (...values) =>
  values
    .flatMap((value) => String(value || "").split(","))
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);

const allowedOrigins = new Set([
  ...splitOrigins(CLIENT_URL, ADMIN_URL, FRONTEND_URL, CORS_ORIGINS),
  "http://localhost:5173",
  "http://localhost:3000",
]);

const isAllowedOrigin = (origin) => {
  const normalizedOrigin = origin.replace(/\/$/, "");
  if (allowedOrigins.has(normalizedOrigin)) return true;

  if (!process.env.VERCEL_URL) return false;

  try {
    const { hostname } = new URL(normalizedOrigin);
    return hostname === process.env.VERCEL_URL;
  } catch {
    return false;
  }
};

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (isAllowedOrigin(origin)) return callback(null, true);
    if (NODE_ENV !== "production") return callback(null, true);
    logger.warn(`🚫 CORS blocked: ${origin}`);
    callback(new Error(`CORS policy: origin ${origin} is not allowed`));
  },
  credentials:    true,
  methods:        ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
}));

/* ✅ Express 5: named wildcard required — "/{*any}" not "*" */
app.options("/{*any}", cors());

/* ─────────────────────────────────────────
   📦 BODY PARSING
───────────────────────────────────────── */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use("/uploads", express.static("uploads"));
app.use("/learner", express.static(FRONTEND_DIR));

/* ─────────────────────────────────────────
   🍪 COOKIE PARSER
───────────────────────────────────────── */
if (cookieParser) {
  app.use(cookieParser());
}

/* ─────────────────────────────────────────
   🧼 NOSQL INJECTION PROTECTION
   Manual sanitizer — Express 5 compatible.
   Only sanitizes req.body (safe to mutate).
   Does NOT touch req.query (read-only in Express 5).
───────────────────────────────────────── */
app.use((req, res, next) => {
  const sanitize = (obj) => {
    if (!obj || typeof obj !== "object") return;
    for (const key of Object.keys(obj)) {
      if (key.startsWith("$") || key.includes(".")) {
        delete obj[key];
      } else if (typeof obj[key] === "object") {
        sanitize(obj[key]);
      }
    }
  };
  if (req.body) sanitize(req.body);
  next();
});

/* ─────────────────────────────────────────
   ⚡ COMPRESSION
───────────────────────────────────────── */
app.use(compression());

/* ─────────────────────────────────────────
   📊 REQUEST LOGGING (Morgan → Winston)
───────────────────────────────────────── */
app.use(morgan(
  NODE_ENV === "production" ? "combined" : "dev",
  {
    stream: morganStream,
    skip:   (req) => req.url === "/health",
  }
));

/* ─────────────────────────────────────────
   🚦 GLOBAL RATE LIMITING
───────────────────────────────────────── */
app.use("/api", rateLimitMiddleware);

/* ─────────────────────────────────────────
   ❤️ HEALTH CHECK
───────────────────────────────────────── */
app.get("/health", (req, res) => {
  res.status(200).json({
    success:   true,
    message:   "Server is healthy",
    timestamp: new Date().toISOString(),
    uptime:    `${Math.floor(process.uptime())}s`,
    env:       NODE_ENV,
  });
});

app.get("/", (req, res) => {
  res.status(200).json({ success: true, message: "🚀 BharathVidya API Running" });
});

/* ─────────────────────────────────────────
   🛣️ API ROUTES
───────────────────────────────────────── */
app.get("/learner", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

app.use("/api/auth",          authRoutes);
app.use("/api/users",         userRoutes);
app.use("/api/admin",         adminRoutes);
app.use("/api/courses",       courseRoutes);
app.use("/api/course",        courseRoutes);        // backward-compat alias
app.use("/api/instructor",    instructorRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/payments",      paymentRoutes);
app.use("/api/purchases",     purchaseRoutes);
app.use("/api/media",         mediaRoutes);
app.use("/api/upload",        uploadRoutes);
app.use("/api/discussions",   discussionRoutes);
app.use("/api/progress",      progressRoutes);
app.use("/api/wishlist",      wishlistRoutes);

/* ─────────────────────────────────────────
   🔍 404 HANDLER
   ✅ Express 5: "/{*any}" replaces "*"
───────────────────────────────────────── */
app.use("/{*any}", (req, res) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

/* ─────────────────────────────────────────
   ❌ GLOBAL ERROR HANDLER
   Must be last — 4-argument signature.
───────────────────────────────────────── */
if (errorMiddleware) {
  app.use(errorMiddleware);
} else {
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error("❌ Global Error:", err.message || err);

    /* Multer */
    if (err instanceof multer.MulterError) {
      const multerMessages = {
        LIMIT_FILE_SIZE:       "File is too large. Check the upload size limit.",
        LIMIT_FILE_COUNT:      "Too many files uploaded at once.",
        LIMIT_UNEXPECTED_FILE: "Unexpected file field name.",
      };
      return res.status(400).json({
        success: false,
        message: multerMessages[err.code] || err.message,
      });
    }

    /* File type validation */
    if (err.message?.includes("Invalid file type") || err.message?.includes("must be")) {
      return res.status(400).json({ success: false, message: err.message });
    }

    /* MongoDB duplicate key */
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || "field";
      return res.status(400).json({
        success: false,
        message: `Duplicate value for ${field}. Please use a unique value.`,
      });
    }

    /* Mongoose validation */
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors || {}).map((e) => e.message).join(", ");
      return res.status(400).json({ success: false, message: messages || err.message });
    }

    /* JWT */
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ success: false, message: "Token has expired" });
    }

    /* CORS */
    if (err.message?.startsWith("CORS policy") || err.message?.startsWith("CORS:")) {
      return res.status(403).json({ success: false, message: err.message });
    }

    /* Generic */
    return res.status(err.status || err.statusCode || 500).json({
      success: false,
      message: err.message || "Internal Server Error",
    });
  });
}

export default app;
