/**
 * =========================================================
 * 📤 UPLOAD ROUTES (FINAL PRODUCTION 🔥)
 * =========================================================
 * Path: backend/modules/media/routes/upload.routes.js
 *
 * Mount in app.js as: app.use("/api/upload", uploadRoutes)
 *
 * Routes:
 * POST   /api/upload/presigned-url              → get S3 presigned URL
 * POST   /api/upload/confirm                    → confirm + save to DB
 * DELETE /api/upload/video/:courseId/:sectionId/:videoId → delete
 * GET    /api/upload/courses/:courseId/videos   → list all videos
 *
 * NO multer here — files go DIRECTLY to S3, not through server.
 * =========================================================
 */

import express from "express";
const router = express.Router();

import {
  protect,
  authorize,
} from "../../../shared/middleware/auth.middleware.js";

import {
  getPresignedUrl,
  confirmUpload,
  deleteVideo,
  getCourseVideoList,
} from "../controllers/upload.controller.js";

/* ─────────────────────────────────────────
   ALL ROUTES REQUIRE AUTHENTICATION
───────────────────────────────────────── */
router.use(protect);

/* ── Instructor + Admin routes ── */

/* POST /api/upload/presigned-url */
router.post(
  "/presigned-url",
  authorize("instructor", "admin"),
  getPresignedUrl
);

/* POST /api/upload/confirm */
router.post(
  "/confirm",
  authorize("instructor", "admin"),
  confirmUpload
);

/* GET /api/upload/courses/:courseId/videos */
router.get(
  "/courses/:courseId/videos",
  authorize("instructor", "admin"),
  getCourseVideoList
);

/* DELETE /api/upload/video/:courseId/:sectionId/:videoId */
router.delete(
  "/video/:courseId/:sectionId/:videoId",
  authorize("instructor", "admin"),
  deleteVideo
);

export default router;