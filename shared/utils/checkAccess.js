/**
 * =========================================================
 * 🔐 CENTRAL ACCESS CONTROL ENGINE (FINAL PRODUCTION)
 * =========================================================
 *
 * 👉 THIS FILE CONTROLS:
 * - Instructor upload permissions
 * - Student video access
 * - Admin override
 * - Module assignment rules
 *
 * 🚨 RULE: NEVER duplicate logic elsewhere
 * Always use these functions
 */

/**
 * =========================================================
 * 🟢 HELPER: CHECK DATE VALIDITY
 * =========================================================
 */
const isDateValid = (date) => {
  if (!date) return true; // no expiry = valid
  return new Date(date) > new Date();
};

/**
 * =========================================================
 * 🟢 HELPER: SAFE OBJECT ID COMPARISON
 * =========================================================
 */
const isSameId = (id1, id2) => {
  if (!id1 || !id2) return false;
  return id1.toString() === id2.toString();
};

/**
 * =========================================================
 * 🔥 CORE RULE: CAN INSTRUCTOR UPLOAD VIDEO
 * =========================================================
 *
 * CONDITIONS:
 * 1. Role must be instructor
 * 2. Instructor must be active
 * 3. Permission must not be expired
 * 4. Must be assigned to module
 * 5. Module must be active
 */
exports.canInstructorUpload = (instructor, course, moduleId) => {
  try {
    if (!instructor || !course) return false;

    // ✅ Admin override (IMPORTANT)
    if (instructor.role === "admin") return true;

    // ❌ Not instructor
    if (instructor.role !== "instructor") return false;

    // ❌ Not active
    if (!instructor.isInstructorActive) return false;

    // ❌ Permission expired
    if (!isDateValid(instructor.permissionExpiry)) return false;

    // ❌ No modules
    if (!course.modules || course.modules.length === 0) return false;

    // Find module
    const module = course.modules.id(moduleId);
    if (!module) return false;

    // ❌ Module inactive
    if (!module.isActive) return false;

    // ❌ Not assigned to this module
    if (!isSameId(module.assignedInstructor, instructor._id)) return false;

    return true;
  } catch (error) {
    console.error("canInstructorUpload error:", error.message);
    return false;
  }
};

/**
 * =========================================================
 * 🔥 CORE RULE: CAN INSTRUCTOR EDIT VIDEO
 * =========================================================
 *
 * Same rules as upload
 */
exports.canInstructorEdit = (instructor, course, moduleId) => {
  return exports.canInstructorUpload(instructor, course, moduleId);
};

/**
 * =========================================================
 * 🔥 CORE RULE: CAN INSTRUCTOR DELETE VIDEO
 * =========================================================
 *
 * ❗ Only admin allowed (strict rule)
 */
exports.canInstructorDelete = (user) => {
  return user?.role === "admin";
};

/**
 * =========================================================
 * 🎓 STUDENT ACCESS: CAN WATCH VIDEO
 * =========================================================
 *
 * CONDITIONS:
 * 1. Preview video → always allowed
 * 2. Purchased → allowed
 * 3. Not purchased → denied
 */
exports.canWatchVideo = (user, course, video) => {
  try {
    if (!course || !video) return false;

    // ✅ Preview video
    if (video.isPreview) return true;

    // ❌ Not logged in
    if (!user) return false;

    // ✅ Admin override
    if (user.role === "admin") return true;

    // ✅ Instructor (own course OR assigned)
    if (user.role === "instructor") {
      if (isSameId(course.createdBy, user._id)) return true;

      if (course.assignedInstructors?.some((id) => isSameId(id, user._id))) {
        return true;
      }
    }

    // ✅ Purchased course
    const purchase = user.purchasedCourses?.find((p) =>
      isSameId(p.courseId, course._id)
    );

    if (!purchase) return false;

    // ❌ Expired access
    if (purchase.expiresAt && !isDateValid(purchase.expiresAt)) {
      return false;
    }

    return true;
  } catch (error) {
    console.error("canWatchVideo error:", error.message);
    return false;
  }
};

/**
 * =========================================================
 * 🔐 COURSE ACCESS (FOR PLAYER PAGE)
 * =========================================================
 */
exports.canAccessCourse = (user, course) => {
  try {
    if (!course) return false;

    // Admin
    if (user?.role === "admin") return true;

    // Instructor (own or assigned)
    if (user?.role === "instructor") {
      if (isSameId(course.createdBy, user._id)) return true;

      if (course.assignedInstructors?.some((id) => isSameId(id, user._id))) {
        return true;
      }
    }

    // Student purchase check
    const purchase = user?.purchasedCourses?.find((p) =>
      isSameId(p.courseId, course._id)
    );

    if (!purchase) return false;

    if (purchase.expiresAt && !isDateValid(purchase.expiresAt)) {
      return false;
    }

    return true;
  } catch (error) {
    console.error("canAccessCourse error:", error.message);
    return false;
  }
};

/**
 * =========================================================
 * 🔔 TIME WARNING (OPTIONAL)
 * =========================================================
 */
exports.getInstructorTimeStatus = (instructor) => {
  if (!instructor || !instructor.permissionExpiry) return "no-limit";

  const now = new Date();
  const expiry = new Date(instructor.permissionExpiry);

  const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "expired";
  if (diffDays <= 2) return "critical";
  if (diffDays <= 5) return "warning";

  return "active";
};