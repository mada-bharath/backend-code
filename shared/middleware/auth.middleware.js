/**
 * =========================================================
 * 🔐 AUTH MIDDLEWARE (FINAL ENTERPRISE PRODUCTION 🔥)
 * =========================================================
 * Path: backend/shared/middleware/auth.middleware.js
 *
 * MERGED FROM:
 * ✅ Doc 26 (previous)     → instructor auto-expiry, optionalAuth,
 *                             requireActiveInstructor, Winston logger
 * ✅ Inline version (your VS Code) → safe token extractor helper,
 *                             cleaner JWT error messages, payload check
 *
 * EXPORTS:
 * ✅ protect                 — verifies JWT, attaches req.user
 * ✅ authorize(...roles)     — role-based guard (admin, instructor, student)
 * ✅ requireActiveInstructor — checks isInstructorActive + permissionExpiry
 * ✅ optionalAuth            — attaches user if token exists, continues if not
 * =========================================================
 */

import jwt    from "jsonwebtoken";
import User   from "../../modules/user/models/user.js";
import { logger } from "../../infrastructure/logging/logger.js";

/* ─────────────────────────────────────────
   🔑 TOKEN EXTRACTOR HELPER
   Reads "Bearer <token>" from Authorization header.
   Returns token string or null — never throws.
───────────────────────────────────────── */
const extractToken = (req) => {
  try {
    const authHeader = req.headers?.authorization;
    if (!authHeader)                        return null;
    if (authHeader.startsWith("Bearer "))   return authHeader.split(" ")[1] || null;
    return null;
  } catch {
    return null;
  }
};

/* ═══════════════════════════════════════
   🔐 PROTECT
   Verifies JWT and attaches req.user
   Used on ALL protected routes
═══════════════════════════════════════ */
export const protect = async (req, res, next) => {
  try {
    /* ── 1. Extract token ── */
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access denied. Please login to continue.",
      });
    }

    /* ── 2. Verify token ── */
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtErr) {
      /* Specific JWT error messages for frontend handling */
      if (jwtErr.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          message: "Session expired. Please login again.",
        });
      }
      if (jwtErr.name === "JsonWebTokenError") {
        return res.status(401).json({
          success: false,
          message: "Invalid token. Please login again.",
        });
      }
      return res.status(401).json({
        success: false,
        message: "Token verification failed. Please login again.",
      });
    }

    /* ── 3. Validate token payload ── */
    if (!decoded?.id) {
      return res.status(401).json({
        success: false,
        message: "Invalid token payload. Please login again.",
      });
    }

    /* ── 4. Fetch fresh user from DB ──
       Always fetch from DB (not from token) so:
       - Role changes take effect immediately
       - Blocked accounts are caught in real-time
       - Instructor expiry is always current */
    const user = await User.findById(decoded.id).select(
      "-password -passwordResetToken -passwordResetExpiry"
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Account not found. Please signup again.",
      });
    }

    /* ── 5. Blocked account check ── */
    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: "Your account has been suspended. Please contact support.",
      });
    }

    /* ── 6. Instructor auto-expiry check ──
       If instructor's permissionExpiry has passed → auto-deactivate.
       Uses findByIdAndUpdate to BYPASS pre-save bcrypt hook. */
    if (
      user.role === "instructor" &&
      user.isInstructorActive    &&
      user.permissionExpiry      &&
      new Date() > new Date(user.permissionExpiry)
    ) {
      await User.findByIdAndUpdate(user._id, {
        $set: { isInstructorActive: false, isExpired: true },
      });
      user.isInstructorActive = false;
      user.isExpired          = true;
      logger.warn(`⚠️ Instructor ${user.email} auto-expired — deactivated`);
    }

    /* ── 7. Attach to request ── */
    req.user = user;
    next();

  } catch (err) {
    logger.error(`❌ [AuthMiddleware] protect error: ${err.message}`);
    return res.status(500).json({
      success: false,
      message: "Authentication error. Please try again.",
    });
  }
};

/* ═══════════════════════════════════════
   👑 AUTHORIZE — role-based access control
   Usage:
     authorize("admin")
     authorize("admin", "instructor")
     router.use(protect, authorize("admin"))
═══════════════════════════════════════ */
export const authorize = (...roles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Not authenticated. Please login.",
        });
      }

      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Required: ${roles.join(" or ")}. Your role: ${req.user.role}`,
        });
      }

      next();
    } catch (err) {
      logger.error(`❌ [AuthMiddleware] authorize error: ${err.message}`);
      return res.status(500).json({
        success: false,
        message: "Authorization failed.",
      });
    }
  };
};

/* ═══════════════════════════════════════
   🎓 REQUIRE ACTIVE INSTRUCTOR
   Use on instructor-only upload/edit routes.
   Checks: role + isInstructorActive + permissionExpiry
   (protect must run BEFORE this middleware)
═══════════════════════════════════════ */
export const requireActiveInstructor = (req, res, next) => {
  try {
    const user = req.user;

    if (!user || user.role !== "instructor") {
      return res.status(403).json({
        success: false,
        message: "Instructor access required.",
      });
    }

    if (!user.isInstructorActive) {
      return res.status(403).json({
        success: false,
        message: "Your instructor account is inactive. Please contact admin.",
      });
    }

    if (user.permissionExpiry && new Date() > new Date(user.permissionExpiry)) {
      return res.status(403).json({
        success: false,
        message: "Your instructor permission has expired. Please contact admin to renew.",
      });
    }

    next();
  } catch (err) {
    logger.error(`❌ [AuthMiddleware] requireActiveInstructor error: ${err.message}`);
    return res.status(500).json({
      success: false,
      message: "Instructor check failed.",
    });
  }
};

/* ═══════════════════════════════════════
   🔓 OPTIONAL AUTH
   Attaches req.user if token is valid.
   Continues even if no token exists.
   Use on public routes that need to know
   if the user is logged in (e.g., course detail).
═══════════════════════════════════════ */
export const optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded?.id) {
      req.user = null;
      return next();
    }

    const user = await User.findById(decoded.id).select("-password");
    req.user   = user || null;

    next();
  } catch {
    /* Any error (expired, invalid) → just continue as unauthenticated */
    req.user = null;
    next();
  }
};