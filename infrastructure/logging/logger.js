/**
 * =========================================================
 * 📊 LOGGER (FINAL PRODUCTION 🔥)
 * =========================================================
 * Path: backend/infrastructure/logging/logger.js
 *
 * Uses Winston for structured logging.
 * Logs to: console (dev) + error.log + combined.log (prod)
 *
 * SAFE BOOT: If winston is not installed, falls back to
 * console so the server still starts and shows you the
 * real error instead of crashing silently.
 *
 * Install winston: npm install winston
 * =========================================================
 */

import path            from "path";
import fs              from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/* ── Ensure logs/ directory exists ── */
const logsDir = path.join(__dirname, "../../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/* ─────────────────────────────────────────
   TRY TO USE WINSTON
   Falls back to console if not installed.
───────────────────────────────────────── */
let logger;
let morganStream;

try {
  const winston = (await import("winston")).default;

  const { combine, timestamp, printf, colorize, errors } = winston.format;

  /* ── Log format ── */
  const logFormat = printf(({ level, message, timestamp: ts, stack }) =>
    stack
      ? `[${ts}] ${level}: ${message}\n${stack}`
      : `[${ts}] ${level}: ${message}`
  );

  const devFormat = combine(
    colorize(),
    timestamp({ format: "HH:mm:ss" }),
    errors({ stack: true }),
    logFormat
  );

  const prodFormat = combine(
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    errors({ stack: true }),
    logFormat
  );

  const isProd = process.env.NODE_ENV === "production";

  /* ── Transports ── */
  const transports = [
    /* Always log to console */
    new winston.transports.Console({
      format: isProd ? prodFormat : devFormat,
      silent: false,
    }),
  ];

  /* In production also write to log files */
  if (isProd) {
    transports.push(
      new winston.transports.File({
        filename: path.join(logsDir, "error.log"),
        level:    "error",
        format:   prodFormat,
        maxsize:  10 * 1024 * 1024, // 10 MB
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: path.join(logsDir, "combined.log"),
        format:   prodFormat,
        maxsize:  10 * 1024 * 1024,
        maxFiles: 5,
      })
    );
  }

  /* ── Create logger instance ── */
  logger = winston.createLogger({
    level:       isProd ? "warn" : "info",
    transports,
    exitOnError: false,
  });

  /* ── Morgan stream — pipes HTTP logs into Winston ── */
  morganStream = {
    write: (message) => logger.info(message.trim()),
  };

} catch (err) {
  /* winston not installed — use console fallback */
  console.warn("⚠️  winston not installed — using console logger.");
  console.warn("    Fix: npm install winston");

  logger = {
    info:  (...a) => console.log("[INFO]",  ...a),
    warn:  (...a) => console.warn("[WARN]",  ...a),
    error: (...a) => console.error("[ERROR]", ...a),
    debug: (...a) => console.log("[DEBUG]", ...a),
  };

  morganStream = {
    write: (message) => console.log("[HTTP]", message.trim()),
  };
}

export { logger, morganStream };
export default logger;