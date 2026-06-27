/**
 * =========================================================
 * 🎓 INSTRUCTOR ACCESS MIDDLEWARE (FINAL PRODUCTION 🔥)
 * =========================================================
 * Path: backend/shared/middleware/instructorAccess.middleware.js
 *
 * THIS FILE WAS MISSING — instructor.routes.js imports it:
 *   import { checkInstructorAccess } from
 *     "../../../shared/middleware/instructorAccess.middleware.js"
 *
 * Without this file the server crashes before ANY instructor
 * route loads — that's why the Upload button returns 500/404.
 *
 * What it does:
 * ✅ Checks user.isInstructorActive === true  (from users collection)
 * ✅ Checks user.permissionExpiry not passed
 * ✅ Auto-deactivates expired instructors
 * ✅ Uses findByIdAndUpdate to bypass bcrypt pre-save hook
 * ✅ Returns clear error messages so frontend shows correct UI
 *
 * IMPORTANT: Must run AFTER protect middleware (req.user attached)
 * =========================================================
 */

import User from "../../modules/user/models/user.js";

/**
 * checkInstructorAccess
 * ─────────────────────
 * Verifies the logged-in user is an active instructor
 * with a valid (non-expired) permission window.
 *
 * Used in instructor.routes.js:
 *   router.use(protect);
 *   router.use(authorizeRoles("instructor"));
 *   router.use(checkInstructorAccess);   ← this middleware
 */
export const checkInstructorAccess = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated. Please login.",
      });
    }

    /* ── Fetch fresh user from DB ──
       We need the latest isInstructorActive + permissionExpiry
       because req.user may be cached from the JWT issued earlier */
    const user = await User.findById(userId).select(
      "role isInstructorActive permissionExpiry isExpired email name"
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User account not found.",
      });
    }

    /* ── Role check ── */
    if (user.role !== "instructor") {
      return res.status(403).json({
        success: false,
        message: "Instructor access required.",
      });
    }

    /* ── Active check ── */
    if (!user.isInstructorActive) {
      return res.status(403).json({
        success: false,
        message:
          "Your instructor account is currently inactive. " +
          "Please contact admin to activate your account.",
      });
    }

    /* ── Expiry check ──
       If permissionExpiry is set and has passed → auto-deactivate */
    if (user.permissionExpiry && new Date() > new Date(user.permissionExpiry)) {
      /* Use findByIdAndUpdate to BYPASS the bcrypt pre-save hook */
      await User.findByIdAndUpdate(userId, {
        $set: { isInstructorActive: false, isExpired: true },
      });

      return res.status(403).json({
        success: false,
        message:
          "Your instructor permission has expired. " +
          "Please contact admin to renew your access.",
      });
    }

    /* ── All checks passed — attach enriched instructor info ── */
    req.instructorUser = user;
    next();

  } catch (err) {
    console.error("❌ [checkInstructorAccess] Error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Instructor access check failed. Please try again.",
    });
  }
};

/**
 * checkCourseUploadPermission
 * ───────────────────────────
 * Used on video upload routes to verify the instructor
 * is actually assigned to the specific course they're
 * trying to upload to.
 *
 * For SINGLE permission:  any section is allowed
 * For MULTIPLE permission: only their assigned section
 *
 * Usage:
 *   router.post(
 *     "/courses/:courseId/sections/:sectionId/videos",
 *     checkCourseUploadPermission,
 *     uploadVideo,
 *     addVideo
 *   );
 */
export const checkCourseUploadPermission = async (req, res, next) => {
  try {
    const userId    = req.user?._id?.toString() || req.user?.id?.toString();
    const courseId  = req.params.courseId;
    const sectionId = req.params.sectionId;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: "Course ID is required.",
      });
    }

    /* Lazy import to avoid circular deps */
    const Course = (await import("../../modules/course/models/course.model.js")).default;

    const course = await Course.findOne({ _id: courseId, isDeleted: false });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found.",
      });
    }

    /* Check if instructor is assigned to this course */
    const isCreator  = course.createdBy?.toString() === userId;
    const assignment = course.assignedInstructors?.find(
      (a) => a.instructor?.toString() === userId && a.isActive
    );

    if (!isCreator && !assignment) {
      return res.status(403).json({
        success: false,
        message:
          "You are not assigned to this course. " +
          "Contact admin to get assigned.",
      });
    }

    /* For MULTIPLE permission type — check section access */
    if (
      !isCreator &&
      assignment &&
      course.permissionType === "MULTIPLE" &&
      assignment.sectionId &&
      sectionId &&
      assignment.sectionId.toString() !== sectionId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: `You are only allowed to upload to your assigned module: ${
          assignment.moduleName || "your assigned section"
        }. Please contact admin to change your assignment.`,
      });
    }

    /* Attach course to request for use in controller */
    req.course = course;
    next();

  } catch (err) {
    console.error("❌ [checkCourseUploadPermission] Error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Course permission check failed.",
    });
  }
};