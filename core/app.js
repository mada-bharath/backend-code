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
import siteSettingsRoutes from "../modules/site/routes/siteSettings.routes.js";
import {
  getSiteSettingsDocument,
  POLICY_PATH_TO_TYPE,
} from "../modules/site/models/siteSettings.model.js";

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
const SITE_URL = (process.env.SITE_URL || FRONTEND_URL || "https://bharathvidya.com").replace(/\/$/, "");

const publicPages = [
  {
    path: "/",
    label: "Home",
    title: "Bharath Vidya - Online Courses and Learner Portal",
    description: "Learn programming, technology and career skills online with Bharath Vidya.",
    heading: "Bharath Vidya",
    eyebrow: "Online learning",
    body: "Build practical skills through online courses, guided lessons, study materials, and a secure learner portal.",
    actionLabel: "Login",
    actionHref: "/login",
  },
  {
    path: "/courses",
    label: "Courses",
    title: "Courses - Bharath Vidya",
    description: "Explore Bharath Vidya courses and sign in to access your enrolled learning materials.",
    heading: "Courses",
    eyebrow: "Learn online",
    body: "Browse Bharath Vidya course access and sign in to continue lessons, videos, materials, and progress tracking.",
    actionLabel: "Go to Login",
    actionHref: "/login",
  },
  {
    path: "/login",
    label: "Login",
    title: "Login - Bharath Vidya",
    description: "Login to the Bharath Vidya learner portal to access courses, videos, materials, and progress.",
  },
  {
    path: "/contact",
    label: "Contact",
    title: "Contact - Bharath Vidya",
    description: "Contact Bharath Vidya for course access, learner support, and account help.",
    heading: "Contact Bharath Vidya",
    eyebrow: "Support",
    body: "Need help with course access or your learner account? Contact the Bharath Vidya team for support.",
    actionLabel: "Login",
    actionHref: "/login",
  },
  {
    path: "/about",
    label: "About",
    title: "About - Bharath Vidya",
    description: "Learn about Bharath Vidya, an online learning platform for technology and career skills.",
    heading: "About Bharath Vidya",
    eyebrow: "Our platform",
    body: "Bharath Vidya helps learners access structured online courses, study materials, course videos, and progress tools.",
    actionLabel: "View Courses",
    actionHref: "/courses",
  },
];

const legalPages = [
  {
    path: "/terms-and-conditions",
    title: "Terms and Conditions - Bharath Vidya",
  },
  {
    path: "/refund-and-return-policy",
    title: "Refund and Return Policy - Bharath Vidya",
  },
  {
    path: "/privacy-policy",
    title: "Privacy Policy - Bharath Vidya",
  },
];

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const getCanonicalUrl = (pagePath) => `${SITE_URL}${pagePath === "/" ? "/" : pagePath}`;

const renderTextBlocks = (text = "") => {
  const blocks = String(text || "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (!blocks.length) {
    return "<p>This content will be updated by the Bharath Vidya admin.</p>";
  }

  return blocks
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
};

const renderPublicFooterLink = (link = {}) =>
  `<a href="${escapeHtml(link.href || "#")}">${escapeHtml(link.label || "")}</a>`;

const renderPublicFooter = (settings = {}) => {
  const resources = settings.resources?.length ? settings.resources : [
    { label: "Courses", href: "/courses" },
    { label: "My Courses", href: "/learner" },
    { label: "Discussion", href: "/learner#discussion" },
    { label: "Wishlist", href: "/learner#wishlist" },
    { label: "Level Up", href: "/learner#level-up" },
  ];
  const supportLinks = settings.supportLinks?.length ? settings.supportLinks : [
    { label: "Contact Us", href: "/contact" },
    { label: "Terms and Conditions", href: "/terms-and-conditions" },
    { label: "Refund and Return Policy", href: "/refund-and-return-policy" },
    { label: "Privacy Policy", href: "/privacy-policy" },
  ];
  const emails = (settings.emails || []).map((email) =>
    `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`
  );
  const phones = (settings.phones || []).map((phone) =>
    `<a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a>`
  );

  return `<footer class="public-footer" aria-label="Footer">
    <div>
      <h2>${escapeHtml(settings.brandName || "Bharath Vidya")}</h2>
      <p>${escapeHtml(settings.footerDescription || "Bharath Vidya provides practical online courses and learning support.")}</p>
    </div>
    <div>
      <h3>Resources</h3>
      <nav>${resources.map(renderPublicFooterLink).join("")}</nav>
    </div>
    <div>
      <h3>Support</h3>
      <nav>${supportLinks.map(renderPublicFooterLink).join("")}</nav>
    </div>
    <div>
      <h3>Contact</h3>
      <nav>${[...emails, ...phones].join("") || "<span>Contact details will be updated soon.</span>"}</nav>
    </div>
  </footer>`;
};

const publicFooterStyles = `
      .public-footer { margin: 18px clamp(18px, 5vw, 72px) 22px; background: #111827; color: #f8fafc; border-radius: 8px; padding: 18px; display: grid; grid-template-columns: minmax(220px, 1.4fr) minmax(120px, 0.7fr) minmax(170px, 0.9fr) minmax(170px, 0.9fr); gap: 18px; align-items: start; }
      .public-footer h2, .public-footer h3 { margin: 0; letter-spacing: 0; }
      .public-footer h2 { font-size: 1rem; }
      .public-footer h3 { font-size: 0.82rem; text-transform: uppercase; color: #c9d6e7; }
      .public-footer p, .public-footer a, .public-footer span { color: #c9d6e7; font-size: 0.88rem; line-height: 1.5; }
      .public-footer p { margin: 8px 0 0; }
      .public-footer nav { display: grid; gap: 7px; margin-top: 10px; }
      .public-footer a { text-decoration: none; }
      .public-footer a:hover { color: #fff; }
      @media (max-width: 900px) { .public-footer { grid-template-columns: 1fr 1fr; } }
      @media (max-width: 620px) { .public-footer { grid-template-columns: 1fr; } }
`;

const renderContentPage = ({
  pagePath,
  title,
  description,
  eyebrow,
  heading,
  bodyHtml,
  footerSettings,
}) => {
  const canonicalUrl = getCanonicalUrl(pagePath);
  const nav = publicPages
    .map((item) => `<a href="${item.path}"${item.path === pagePath ? ' aria-current="page"' : ""}>${escapeHtml(item.label)}</a>`)
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${canonicalUrl}">
    <style>
      :root { color-scheme: light; --ink: #172033; --muted: #5d6a7c; --line: #d9e1ea; --teal: #0f766e; --bg: #f6f8fb; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); background: var(--bg); }
      header { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 20px clamp(18px, 5vw, 72px); background: #fff; border-bottom: 1px solid var(--line); }
      .brand { font-weight: 800; color: var(--ink); text-decoration: none; }
      nav { display: flex; flex-wrap: wrap; gap: 12px; }
      nav a { color: var(--muted); text-decoration: none; font-weight: 700; }
      nav a[aria-current="page"], nav a:hover { color: var(--teal); }
      main { min-height: calc(100vh - 77px); padding: 52px clamp(18px, 6vw, 96px); }
      article { max-width: 860px; }
      .eyebrow { color: var(--teal); font-size: 0.82rem; font-weight: 800; text-transform: uppercase; margin: 0 0 10px; }
      h1 { margin: 0 0 22px; font-size: clamp(2rem, 6vw, 3.6rem); line-height: 1.08; letter-spacing: 0; }
      .body { background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: clamp(20px, 4vw, 34px); line-height: 1.75; color: var(--ink); }
      .body p { margin: 0 0 16px; }
      .body p:last-child { margin-bottom: 0; }
      .contact-list { display: grid; gap: 10px; margin-top: 18px; }
      .contact-list a, .contact-list span { color: var(--ink); font-weight: 800; }
${publicFooterStyles}
      @media (max-width: 680px) { header { align-items: flex-start; flex-direction: column; } }
    </style>
  </head>
  <body>
    <header>
      <a class="brand" href="/">Bharath Vidya</a>
      <nav aria-label="Primary">${nav}</nav>
    </header>
    <main>
      <article>
        <p class="eyebrow">${escapeHtml(eyebrow)}</p>
        <h1>${escapeHtml(heading)}</h1>
        <div class="body">${bodyHtml}</div>
      </article>
    </main>
    ${renderPublicFooter(footerSettings)}
  </body>
</html>`;
};

const renderPublicPage = (page, footerSettings) => {
  const canonicalUrl = getCanonicalUrl(page.path);
  const nav = publicPages
    .map((item) => `<a href="${item.path}"${item.path === page.path ? ' aria-current="page"' : ""}>${escapeHtml(item.label)}</a>`)
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(page.title)}</title>
    <meta name="description" content="${escapeHtml(page.description)}">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${canonicalUrl}">
    <meta property="og:site_name" content="Bharath Vidya">
    <meta property="og:title" content="${escapeHtml(page.title)}">
    <meta property="og:description" content="${escapeHtml(page.description)}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${canonicalUrl}">
    <script type="application/ld+json">
      ${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "EducationalOrganization",
        name: "Bharath Vidya",
        url: SITE_URL,
        description: "Bharath Vidya provides online courses, course videos, study materials, and learner progress tools.",
      })}
    </script>
    <style>
      :root { color-scheme: light; --ink: #172033; --muted: #5d6a7c; --line: #d9e1ea; --teal: #0f766e; --bg: #f6f8fb; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); background: var(--bg); }
      header { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 20px clamp(18px, 5vw, 72px); background: #fff; border-bottom: 1px solid var(--line); }
      .brand { font-weight: 800; color: var(--ink); text-decoration: none; }
      nav { display: flex; flex-wrap: wrap; gap: 12px; }
      nav a { color: var(--muted); text-decoration: none; font-weight: 700; }
      nav a[aria-current="page"], nav a:hover { color: var(--teal); }
      main { min-height: calc(100vh - 220px); display: grid; align-items: center; padding: 52px clamp(18px, 6vw, 96px) 34px; }
      section { max-width: 760px; }
      p.eyebrow { color: var(--teal); font-size: 0.82rem; font-weight: 800; text-transform: uppercase; margin: 0 0 10px; }
      h1 { margin: 0; font-size: clamp(2.2rem, 7vw, 4.9rem); line-height: 1; letter-spacing: 0; }
      p.body { margin: 22px 0 0; color: var(--muted); font-size: clamp(1rem, 2vw, 1.25rem); line-height: 1.65; max-width: 640px; }
      .actions { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 30px; }
      .button { display: inline-flex; align-items: center; justify-content: center; min-height: 46px; padding: 0 18px; border-radius: 8px; background: var(--teal); color: #fff; text-decoration: none; font-weight: 800; }
      .button.secondary { background: #fff; color: var(--ink); border: 1px solid var(--line); }
${publicFooterStyles}
      @media (max-width: 680px) { header { align-items: flex-start; flex-direction: column; } main { align-items: start; } }
    </style>
  </head>
  <body>
    <header>
      <a class="brand" href="/">Bharath Vidya</a>
      <nav aria-label="Primary">${nav}</nav>
    </header>
    <main>
      <section>
        <p class="eyebrow">${escapeHtml(page.eyebrow)}</p>
        <h1>${escapeHtml(page.heading)}</h1>
        <p class="body">${escapeHtml(page.body)}</p>
        <div class="actions">
          <a class="button" href="${page.actionHref}">${escapeHtml(page.actionLabel)}</a>
          <a class="button secondary" href="/courses">Courses</a>
        </div>
      </section>
    </main>
    ${renderPublicFooter(footerSettings)}
  </body>
</html>`;
};

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
  "https://bharathvidya.com",
  "https://www.bharathvidya.com",
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

app.get("/robots.txt", (req, res) => {
  res
    .type("text/plain")
    .send(`User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
});

app.get("/sitemap.xml", (req, res) => {
  const lastModified = new Date().toISOString();
  const urls = [...publicPages, ...legalPages]
    .map((page) => `  <url>
    <loc>${getCanonicalUrl(page.path)}</loc>
    <lastmod>${lastModified}</lastmod>
  </url>`)
    .join("\n");

  res
    .type("application/xml")
    .send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`);
});

const sendLearnerApp = (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
};

app.get(["/login", "/learner"], sendLearnerApp);

app.get("/contact", async (req, res, next) => {
  try {
    const settings = await getSiteSettingsDocument();
    const emails = (settings.emails || [])
      .map((email) => `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`)
      .join("");
    const phones = (settings.phones || [])
      .map((phone) => `<a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a>`)
      .join("");
    const contactRows = [
      emails ? `<div><strong>Email</strong><div class="contact-list">${emails}</div></div>` : "",
      phones ? `<div><strong>Phone</strong><div class="contact-list">${phones}</div></div>` : "",
    ].filter(Boolean).join("");

    res.type("html").send(renderContentPage({
      pagePath: "/contact",
      title: "Contact - Bharath Vidya",
      description: "Contact Bharath Vidya for course access, learner support, and account help.",
      eyebrow: "Support",
      heading: "Contact Us",
      bodyHtml: `
        <p>${escapeHtml(settings.footerDescription || "Contact Bharath Vidya for learner support.")}</p>
        ${contactRows || "<p>Contact details will be updated by the Bharath Vidya admin.</p>"}
      `,
      footerSettings: settings,
    }));
  } catch (error) {
    next(error);
  }
});

for (const page of legalPages) {
  app.get(page.path, async (req, res, next) => {
    try {
      const type = POLICY_PATH_TO_TYPE[page.path];
      const settings = await getSiteSettingsDocument();
      const policy = settings.policies?.[type] || {};
      res.type("html").send(renderContentPage({
        pagePath: page.path,
        title: page.title,
        description: `${policy.title || page.title} for Bharath Vidya learners.`,
        eyebrow: "Policy",
        heading: policy.title || page.title.replace(" - Bharath Vidya", ""),
        bodyHtml: renderTextBlocks(policy.content),
        footerSettings: settings,
      }));
    } catch (error) {
      next(error);
    }
  });
}

for (const page of publicPages.filter((page) => page.path !== "/login" && page.path !== "/contact")) {
  app.get(page.path, async (req, res, next) => {
    try {
      const settings = await getSiteSettingsDocument();
      res.type("html").send(renderPublicPage(page, settings));
    } catch (error) {
      next(error);
    }
  });
}

/* ─────────────────────────────────────────
   🛣️ API ROUTES
───────────────────────────────────────── */
app.get("/api", (req, res) => {
  res.status(200).json({ success: true, message: "BharathVidya API Running" });
});

app.use("/api/auth",          authRoutes);
app.use("/api/site-settings", siteSettingsRoutes);
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
