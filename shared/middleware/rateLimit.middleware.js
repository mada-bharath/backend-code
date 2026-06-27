/**
 * =========================================================
 * 🚦 RATE LIMIT MIDDLEWARE (FINAL PRODUCTION 🔥)
 * =========================================================
 * Path: backend/shared/middleware/rateLimit.middleware.js
 * =========================================================
 */

import rateLimit from "express-rate-limit";
import { logger } from "../../infrastructure/logging/logger.js";

/* ── Global API rate limit ── */
export const rateLimitMiddleware = rateLimit({
  windowMs:         60 * 1000,  // 1 minute
  max:              100,         // 100 requests per minute per IP
  standardHeaders:  true,
  legacyHeaders:    false,
  message: {
    success: false,
    message: "Too many requests. Please slow down and try again in a minute.",
  },
  handler: (req, res, next, options) => {
    logger.warn(`🚦 Rate limit exceeded: ${req.ip} → ${req.originalUrl}`);
    res.status(429).json(options.message);
  },
});

/* ── Auth-specific (stricter) ── */
export const authRateLimit = rateLimit({
  windowMs:  15 * 60 * 1000,  // 15 minutes
  max:        10,               // 10 auth attempts per 15 min
  message: {
    success: false,
    message: "Too many login attempts. Please wait 15 minutes before trying again.",
  },
  handler: (req, res, next, options) => {
    logger.warn(`🔐 Auth rate limit exceeded: ${req.ip}`);
    res.status(429).json(options.message);
  },
});

/* ── OTP-specific ── */
export const otpRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,   // 5 minutes
  max:       3,                // 3 OTP requests per 5 min
  message: {
    success: false,
    message: "Too many OTP requests. Please wait 5 minutes.",
  },
});

/* ── Upload-specific ── */
export const uploadRateLimit = rateLimit({
  windowMs:  60 * 60 * 1000, // 1 hour
  max:        50,              // 50 uploads per hour
  message: {
    success: false,
    message: "Upload limit reached. Please try again in an hour.",
  },
});