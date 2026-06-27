/**
 * =========================================================
 * 💳 PURCHASE ROUTES (FINAL PRODUCTION 🔥)
 * =========================================================
 * Path: backend/modules/purchase/routes/purchase.routes.js
 *
 * Base URL: /api/purchases   (mounted in server.js)
 *
 * ✅ All imports now match exact named exports from
 *    purchase.controller.js (ES Module export const)
 * ✅ All routes protected with JWT middleware
 * =========================================================
 */

import express from "express";

import { protect } from "../../../shared/middleware/auth.middleware.js";

import {
  purchaseCourse,
  getMyCourses,
  checkCourseAccess,
  getPurchaseHistory,
} from "../controllers/purchase.controller.js";

const router = express.Router();

/* ─────────────────────────────────────────
   All purchase routes require login
───────────────────────────────────────── */
router.use(protect);

/* ═══════════════════════════════════════
   POST /api/purchases
   Create a new course purchase
   Body: { courseId }
═══════════════════════════════════════ */
router.post("/", purchaseCourse);

/* ═══════════════════════════════════════
   GET /api/purchases/my-courses
   Get all purchased courses for logged-in user
   Used by: MyCourses.jsx (student dashboard)
═══════════════════════════════════════ */
router.get("/my-courses", getMyCourses);

/* ═══════════════════════════════════════
   GET /api/purchases/history
   Full paginated purchase history
   Used by: PurchaseHistory.jsx
   Query: ?page=1&limit=10
═══════════════════════════════════════ */
router.get("/history", getPurchaseHistory);

/* ═══════════════════════════════════════
   GET /api/purchases/access/:courseId
   Check if user has access to a course
   Used by: CoursePlayer.jsx before showing video
   ⚠️  Must come AFTER /my-courses and /history
       to prevent "my-courses"/"history" being
       treated as :courseId
═══════════════════════════════════════ */
router.get("/access/:courseId", checkCourseAccess);

export default router;