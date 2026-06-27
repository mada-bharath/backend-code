/**
 * =========================================================
 * 🔥 ROLE CONSTANTS (BACKEND - ESM FINAL 🔥)
 * =========================================================
 *
 * ✅ Fixed: module.exports error
 * ✅ ESM compatible
 * ✅ Works with middleware
 * ✅ Production ready
 *
 * =========================================================
 */

/* =========================================================
   🔥 ROLE CONSTANTS
========================================================= */
export const ROLES = {
  STUDENT: "student",
  INSTRUCTOR: "instructor",
  ADMIN: "admin",
};

/* =========================================================
   🔥 ROLE HIERARCHY
========================================================= */
export const ROLE_HIERARCHY = {
  student: 1,
  instructor: 2,
  admin: 3,
};

/* =========================================================
   🔥 HELPER FUNCTIONS
========================================================= */

// Normalize role
export const normalizeRole = (role) => {
  if (!role) return null;
  return role.toLowerCase();
};

// Validate role
export const isValidRole = (role) => {
  return Object.values(ROLES).includes(role);
};

// Check permission
export const hasPermission = (userRole, requiredRole) => {
  if (!userRole || !requiredRole) return false;

  return (
    ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
  );
};