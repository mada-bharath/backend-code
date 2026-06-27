/**
 * =========================================================
 * 🛡️ ROLE MIDDLEWARE (FINAL ENTERPRISE PRODUCTION 🔥)
 * =========================================================
 * Path: backend/shared/middleware/role.middleware.js
 *
 * MERGED FROM:
 * ✅ Doc 27 (your VS Code) → full set of role guards,
 *                             isOwner(), role hierarchy,
 *                             authorizeRoles alias,
 *                             isAdminOrInstructor,
 *                             centralized checkAuth helper
 * ✅ Inline version (previous) → allowRoles, adminOnly,
 *                                 instructorOnly, studentOnly
 *
 * RESULT — everything in one file, no duplication:
 * ✅ allowRoles(...roles)       — check exact role list (most used)
 * ✅ authorize(requiredRole)    — supports role hierarchy via roles.js
 * ✅ authorizeRoles             — backward-compat alias for allowRoles
 * ✅ isAdmin                    — admin-only guard
 * ✅ isInstructor               — instructor-only guard
 * ✅ isStudent                  — student-only guard
 * ✅ isAdminOrInstructor        — admin or instructor guard
 * ✅ isOwner(getResourceUserId) — ownership check with admin bypass
 * ✅ adminOnly                  — shorthand alias for isAdmin
 * ✅ instructorOnly             — shorthand alias for isAdminOrInstructor
 * ✅ studentOnly                — shorthand alias for isStudent
 * =========================================================
 */

/* ─────────────────────────────────────────
   🔥 SAFE ROLE PERMISSION LOADER
   Loads optional hasPermission() from roles.js
   Falls back to strict equality if file not found.
───────────────────────────────────────── */
let hasPermission;
try {
  const Roles = await import("../constants/roles.js");
  hasPermission =
    Roles?.hasPermission ||
    Roles?.default?.hasPermission ||
    null;
} catch {
  hasPermission = null;
}

/* Final fallback: strict equality (no hierarchy) */
if (typeof hasPermission !== "function") {
  hasPermission = (userRole, requiredRole) => userRole === requiredRole;
}

/* ─────────────────────────────────────────
   🔥 CENTRAL ERROR RESPONSE
───────────────────────────────────────── */
const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

/* ─────────────────────────────────────────
   🔐 AUTH VALIDATION HELPER
   Checks req.user is attached and has a role.
   Returns true and continues, or sends error.
───────────────────────────────────────── */
const checkAuth = (req, res) => {
  if (!req.user) {
    sendError(res, 401, "Unauthorized: Please login");
    return false;
  }
  if (!req.user.role) {
    sendError(res, 400, "User role missing from token");
    return false;
  }
  return true;
};

/* ═══════════════════════════════════════
   ✅ allowRoles(...roles)
   Most commonly used — checks if user's role
   is in the provided list.
   Case-insensitive comparison.

   Usage:
     router.use(protect, allowRoles("admin"))
     router.get("/x", protect, allowRoles("admin", "instructor"), handler)
═══════════════════════════════════════ */
export const allowRoles = (...roles) => (req, res, next) => {
  try {
    if (!checkAuth(req, res)) return;

    const userRole       = req.user.role.toLowerCase();
    const normalizedRoles = roles.map((r) => r.toLowerCase());

    if (!normalizedRoles.includes(userRole)) {
      return sendError(
        res,
        403,
        `Access denied. Allowed roles: ${roles.join(", ")}. Your role: ${req.user.role}`
      );
    }

    next();
  } catch (err) {
    return sendError(res, 500, "Authorization failed");
  }
};

/* ═══════════════════════════════════════
   ✅ authorize(requiredRole)
   Supports role HIERARCHY via roles.js
   hasPermission() function.
   Falls back to strict equality if roles.js
   is not configured.

   Usage:
     router.use(protect, authorize("admin"))
═══════════════════════════════════════ */
export const authorize = (requiredRole) => (req, res, next) => {
  try {
    if (!checkAuth(req, res)) return;

    const userRole = req.user.role;

    if (!hasPermission(userRole, requiredRole)) {
      return sendError(
        res,
        403,
        `Access denied. ${userRole} cannot access ${requiredRole} resources.`
      );
    }

    next();
  } catch (err) {
    return sendError(res, 500, "Authorization failed");
  }
};

/* ═══════════════════════════════════════
   👑 isAdmin
   Allows only: admin
═══════════════════════════════════════ */
export const isAdmin = (req, res, next) => {
  try {
    if (!checkAuth(req, res)) return;
    if (req.user.role !== "admin") return sendError(res, 403, "Admin access required");
    next();
  } catch {
    return sendError(res, 500, "Admin check failed");
  }
};

/* ═══════════════════════════════════════
   🎓 isInstructor
   Allows only: instructor
   (admin can use isAdminOrInstructor below)
═══════════════════════════════════════ */
export const isInstructor = (req, res, next) => {
  try {
    if (!checkAuth(req, res)) return;
    if (req.user.role !== "instructor") return sendError(res, 403, "Instructor access required");
    next();
  } catch {
    return sendError(res, 500, "Instructor check failed");
  }
};

/* ═══════════════════════════════════════
   👤 isStudent
   Allows only: student
═══════════════════════════════════════ */
export const isStudent = (req, res, next) => {
  try {
    if (!checkAuth(req, res)) return;
    if (req.user.role !== "student") return sendError(res, 403, "Student access required");
    next();
  } catch {
    return sendError(res, 500, "Student check failed");
  }
};

/* ═══════════════════════════════════════
   🔥 isAdminOrInstructor
   Allows: admin OR instructor
   Most instructor management routes use this.
═══════════════════════════════════════ */
export const isAdminOrInstructor = (req, res, next) => {
  try {
    if (!checkAuth(req, res)) return;
    if (!["admin", "instructor"].includes(req.user.role)) {
      return sendError(res, 403, "Admin or Instructor access required");
    }
    next();
  } catch {
    return sendError(res, 500, "Role check failed");
  }
};

/* ═══════════════════════════════════════
   🚀 isOwner(getResourceUserId)
   Checks if the logged-in user OWNS the resource.
   Admin always bypasses ownership check.

   Usage:
     router.delete(
       "/posts/:postId",
       protect,
       isOwner((req) => req.params.postId),
       deletePost
     );
═══════════════════════════════════════ */
export const isOwner = (getResourceUserId) => (req, res, next) => {
  try {
    if (!checkAuth(req, res)) return;

    const resourceUserId = getResourceUserId(req);

    if (!resourceUserId) return sendError(res, 400, "Resource owner not found");

    /* Admin bypass — admin can operate on any resource */
    if (req.user.role === "admin") return next();

    /* Normalize IDs for safe comparison */
    if (String(req.user._id) !== String(resourceUserId)) {
      return sendError(res, 403, "Access denied. You do not own this resource.");
    }

    next();
  } catch {
    return sendError(res, 500, "Ownership check failed");
  }
};

/* ─────────────────────────────────────────
   🔁 BACKWARD COMPATIBILITY ALIASES
   These allow older code that imports these
   names to continue working without changes.
───────────────────────────────────────── */

/** @alias allowRoles — older code may import authorizeRoles */
export const authorizeRoles = allowRoles;

/** @alias isAdmin — shorthand used in some route files */
export const adminOnly = isAdmin;

/** @alias isAdminOrInstructor — instructors + admin can upload */
export const instructorOnly = isAdminOrInstructor;

/** @alias isStudent */
export const studentOnly = isStudent;