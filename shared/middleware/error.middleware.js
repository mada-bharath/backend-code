/**
 * =========================================================
 * ❌ GLOBAL ERROR MIDDLEWARE (FINAL PRODUCTION 🔥)
 * =========================================================
 * Path: backend/shared/middleware/error.middleware.js
 *
 * Catches ALL errors thrown anywhere in the app.
 * Returns consistent JSON error responses.
 * =========================================================
 */

import { logger } from "../../infrastructure/logging/logger.js";

export const errorMiddleware = (err, req, res, next) => {
  let statusCode = err.statusCode || err.status || 500;
  let message    = err.message    || "Internal Server Error";

  /* ── Mongoose validation error ── */
  if (err.name === "ValidationError") {
    statusCode = 400;
    const errors = Object.values(err.errors).map((e) => e.message);
    message = errors.join(". ");
  }

  /* ── Mongoose duplicate key error ── */
  if (err.code === 11000) {
    statusCode = 400;
    const field = Object.keys(err.keyValue || {})[0] || "field";
    message = `${field} already exists. Please use a different value.`;
  }

  /* ── Mongoose CastError (invalid ObjectId) ── */
  if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  }

  /* ── JWT errors ── */
  if (err.name === "JsonWebTokenError")  { statusCode = 401; message = "Invalid token"; }
  if (err.name === "TokenExpiredError")  { statusCode = 401; message = "Token expired. Please login again."; }

  /* ── Log ALL errors ── */
  if (statusCode >= 500) {
    logger.error(`💥 ${req.method} ${req.originalUrl} → ${statusCode}: ${message}`);
    if (err.stack) logger.error(err.stack);
  } else {
    logger.warn(`⚠️ ${req.method} ${req.originalUrl} → ${statusCode}: ${message}`);
  }

  /* ── Consistent response shape ── */
  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
};