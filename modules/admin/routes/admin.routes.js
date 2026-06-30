/**
 * =========================================================
 * 👑 ADMIN ROUTES (FINAL PRODUCTION 🔥)
 * =========================================================
 * Path: backend/modules/admin/routes/admin.routes.js
 *
 * This file merges both versions of admin.routes.js into one
 * conflict-free, production-ready file.
 *
 * ✅ FIX 1: All imports match EXACTLY what each controller exports
 * ✅ FIX 2: Route ordering — static paths BEFORE dynamic :id params
 *    - /instructors/invite   BEFORE  /instructors/:instructorId
 *    - /coupons/validate     BEFORE  /coupons/:id
 * ✅ FIX 3: updateUserRole uses findByIdAndUpdate (bypasses pre-save
 *    bcrypt hook → no more 500 errors on role change)
 * ✅ FIX 4: Both :instructorId and :id param names are supported
 *    in the controller via req.params.instructorId || req.params.id
 * =========================================================
 *
 * ⚠️  CHOOSE ONE AUTH IMPORT BLOCK BELOW and delete the other.
 *     Two different project structures are shown:
 *
 *   VERSION A — shared/middleware/auth.middleware.js
 *               exports: protect, authorize
 *
 *   VERSION B — auth/middleware/auth.middleware.js  +
 *               auth/middleware/role.middleware.js
 *               exports: protect | adminOnly
 *
 *   Uncomment the block that matches YOUR project.
 * =========================================================
 */

import express from "express";
const router = express.Router();

/* ─────────────────────────────────────────
   🔐 AUTH MIDDLEWARE
   ⚠️  Uncomment the ONE block that matches your project structure.
───────────────────────────────────────── */

/* --- VERSION A (single auth.middleware file) --- */
import {
  protect,
  authorize,
} from "../../../shared/middleware/auth.middleware.js";
const adminGuard = [protect, authorize("admin")];
import {
  requireAdminPage,
  requireAnyAdminPage,
} from "../../../shared/middleware/adminAccess.middleware.js";

/* --- VERSION B (separate auth + role middleware files) ---
import { protect }   from "../../auth/middleware/auth.middleware.js";
import { adminOnly } from "../../auth/middleware/role.middleware.js";
const adminGuard = [protect, adminOnly];
*/

/* ─────────────────────────────────────────
   CONTROLLERS
───────────────────────────────────────── */

/**
 * admin.controller.js (or dashboard.admin.controller.js)
 * Exports: getDashboardStats (or getAdminStats), deleteVideo,
 *          getCoupons, createCoupon, validateCoupon,
 *          deleteCoupon, sendNotification (or notifyAll)
 *
 * ⚠️  Uncomment the import block that matches YOUR project structure.
 */

/* --- VERSION A (monolithic admin.controller.js) --- */
import {
  getDashboardStats,
  deleteVideo,
  getCoupons,
  createCoupon,
  updateCoupon,
  validateCoupon,
  deleteCoupon,
  sendNotification,
  deleteOldNotifications,
} from "../controllers/admin.controller.js";

import {
  getAdminSiteSettings,
  updateAdminSiteSettings,
} from "../../site/controllers/siteSettings.controller.js";

/* --- VERSION B (split controllers) ---
import { getAdminStats }          from "../controllers/dashboard.admin.controller.js";
import { deleteVideo } from "../controllers/course.admin.controller.js";
import { getCoupons, createCoupon, deleteCoupon } from "../controllers/coupon.admin.controller.js";
import { notifyAll }              from "../controllers/notification.admin.controller.js";
// Then map to shared names below:
const getDashboardStats = getAdminStats;
const sendNotification  = notifyAll;
*/

/**
 * user.admin.controller.js
 * Exports: getUsers (or getAllUsers), updateUserRole, toggleUserBlock,
 *          getFreeUsers, giveFreeAccess, revokeFreeAccess, giveAccess
 */
import {
  getUsers,        // some projects export this as getAllUsers — change if needed
  getAdminAccessOptions,
  getAdminAccessUsers,
  updateAdminAccess,
  revokeAdminAccess,
  updateUserRole,
  toggleUserBlock,
  getFreeUsers,
  giveFreeAccess,
  revokeFreeAccess,
  giveAccess,
} from "../controllers/user.admin.controller.js";

/**
 * course.admin.controller.js
 * Exports: createCourse, getAllCourses, getCourseById,
 *          updateCourse, deleteCourse, updateCourseStatus
 */
import {
  createCourse,
  getAllCourses,
  getCourseById,
  updateCourse,
  deleteCourse,
  updateCourseStatus,
} from "../controllers/course.admin.controller.js";

/**
 * instructor.admin.controller.js  ← the merged controller file
 * Exports EVERYTHING — both old and new names — so either route
 * version works without any further changes.
 */
import {
  getAllInstructors,         // paginated + search (new)
  getInstructors,            // simple list alias (old)
  inviteInstructor,
  updateInstructorStatus,
  grantInstructor,
  toggleInstructorStatus,   // new name
  toggleInstructor,          // alias (old name)
  extendInstructorTime,     // new name
  extendInstructor,          // alias (old name)
  reactivateInstructor,
  revokeInstructorAccess,
  renewInstructor,
  assignCourseToInstructor, // new name
  assignCourse,              // alias (old name)
  assignModule,
} from "../controllers/instructor.admin.controller.js";

/* ── Upload middleware (for course thumbnail/brochure uploads) ── */
/* ⚠️  Uncomment the ONE import that matches YOUR project structure. */

/* VERSION A */
import { uploadCourseFiles } from "../../../shared/middleware/upload.middleware.js";
const courseUpload = uploadCourseFiles;

/* VERSION B ---
import { uploadCourseAssets } from "../../upload/middleware/upload.middleware.js";
const courseUpload = uploadCourseAssets;
*/

/* ─────────────────────────────────────────
   🔐 GLOBAL GUARD
   Every route below requires a valid JWT AND role === 'admin'
───────────────────────────────────────── */
router.use(...adminGuard);

/* ═══════════════════════════════════════════════
   DASHBOARD
   GET /api/admin/stats
═══════════════════════════════════════════════ */
router.get("/stats", requireAdminPage("dashboard"), getDashboardStats);

/* ═══════════════════════════════════════════════
   USER MANAGEMENT
   updateUserRole uses findByIdAndUpdate — bypasses
   the bcrypt pre-save hook (the 500-error fix).
═══════════════════════════════════════════════ */
router.get("/users",           requireAdminPage("users"), getUsers);
router.put("/users/:id/role",  requireAdminPage("users"), updateUserRole);    // ← 500 FIXED
router.put("/users/:id/block", requireAdminPage("users"), toggleUserBlock);

router.get("/admin-access/options",    requireAdminPage("admin-access"), getAdminAccessOptions);
router.get("/admin-access/users",      requireAdminPage("admin-access"), getAdminAccessUsers);
router.put("/admin-access/users/:id",  requireAdminPage("admin-access"), updateAdminAccess);
router.delete("/admin-access/users/:id", requireAdminPage("admin-access"), revokeAdminAccess);

router.get("/site-settings", requireAdminPage("site-settings"), getAdminSiteSettings);
router.put("/site-settings", requireAdminPage("site-settings"), updateAdminSiteSettings);

/* ═══════════════════════════════════════════════
   FREE ACCESS MANAGEMENT
═══════════════════════════════════════════════ */
router.get("/free-users",     requireAnyAdminPage(["free-users", "users"]), getFreeUsers);
router.post("/free-access",   requireAnyAdminPage(["free-users", "users"]), giveFreeAccess);
router.post("/revoke-access", requireAnyAdminPage(["free-users", "users"]), revokeFreeAccess);
router.post("/give-access",   requireAdminPage("users"), giveAccess);

/* ═══════════════════════════════════════════════
   INSTRUCTOR MANAGEMENT
   ⚠️  CRITICAL ORDER:
   Static string routes MUST come BEFORE /:instructorId
   If /:instructorId is first, Express reads "invite" as an ID.
═══════════════════════════════════════════════ */

/* ── Static routes (no :param) — must come first ── */
router.get("/instructors",                      requireAnyAdminPage(["instructors", "create-course"]), getAllInstructors);   // paginated list
router.post("/instructors/invite",              requireAdminPage("instructors"), inviteInstructor);
router.post("/instructors/assign-course",       requireAnyAdminPage(["instructors", "create-course"]), assignCourse);        // used by CreateCourse.jsx
router.put("/instructors/revoke",               requireAdminPage("instructors"), revokeInstructorAccess);
router.post("/instructors/renew",               requireAdminPage("instructors"), renewInstructor);

/* ── Dynamic :instructorId routes — must come after static ── */
router.put("/instructors/:instructorId/status",      requireAdminPage("instructors"), updateInstructorStatus);
router.put("/instructors/:instructorId/grant",        requireAdminPage("instructors"), grantInstructor);
router.patch("/instructors/:instructorId/toggle",     requireAdminPage("instructors"), toggleInstructorStatus);
router.patch("/instructors/:instructorId/extend",     requireAdminPage("instructors"), extendInstructorTime);
router.post("/instructors/:instructorId/reactivate",  requireAdminPage("instructors"), reactivateInstructor);
router.post("/instructors/:instructorId/assign",      requireAdminPage("instructors"), assignModule);

/* ═══════════════════════════════════════════════
   COURSE MANAGEMENT
═══════════════════════════════════════════════ */

/* ── Course CRUD ── */
router.post("/courses",            requireAdminPage("create-course"), courseUpload, createCourse);
router.get("/courses",             requireAnyAdminPage(["dashboard", "courses"]), getAllCourses);
router.get("/courses/:id",         requireAdminPage("courses"), getCourseById);
router.put("/courses/:id",         requireAdminPage("courses"), courseUpload, updateCourse);
router.delete("/courses/:id",      requireAdminPage("courses"), deleteCourse);
router.put("/courses/:id/status",  requireAnyAdminPage(["dashboard", "courses"]), updateCourseStatus);

/* ── Nested: delete a specific video inside a course section ── */
router.delete(
  "/courses/:courseId/sections/:sectionId/videos/:videoId",
  requireAdminPage("courses"),
  deleteVideo
);

/* ═══════════════════════════════════════════════
   COUPON MANAGEMENT
   ⚠️  /coupons/validate MUST come BEFORE /coupons/:id
   Without this, Express treats "validate" as the coupon :id.
═══════════════════════════════════════════════ */
router.post("/coupons/validate", requireAdminPage("coupons"), validateCoupon);   // ← static BEFORE /:id
router.get("/coupons",           requireAdminPage("coupons"), getCoupons);
router.post("/coupons",          requireAdminPage("coupons"), createCoupon);
router.put("/coupons/:id",       requireAdminPage("coupons"), updateCoupon);
router.delete("/coupons/:id",    requireAdminPage("coupons"), deleteCoupon);

/* ═══════════════════════════════════════════════
   NOTIFICATIONS
   POST /api/admin/notification  (VERSION A name)
   POST /api/admin/notify-all    (VERSION B name)
   Both are registered so either frontend call works.
═══════════════════════════════════════════════ */
router.post("/notification", requireAdminPage("notifications"), sendNotification);
router.post("/notify-all",   requireAdminPage("notifications"), sendNotification);
router.delete("/notifications/cleanup", requireAdminPage("notifications"), deleteOldNotifications);

export default router;
