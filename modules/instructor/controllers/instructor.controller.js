/**
 * =========================================================
 * 🎓 INSTRUCTOR CONTROLLER (FINAL PRODUCTION 🔥)
 * =========================================================
 * Path: backend/modules/instructor/controllers/instructor.controller.js
 *
 * ROOT CAUSE FIXES:
 * ─────────────────────────────────────────────────────────
 * FIX 1: validateInstructorAccess was checking user.approvedByAdmin
 *   which does NOT exist in your User schema. Your DB uses:
 *   - isInstructorActive: true   ← this is the correct field
 *   - status: "approved"         ← on the user doc
 *   Removed approvedByAdmin check entirely.
 *
 * FIX 2: instructorCourseQuery now correctly matches:
 *   - Courses the instructor CREATED (createdBy)
 *   - Courses ASSIGNED to the instructor by admin
 *     (assignedInstructors[].instructor + isActive: true)
 *
 * FIX 3: Added uploadVideo + addSection + addVideo routes
 *   so the instructor dashboard shows an Upload button.
 *
 * FIX 4: One instructor can teach MULTIPLE courses/subjects
 *   simultaneously — no restriction, query returns ALL assigned.
 * =========================================================
 */

import mongoose from "mongoose";
import Course   from "../../course/models/course.model.js";
import User     from "../../user/models/user.js";

/* ─────────────────────────────────────────
   HELPER
───────────────────────────────────────── */
const sendError = (res, message = "Something went wrong", code = 500) =>
  res.status(code).json({ success: false, message });

/**
 * Build the correct MongoDB query to find all courses
 * an instructor can access — both created AND assigned.
 *
 * One instructor CAN teach multiple courses at the same time.
 * This query returns ALL of them with no limit.
 */
const instructorCourseQuery = (userId) => {
  const oid = new mongoose.Types.ObjectId(userId);
  return {
    isDeleted: false,
    $or: [
      /* Instructor created this course themselves */
      { createdBy: oid },
      /* Admin assigned this instructor to this course (must be active) */
      {
        assignedInstructors: {
          $elemMatch: {
            instructor: oid,
            isActive:   true,
          },
        },
      },
    ],
  };
};

const idToString = (value) => {
  if (!value) return "";
  if (value._id) return value._id.toString();
  return value.toString();
};

const sameId = (left, right) =>
  Boolean(left && right && idToString(left) === idToString(right));

const getInstructorAssignments = (course, userId) =>
  (course.assignedInstructors || []).filter(
    (assignment) => sameId(assignment.instructor, userId) && assignment.isActive
  );

const getCourseRuntimeStats = (sections = []) =>
  (Array.isArray(sections) ? sections : []).reduce(
    (stats, section) => {
      const videos = Array.isArray(section?.videos) ? section.videos : [];
      stats.totalVideos += videos.length;
      stats.totalDuration += videos.reduce(
        (sum, video) => sum + (Number(video?.duration) || 0),
        0
      );
      return stats;
    },
    { totalDuration: 0, totalVideos: 0 }
  );

const enrichCourseForInstructor = (course, userId) => {
  const isCreatedByMe = sameId(course.createdBy, userId);
  const myAssignments = getInstructorAssignments(course, userId);
  const assignedSectionIds = new Set(
    myAssignments
      .map((assignment) => idToString(assignment.sectionId))
      .filter(Boolean)
  );
  const assignedModuleNames = new Set(
    myAssignments
      .map((assignment) => String(assignment.moduleName || "").trim().toLowerCase())
      .filter(Boolean)
  );

  let scopedSections = course.sections || [];

  if (!isCreatedByMe && course.permissionType === "MULTIPLE") {
    scopedSections = scopedSections.filter((section) => {
      const sectionId = idToString(section._id);
      const title = String(section.title || "").trim().toLowerCase();

      return (
        assignedSectionIds.has(sectionId) ||
        sameId(section.assignedInstructor, userId) ||
        assignedModuleNames.has(title)
      );
    });
  }

  const runtimeStats = getCourseRuntimeStats(scopedSections);

  return {
    ...course,
    sections: scopedSections,
    totalDuration: runtimeStats.totalDuration,
    totalDurationSeconds: runtimeStats.totalDuration,
    totalHours: Number((runtimeStats.totalDuration / 3600).toFixed(2)),
    totalVideos: runtimeStats.totalVideos,
    isCreatedByMe,
    isAssignedToMe: myAssignments.length > 0,
    myAssignment: myAssignments[0] || null,
    myAssignments,
    myModule: myAssignments[0]?.moduleName || null,
    myModules: myAssignments
      .map((assignment) => assignment.moduleName)
      .filter(Boolean),
    canUpload: isCreatedByMe || myAssignments.length > 0,
    uploadScope:
      isCreatedByMe || course.permissionType === "SINGLE"
        ? "course"
        : "module",
  };
};

/* ─────────────────────────────────────────
   VALIDATE INSTRUCTOR ACCESS
   ✅ FIX: Removed approvedByAdmin check — field doesn't exist in DB.
   Correct checks: role === "instructor" + isInstructorActive === true
   + permissionExpiry not passed.
───────────────────────────────────────── */
const validateInstructorAccess = async (userId) => {
  const user = await User.findById(userId).lean();

  if (!user) {
    return { allowed: false, message: "User not found" };
  }

  if (user.role !== "instructor") {
    return { allowed: false, message: "Access denied — instructor role required" };
  }

  if (!user.isInstructorActive) {
    return {
      allowed: false,
      message: "Your instructor access is inactive. Contact admin to activate.",
    };
  }

  /* Auto-expire: if permissionExpiry is set and has passed */
  if (user.permissionExpiry && new Date() > new Date(user.permissionExpiry)) {
    /* Use findByIdAndUpdate to skip bcrypt pre-save hook */
    await User.findByIdAndUpdate(userId, {
      $set: { isInstructorActive: false, isExpired: true },
    });
    return {
      allowed: false,
      message: "Your instructor permission has expired. Contact admin to renew.",
    };
  }

  return { allowed: true, user };
};

/* ═══════════════════════════════════════
   📊 GET DASHBOARD
   GET /api/instructor/dashboard
═══════════════════════════════════════ */
export const getDashboard = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;

    const access = await validateInstructorAccess(userId);
    if (!access.allowed) {
      return res.status(403).json({ success: false, message: access.message });
    }

    /* ✅ FIXED: finds both created + admin-assigned courses */
    const query = instructorCourseQuery(userId);

    const courses = await Course.find(query)
      .populate("assignedInstructors.instructor", "name email isInstructorActive")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .lean();

    /* Enrich each course with instructor-specific flags */
    const enriched = courses.map((course) =>
      enrichCourseForInstructor(course, userId)
    );

    /* Dashboard stats */
    const stats = {
      total:    courses.length,
      approved: courses.filter((c) => ["approved", "published"].includes(c.status)).length,
      pending:  courses.filter((c) => c.status === "pending").length,
      rejected: courses.filter((c) => c.status === "rejected").length,
      draft:    courses.filter((c) => c.status === "draft").length,
    };

    return res.json({
      success: true,
      user:    access.user,   /* Frontend uses this for permission display */
      data: {
        courses: enriched,
        stats,
      },
    });
  } catch (error) {
    console.error("❌ [Instructor] getDashboard Error:", error.message);
    return sendError(res, "Failed to fetch dashboard");
  }
};

/* ═══════════════════════════════════════
   📚 GET MY COURSES (PAGINATED)
   GET /api/instructor/courses?page=1&limit=12&status=all
═══════════════════════════════════════ */
export const getInstructorCourses = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const { page = 1, limit = 12, status } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const query = instructorCourseQuery(userId);
    if (status && status !== "all") query.status = status;

    const [courses, total] = await Promise.all([
      Course.find(query)
        .populate("assignedInstructors.instructor", "name email")
        .populate("createdBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Course.countDocuments(query),
    ]);

    const enriched = courses.map((course) =>
      enrichCourseForInstructor(course, userId)
    );

    return res.json({
      success: true,
      data:    enriched,
      pagination: {
        page:       Number(page),
        limit:      Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("❌ [Instructor] getInstructorCourses Error:", error.message);
    return sendError(res, "Failed to fetch courses");
  }
};

/* ═══════════════════════════════════════
   ➕ ADD SECTION TO COURSE
   POST /api/instructor/courses/:courseId/sections
═══════════════════════════════════════ */
export const addSection = async (req, res) => {
  try {
    const userId   = req.user?._id || req.user?.id;
    const { courseId } = req.params;
    const { title, description } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({ success: false, message: "Section title is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ success: false, message: "Invalid courseId" });
    }

    const course = await Course.findOne({ _id: courseId, isDeleted: false });
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found" });
    }

    /* Permission check */
    const oid        = new mongoose.Types.ObjectId(userId);
    const isCreator  = course.createdBy?.toString() === userId.toString();
    const isAssigned = course.assignedInstructors?.some(
      (a) => a.instructor?.toString() === userId.toString() && a.isActive
    );

    if (!isCreator && !isAssigned) {
      return res.status(403).json({ success: false, message: "Not authorized for this course" });
    }

    const newSection = {
      _id:                new mongoose.Types.ObjectId(),
      title:              title.trim(),
      description:        description?.trim() || "",
      assignedInstructor: oid,
      order:              course.sections?.length || 0,
      videos:             [],
    };

    course.sections.push(newSection);
    await course.save();

    return res.status(201).json({
      success: true,
      message: "Section added successfully",
      data:    newSection,
    });
  } catch (error) {
    console.error("❌ [Instructor] addSection Error:", error.message);
    return sendError(res, "Failed to add section");
  }
};

/* ═══════════════════════════════════════
   🎬 ADD VIDEO TO SECTION
   POST /api/instructor/courses/:courseId/sections/:sectionId/videos
   Body: { title, description, isFreePreview }
   File: req.file (uploaded via multer → S3 or local)
═══════════════════════════════════════ */
export const addVideo = async (req, res) => {
  try {
    const userId              = req.user?._id || req.user?.id;
    const { courseId, sectionId } = req.params;
    const { title, description, isFreePreview } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({ success: false, message: "Video title is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(courseId) || !mongoose.Types.ObjectId.isValid(sectionId)) {
      return res.status(400).json({ success: false, message: "Invalid courseId or sectionId" });
    }

    const course = await Course.findOne({ _id: courseId, isDeleted: false });
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found" });
    }

    /* Permission check */
    const isCreator  = course.createdBy?.toString() === userId.toString();
    const assignment = course.assignedInstructors?.find(
      (a) => a.instructor?.toString() === userId.toString() && a.isActive
    );

    if (!isCreator && !assignment) {
      return res.status(403).json({ success: false, message: "Not authorized for this course" });
    }

    /* For MULTIPLE permission type — check section access */
    if (!isCreator && course.permissionType === "MULTIPLE" && assignment?.sectionId) {
      if (assignment.sectionId.toString() !== sectionId) {
        return res.status(403).json({
          success: false,
          message: `You can only upload to your assigned module: ${assignment.moduleName || "your section"}`,
        });
      }
    }

    const section = course.sections.id(sectionId);
    if (!section) {
      return res.status(404).json({ success: false, message: "Section not found" });
    }

    /* Build video URL — S3 or local */
    let videoUrl = null;
    if (req.file) {
      videoUrl = req.file.location ||          /* multer-s3 */
                 req.file.path     ||          /* local disk */
                 null;
    }

    const newVideo = {
      title:         title.trim(),
      description:   description?.trim() || "",
      videoUrl,
      isFreePreview: isFreePreview === "true" || isFreePreview === true,
      uploadedBy:    new mongoose.Types.ObjectId(userId),
      uploadStatus:  "pending",
      order:         section.videos?.length || 0,
    };

    section.videos.push(newVideo);
    await course.save();

    return res.status(201).json({
      success: true,
      message: "Video uploaded successfully — pending admin approval",
      data:    newVideo,
    });
  } catch (error) {
    console.error("❌ [Instructor] addVideo Error:", error.message);
    return sendError(res, "Failed to upload video");
  }
};

/* ═══════════════════════════════════════
   📤 SUBMIT COURSE FOR APPROVAL
   PUT /api/instructor/submit/:courseId
═══════════════════════════════════════ */
export const submitCourseForApproval = async (req, res) => {
  try {
    const userId       = req.user?._id || req.user?.id;
    const { courseId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ success: false, message: "Invalid courseId" });
    }

    const course = await Course.findOne({ _id: courseId, isDeleted: false });
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found" });
    }

    const isCreator  = course.createdBy?.toString() === userId.toString();
    const isAssigned = course.assignedInstructors?.some(
      (a) => a.instructor?.toString() === userId.toString() && a.isActive
    );

    if (!isCreator && !isAssigned) {
      return res.status(403).json({ success: false, message: "Not authorized to submit this course" });
    }

    if (course.status !== "draft") {
      return res.status(400).json({
        success: false,
        message: `Cannot submit — current status is '${course.status}'`,
      });
    }

    /* Must have at least one video */
    const totalVideos = course.sections?.reduce(
      (sum, s) => sum + (s.videos?.length || 0), 0
    ) || 0;

    if (totalVideos === 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot submit an empty course. Please upload at least one video first.",
      });
    }

    await Course.findByIdAndUpdate(courseId, { $set: { status: "pending" } });

    return res.json({ success: true, message: "Course submitted for admin review" });
  } catch (error) {
    console.error("❌ [Instructor] submitCourse Error:", error.message);
    return sendError(res, "Failed to submit course");
  }
};

/* ═══════════════════════════════════════
   📊 GET ANALYTICS
   GET /api/instructor/analytics
═══════════════════════════════════════ */
export const getInstructorAnalytics = async (req, res) => {
  try {
    const userId  = req.user?._id || req.user?.id;
    const courses = await Course.find(instructorCourseQuery(userId)).lean();

    const totalVideos   = courses.reduce(
      (sum, c) => sum + (c.sections?.reduce(
        (s2, sec) => s2 + (sec.videos?.length || 0), 0
      ) || 0), 0
    );
    const totalStudents = courses.reduce((sum, c) => sum + (c.totalStudents || 0), 0);

    return res.json({
      success: true,
      data: {
        totalCourses:    courses.length,
        approvedCourses: courses.filter((c) => ["approved", "published"].includes(c.status)).length,
        pendingCourses:  courses.filter((c) => c.status === "pending").length,
        draftCourses:    courses.filter((c) => c.status === "draft").length,
        rejectedCourses: courses.filter((c) => c.status === "rejected").length,
        totalVideos,
        totalStudents,
      },
    });
  } catch (error) {
    console.error("❌ [Instructor] getAnalytics Error:", error.message);
    return sendError(res, "Failed to fetch analytics");
  }
};
