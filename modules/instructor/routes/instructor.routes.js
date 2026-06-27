/**
 * =========================================================
 * 🎓 INSTRUCTOR ROUTES (FINAL PRODUCTION 🔥)
 * =========================================================
 * Path: backend/modules/instructor/routes/instructor.routes.js
 * Base URL: /api/instructor
 *
 * ✅ FIX 1: Added video upload route — instructors now have
 *    an upload button on their dashboard.
 * ✅ FIX 2: Added section creation route.
 * ✅ FIX 3: All routes protected with JWT + role + access check.
 * ✅ FIX 4: One instructor can teach multiple courses simultaneously.
 * =========================================================
 */

import express from "express";
import { protect }              from "../../../shared/middleware/auth.middleware.js";
import { authorizeRoles }       from "../../../shared/middleware/role.middleware.js";
import { checkInstructorAccess } from "../../../shared/middleware/instructorAccess.middleware.js";
import { uploadVideo }          from "../../../shared/middleware/upload.middleware.js";

import {
  getDashboard,
  getInstructorCourses,
  submitCourseForApproval,
  getInstructorAnalytics,
  addSection,
  addVideo,
} from "../controllers/instructor.controller.js";

const router = express.Router();

/* ─────────────────────────────────────────
   🔐 GLOBAL MIDDLEWARE
   Every route below requires:
   1. Valid JWT token (protect)
   2. Role must be "instructor" (authorizeRoles)
   3. isInstructorActive must be true (checkInstructorAccess)
───────────────────────────────────────── */
router.use(protect);
router.use(authorizeRoles("instructor"));
router.use(checkInstructorAccess);

/* ═══════════════════════════════════════
   📊 DASHBOARD
   GET /api/instructor/dashboard
   Returns: instructor profile + all assigned/created courses + stats
═══════════════════════════════════════ */
router.get("/dashboard", getDashboard);

/* ═══════════════════════════════════════
   📚 MY COURSES (PAGINATED)
   GET /api/instructor/courses?page=1&limit=12&status=all
   Returns: all courses this instructor created or was assigned to
═══════════════════════════════════════ */
router.get("/courses", getInstructorCourses);

/* ═══════════════════════════════════════
   📊 ANALYTICS
   GET /api/instructor/analytics
═══════════════════════════════════════ */
router.get("/analytics", getInstructorAnalytics);

/* ═══════════════════════════════════════
   ➕ ADD SECTION TO COURSE
   POST /api/instructor/courses/:courseId/sections
   Body: { title, description }
═══════════════════════════════════════ */
router.post("/courses/:courseId/sections", addSection);

/* ═══════════════════════════════════════
   🎬 UPLOAD VIDEO TO SECTION  ← THIS ADDS THE UPLOAD BUTTON
   POST /api/instructor/courses/:courseId/sections/:sectionId/videos
   Body (multipart/form-data):
     - title        (required)
     - description  (optional)
     - isFreePreview (optional, default false)
     - video        (file — the video file)
═══════════════════════════════════════ */
router.post(
  "/courses/:courseId/sections/:sectionId/videos",
  uploadVideo,   /* multer middleware — handles S3 or local upload */
  addVideo
);

/* ═══════════════════════════════════════
   📤 SUBMIT COURSE FOR ADMIN APPROVAL
   PUT /api/instructor/submit/:courseId
   Moves course from "draft" → "pending"
   Requires at least 1 video uploaded
═══════════════════════════════════════ */
router.put("/submit/:courseId", submitCourseForApproval);

export default router;