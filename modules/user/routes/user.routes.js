/**
 * =========================================================
 * 👤 USER ROUTES (FINAL PRODUCTION 🔥)
 * =========================================================
 * Path: backend/modules/user/routes/user.routes.js
 *
 * MERGED from two versions:
 *
 * From user.routes.js (v2 — clean, no express-validator):
 * ✅ GET  /api/users/me            → getMe
 * ✅ PUT  /api/users/me            → updateMe
 * ✅ PUT  /api/users/me/password   → changePassword
 * ✅ GET  /api/users/me/courses    → getMyCourses
 *
 * From old admin.routes.js (v1 — had these user sub-routes):
 * ✅ GET    /api/users             → getAllUsers   (admin only)
 * ✅ PATCH  /api/users/:userId/role → updateUserRole (admin only)
 * ✅ POST   /api/users/grant-free  → grantFreeAccess (admin only)
 * ✅ DELETE /api/users/:userId/revoke → revokeAccess (admin only)
 *
 * FIX: Removed express-validator entirely.
 *      All validation is in the controller with plain JS.
 *      No breaking changes — route paths unchanged.
 *
 * ⚠️  ROUTE ORDER:
 *   Static paths BEFORE :param paths.
 *   /me/courses   BEFORE  /:userId
 *   /me/password  BEFORE  /:userId
 *   /grant-free   BEFORE  /:userId/role
 * =========================================================
 */

import express from "express";
const router = express.Router();

import {
  protect,
  authorize,
} from "../../../shared/middleware/auth.middleware.js";

import {
  /* User-facing */
  getMe,
  updateMe,
  changePassword,
  getMyCourses,

  /* Admin-facing (also exported from user.admin.controller.js
     but kept here so this file is self-contained) */
  getAllUsers,
  updateUserRole,
  grantFreeAccess,
  revokeAccess,
} from "../controllers/user.controller.js";

/* ─────────────────────────────────────────
   👤 USER ROUTES — any authenticated role
   All require: protect
───────────────────────────────────────── */

/* GET  /api/users/me */
router.get("/me",          protect, getMe);

/* PUT  /api/users/me */
router.put("/me",          protect, updateMe);

/* PUT  /api/users/me/password  ← STATIC — before /:userId */
router.put("/me/password", protect, changePassword);

/* GET  /api/users/me/courses   ← STATIC — before /:userId */
router.get("/me/courses",  protect, getMyCourses);

/* ─────────────────────────────────────────
   👑 ADMIN ROUTES — require admin role
   Static paths BEFORE dynamic :userId param
───────────────────────────────────────── */

/* GET  /api/users  — paginated list of all users */
router.get(
  "/",
  protect,
  authorize("admin"),
  getAllUsers
);

/* POST /api/users/grant-free  ← STATIC — before /:userId */
router.post(
  "/grant-free",
  protect,
  authorize("admin"),
  grantFreeAccess
);

/* PATCH /api/users/:userId/role  ← DYNAMIC */
router.patch(
  "/:userId/role",
  protect,
  authorize("admin"),
  updateUserRole
);

/* DELETE /api/users/:userId/revoke */
router.delete(
  "/:userId/revoke",
  protect,
  authorize("admin"),
  revokeAccess
);

export default router;