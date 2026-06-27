/**
 * =========================================================
 * 🎬 MEDIA ROUTES (FINAL PRODUCTION 🔥)
 * =========================================================
 * Path: backend/modules/media/routes/media.routes.js
 *
 * Mount in app.js: app.use("/api/media", mediaRoutes)
 *
 * GET  /api/media/course/:courseId              → course player data
 * GET  /api/media/video/:courseId/:sectionId/:videoId → single video
 * PUT  /api/media/video/:courseId/:sectionId/:videoId → update metadata
 * GET  /api/media/instructor/course/:courseId   → instructor course detail
 * =========================================================
 */

import express from "express";
const router = express.Router();

import {
  protect,
  authorize,
  optionalAuth,
} from "../../../shared/middleware/auth.middleware.js";

import {
  getCoursePlayer,
  getVideo,
  updateVideoMeta,
  getInstructorCourseDetail,
} from "../controllers/media.controller.js";

/* Public — no auth needed (free previews work without login) */
router.get("/course/:courseId", optionalAuth, getCoursePlayer);

/* Protected — need login to check purchase access */
router.get(
  "/video/:courseId/:sectionId/:videoId",
  protect,
  getVideo
);

/* Instructor / Admin — edit video metadata */
router.put(
  "/video/:courseId/:sectionId/:videoId",
  protect,
  authorize("instructor", "admin"),
  updateVideoMeta
);

/* Instructor course detail (for editor page) */
router.get(
  "/instructor/course/:courseId",
  protect,
  authorize("instructor", "admin"),
  getInstructorCourseDetail
);

export default router;
