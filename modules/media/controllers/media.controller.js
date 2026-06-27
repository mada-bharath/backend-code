/**
 * =========================================================
 * 🎬 MEDIA CONTROLLER (FINAL PRODUCTION 🔥)
 * =========================================================
 * Path: backend/modules/media/controllers/media.controller.js
 *
 * ✅ Get course content (sections + videos) for student player
 * ✅ Check student access before returning video URLs
 * ✅ Track video watch progress
 * ✅ Get video by ID
 * ✅ Admin: update video metadata
 * =========================================================
 */

import mongoose from "mongoose";
import Course   from "../../course/models/course.model.js";
import User     from "../../user/models/user.js";

const sendError = (res, message = "Something went wrong", code = 500) =>
  res.status(code).json({ success: false, message });

const sendOk = (res, data, message = "Success", code = 200) =>
  res.status(code).json({ success: true, message, data });

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const idToString = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  return String(value);
};

const sameId = (left, right) =>
  Boolean(left && right && idToString(left) === idToString(right));

const formatResource = (resource, type, fallbackCategory = type, canAccess = false) => ({
  _id: resource._id,
  title: resource.title,
  description: resource.description || "",
  type,
  category: resource.category || fallbackCategory,
  fileUrl: canAccess ? resource.fileUrl || null : null,
  s3Key: resource.s3Key || null,
  originalFileName: resource.originalFileName || "",
  mimeType: resource.mimeType || "",
  fileSize: resource.fileSize || 0,
  duration: resource.duration || 0,
  uploadStatus: resource.uploadStatus,
  order: resource.order || 0,
  isLocked: !canAccess,
  createdAt: resource.createdAt,
});

const getSectionMaterials = (section, canAccess) => [
  ...(section.studyMaterials || []).map((item) =>
    formatResource(item, "study-material", item.category || "material", canAccess)
  ),
  ...(section.projects || []).map((item) => formatResource(item, "project", "project", canAccess)),
  ...(section.virtualInternships || []).map((item) =>
    formatResource(item, "virtual-internship", "internship", canAccess)
  ),
  ...(section.interviews || []).map((item) =>
    formatResource(item, "interview", "interview", canAccess)
  ),
].sort((left, right) => (left.order || 0) - (right.order || 0));

/* ─────────────────────────────────────────
   CHECK COURSE ACCESS
───────────────────────────────────────── */
const hasAccess = async (userId, course) => {
  if (course.isFree) return true;

  const user = await User.findById(userId)
    .select("purchasedCourses isFreeAccess role isInstructorActive")
    .lean();

  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.isFreeAccess) return true;

  if (user.role === "instructor" && user.isInstructorActive) {
    const isCreator = sameId(course.createdBy, userId);
    const isAssigned = (course.assignedInstructors || []).some(
      (assignment) =>
        assignment.isActive &&
        sameId(assignment.instructor, userId)
    );

    if (isCreator || isAssigned) return true;
  }

  const now = new Date();
  return (user.purchasedCourses || []).some((pc) => {
    const idMatch = sameId(pc.courseId, course._id);
    const notExpired = !pc.expiresAt || new Date(pc.expiresAt) > now;
    return idMatch && notExpired;
  });
};

/* ═══════════════════════════════════════
   GET COURSE PLAYER DATA
   GET /api/media/course/:courseId
   Returns sections + videos for the player.
   Free preview videos visible to all.
   Paid videos only if user has access.
═══════════════════════════════════════ */
export const getCoursePlayer = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user?._id || req.user?.id;

    if (!isValidId(courseId)) return sendError(res, "Invalid courseId", 400);

    const course = await Course.findOne({ _id: courseId, isDeleted: false })
      .populate("assignedInstructors.instructor", "name avatar")
      .lean({ virtuals: true });

    if (!course) return sendError(res, "Course not found", 404);

    const userHasAccess = userId ? await hasAccess(userId, course) : false;

    /* Filter video URLs — only return URL if user has access or free preview */
    const sections = (course.sections || []).map((section) => ({
      _id:   section._id,
      title: section.title,
      description: section.description,
      order: section.order,
      videos: (section.videos || []).map((video) => {
        const canWatch = userHasAccess || video.isFreePreview;
        return {
          _id:          video._id,
          title:        video.title,
          duration:     video.duration,
          isFreePreview: video.isFreePreview,
          uploadStatus:  video.uploadStatus,
          order:         video.order,
          /* Only expose URL if user has access */
          videoUrl:  canWatch ? video.videoUrl  : null,
          hlsUrl:    canWatch ? video.hlsUrl    : null,
          isLocked:  !canWatch,
        };
      }),
      studyMaterials: getSectionMaterials(section, userHasAccess),
    }));

    return sendOk(res, {
      course: {
        _id:          course._id,
        title:        course.title,
        description:  course.description,
        thumbnail:    course.thumbnail,
        level:        course.level,
        totalVideos:  course.totalVideos,
        totalDuration: course.totalDuration,
        totalStudyMaterials: course.totalStudyMaterials || 0,
        isFree:       course.isFree,
        finalPrice:   course.finalPrice,
        assignedInstructors: course.assignedInstructors,
      },
      sections,
      hasAccess: userHasAccess,
    });
  } catch (error) {
    console.error("❌ [Media] getCoursePlayer Error:", error.message);
    return sendError(res);
  }
};

/* ═══════════════════════════════════════
   GET SINGLE VIDEO
   GET /api/media/video/:courseId/:sectionId/:videoId
═══════════════════════════════════════ */
export const getVideo = async (req, res) => {
  try {
    const { courseId, sectionId, videoId } = req.params;
    const userId = req.user?._id || req.user?.id;

    if (!isValidId(courseId) || !isValidId(sectionId) || !isValidId(videoId)) {
      return sendError(res, "Invalid ID format", 400);
    }

    const course = await Course.findOne({ _id: courseId, isDeleted: false }).lean();
    if (!course) return sendError(res, "Course not found", 404);

    const section = (course.sections || []).find(
      (s) => s._id.toString() === sectionId
    );
    if (!section) return sendError(res, "Section not found", 404);

    const video = (section.videos || []).find(
      (v) => v._id.toString() === videoId
    );
    if (!video) return sendError(res, "Video not found", 404);

    /* Check access */
    const userHasAccess = userId ? await hasAccess(userId, course) : false;
    if (!userHasAccess && !video.isFreePreview) {
      return sendError(res, "Purchase this course to watch this video", 403);
    }

    return sendOk(res, {
      _id:          video._id,
      title:        video.title,
      videoUrl:     video.videoUrl,
      hlsUrl:       video.hlsUrl,
      duration:     video.duration,
      isFreePreview: video.isFreePreview,
      description:  video.description,
    });
  } catch (error) {
    console.error("❌ [Media] getVideo Error:", error.message);
    return sendError(res);
  }
};

/* ═══════════════════════════════════════
   UPDATE VIDEO METADATA (Instructor/Admin)
   PUT /api/media/video/:courseId/:sectionId/:videoId
   Body: { title?, description?, isFreePreview?, order? }
═══════════════════════════════════════ */
export const updateVideoMeta = async (req, res) => {
  try {
    const { courseId, sectionId, videoId } = req.params;
    const userId  = req.user?._id || req.user?.id;
    const isAdmin = req.user?.role === "admin";
    const { title, description, isFreePreview, order } = req.body;

    if (!isValidId(courseId) || !isValidId(sectionId) || !isValidId(videoId)) {
      return sendError(res, "Invalid ID format", 400);
    }

    const course  = await Course.findById(courseId);
    if (!course) return sendError(res, "Course not found", 404);

    const section = course.sections?.id(sectionId);
    if (!section) return sendError(res, "Section not found", 404);

    const video = section.videos?.id(videoId);
    if (!video) return sendError(res, "Video not found", 404);

    /* Only uploader or admin can edit */
    if (!isAdmin && video.uploadedBy?.toString() !== userId?.toString()) {
      return sendError(res, "Not authorized to edit this video", 403);
    }

    if (title        !== undefined) video.title        = title.trim();
    if (description  !== undefined) video.description  = description.trim();
    if (isFreePreview !== undefined) video.isFreePreview = Boolean(isFreePreview);
    if (order        !== undefined) video.order        = Number(order);

    await course.save();

    return sendOk(res, video, "Video updated successfully");
  } catch (error) {
    console.error("❌ [Media] updateVideoMeta Error:", error.message);
    return sendError(res);
  }
};

/* ═══════════════════════════════════════
   GET INSTRUCTOR COURSE WITH VIDEOS
   GET /api/media/instructor/course/:courseId
   Full course detail for instructor editor
═══════════════════════════════════════ */
export const getInstructorCourseDetail = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user?._id || req.user?.id;

    if (!isValidId(courseId)) return sendError(res, "Invalid courseId", 400);

    const course = await Course.findOne({ _id: courseId, isDeleted: false })
      .lean({ virtuals: true });

    if (!course) return sendError(res, "Course not found", 404);

    /* Check instructor is assigned */
    const isAdmin      = req.user?.role === "admin";
    const isAssigned   = (course.assignedInstructors || []).some(
      (a) => a.instructor?.toString() === userId?.toString() && a.isActive
    );

    if (!isAdmin && !isAssigned) {
      return sendError(res, "You are not assigned to this course", 403);
    }

    return sendOk(res, course);
  } catch (error) {
    console.error("❌ [Media] getInstructorCourseDetail Error:", error.message);
    return sendError(res);
  }
};
