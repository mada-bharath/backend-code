import express from "express";
const router = express.Router();

/* =========================================================
   🎮 CONTROLLERS
========================================================= */
import {
  createCourse,
  submitForApproval,
  getInstructorCourses,
  getCourseById,
  getCourses,
  getCourseLanguages,
  getCourseTags,
  assignInstructor,
  rateCourse,
  addSection,
  addVideo,
  deleteVideo,
  updateCourseStatus,
  getAllCourses,   // ✅ ADMIN LIST
  updateCourse,
} from "../controllers/course.controller.js";

/* =========================================================
   🔐 MIDDLEWARES
========================================================= */
import { protect } from "../../../shared/middleware/auth.middleware.js";
import { allowRoles } from "../../../shared/middleware/role.middleware.js";
import { checkCourseAccess } from "../../../shared/middleware/access.middleware.js";

import {
  uploadCourseFiles,
  handleUploadError,
} from "../../../shared/middleware/upload.middleware.js";

/* =========================================================
   🌐 PUBLIC ROUTES
========================================================= */

// 🌍 Public course list
router.get("/", getCourses);
router.get("/languages", getCourseLanguages);
router.get("/tags", getCourseTags);

/* =========================================================
   🔒 PROTECTED COURSE ACCESS (KEEP ABOVE :id ⚠️)
========================================================= */

router.get(
  "/:courseId/protected",
  protect,
  checkCourseAccess,
  getCourseById
);

router.post(
  "/:id/rating",
  protect,
  rateCourse
);

/* =========================================================
   👑 ADMIN ROUTES
========================================================= */

/**
 * ➕ CREATE COURSE (ADMIN)
 */
router.post(
  "/admin/create",
  protect,
  allowRoles("admin"),
  uploadCourseFiles,
  handleUploadError,
  createCourse
);

/**
 * 📦 GET ALL COURSES (ADMIN PANEL)
 * 👉 Uses getAllCourses (IMPORTANT FIX)
 */
router.get(
  "/admin/all",
  protect,
  allowRoles("admin"),
  getAllCourses
);

/**
 * ✏️ UPDATE COURSE
 */
router.put(
  "/admin/update/:id",
  protect,
  allowRoles("admin"),
  uploadCourseFiles,
  handleUploadError,
  updateCourse
);

/**
 * 👑 ASSIGN INSTRUCTOR
 */
router.put(
  "/admin/assign/:courseId",
  protect,
  allowRoles("admin"),
  assignInstructor
);

/**
 * 🔥 APPROVE / REJECT COURSE
 */
router.put(
  "/admin/status/:id",
  protect,
  allowRoles("admin"),
  updateCourseStatus
);

/**
 * 🛑 DELETE VIDEO (ADMIN OVERRIDE)
 */
router.delete(
  "/admin/video/:courseId/:sectionId/:videoId",
  protect,
  allowRoles("admin"),
  deleteVideo
);

/* =========================================================
   🎓 INSTRUCTOR ROUTES
========================================================= */

/**
 * ➕ CREATE COURSE (INSTRUCTOR)
 */
router.post(
  "/",
  protect,
  allowRoles("instructor"),
  uploadCourseFiles,
  handleUploadError,
  createCourse
);

/**
 * 📤 SUBMIT FOR APPROVAL
 */
router.put(
  "/submit/:id",
  protect,
  allowRoles("instructor"),
  submitForApproval
);

/**
 * 📚 GET INSTRUCTOR COURSES
 */
router.get(
  "/instructor",
  protect,
  allowRoles("instructor"),
  getInstructorCourses
);

/* =========================================================
   📚 SECTIONS + VIDEOS
========================================================= */

/**
 * ➕ ADD SECTION
 */
router.post(
  "/:courseId/section",
  protect,
  allowRoles("instructor"),
  addSection
);

/**
 * ➕ ADD VIDEO
 */
router.post(
  "/:courseId/section/:sectionId/video",
  protect,
  allowRoles("instructor"),
  addVideo
);

/* =========================================================
   📖 SINGLE COURSE (KEEP LAST ⚠️ CRITICAL)
========================================================= */

router.get("/:id", getCourseById);

/* =========================================================
   📦 EXPORT
========================================================= */
export default router;
