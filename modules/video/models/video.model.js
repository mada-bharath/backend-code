/**
 * =========================================================
 * 🎥 VIDEO ROUTES (FINAL PRODUCTION 🔥)
 * =========================================================
 *
 * ✅ Secure routes (auth required)
 * ✅ Role-based access (admin / instructor)
 * ✅ Upload + streaming + analytics
 * ✅ Clean REST structure
 * ✅ Scalable (enterprise ready)
 */

import express from "express";
const router = express.Router();

/* =========================================================
   🔐 MIDDLEWARES
========================================================= */
import { protect } from "../../../shared/middleware/auth.middleware.js";
import { authorizeRoles } from "../../../shared/middleware/role.middleware.js";

/* =========================================================
   🎮 CONTROLLERS
========================================================= */
import {
  getVideoById,
  getCourseVideos,
  uploadVideo,
  updateVideoStatus,
  deleteVideo,
  updateVideoDetails,
  incrementViews,
} from "../controllers/video.controller.js";

/* =========================================================
   🎥 VIDEO ACCESS ROUTES
========================================================= */

/**
 * 🎥 GET SINGLE VIDEO (SECURE 🔥)
 * GET /api/video/:courseId/sections/:sectionId/videos/:videoId
 */
router.get(
  "/:courseId/sections/:sectionId/videos/:videoId",
  protect,
  getVideoById
);

/**
 * 📚 GET ALL COURSE VIDEOS (FILTERED 🔥)
 * GET /api/video/:courseId/videos
 */
router.get(
  "/:courseId/videos",
  protect,
  getCourseVideos
);

/* =========================================================
   ⬆️ VIDEO UPLOAD (INSTRUCTOR)
========================================================= */

/**
 * 📤 UPLOAD VIDEO
 * POST /api/video/upload
 */
router.post(
  "/upload",
  protect,
  authorizeRoles("instructor", "admin"),
  uploadVideo
);

/* =========================================================
   ⚙️ VIDEO MANAGEMENT
========================================================= */

/**
 * ✏️ UPDATE VIDEO DETAILS
 */
router.put(
  "/:videoId",
  protect,
  authorizeRoles("instructor", "admin"),
  updateVideoDetails
);

/**
 * ❌ DELETE VIDEO
 */
router.delete(
  "/:videoId",
  protect,
  authorizeRoles("admin", "instructor"),
  deleteVideo
);

/* =========================================================
   🔥 STATUS CONTROL (ADMIN)
========================================================= */

/**
 * 🔄 UPDATE VIDEO STATUS (processing → ready)
 */
router.put(
  "/:videoId/status",
  protect,
  authorizeRoles("admin"),
  updateVideoStatus
);

/* =========================================================
   📊 ANALYTICS
========================================================= */

/**
 * 👁 INCREMENT VIEW COUNT
 */
router.post(
  "/:videoId/view",
  protect,
  incrementViews
);

/* =========================================================
   📦 EXPORT
========================================================= */
export default router;