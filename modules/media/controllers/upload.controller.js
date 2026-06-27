/**
 * =========================================================
 * 📤 UPLOAD CONTROLLER (FINAL PRODUCTION 🔥)
 * =========================================================
 * Path: backend/modules/media/controllers/upload.controller.js
 *
 * Flow:
 * 1. Instructor requests presigned URL  → getPresignedUrl
 * 2. Frontend uploads directly to S3   → (no server involved)
 * 3. Frontend confirms upload complete → confirmUpload
 * 4. Video appears in course           → saved in MongoDB
 *
 * ✅ No file passes through server (direct S3)
 * ✅ Permission check before presigned URL is issued
 * ✅ S3 existence verified before DB save
 * ✅ Delete from S3 + DB together
 * =========================================================
 */

import mongoose from "mongoose";
import User     from "../../user/models/user.js";
import Course   from "../../course/models/course.model.js";
import {
  generatePresignedUploadUrl,
  confirmUploadAndSave,
  deleteVideoFromS3AndDB,
  getCourseVideos,
} from "../services/upload.service.js";

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
const sendError = (res, message = "Something went wrong", code = 500) =>
  res.status(code).json({ success: false, message });

const sendOk = (res, data, message = "Success", code = 200) =>
  res.status(code).json({ success: true, message, data });

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

/* ─────────────────────────────────────────
   VALIDATE INSTRUCTOR ACCESS
───────────────────────────────────────── */
const validateInstructorAccess = async (userId) => {
  const user = await User.findById(userId).select(
    "role isInstructorActive permissionExpiry isExpired"
  );

  if (!user) {
    return { allowed: false, message: "User not found" };
  }
  if (user.role === "admin") {
    return { allowed: true, user };
  }
  if (user.role !== "instructor") {
    return { allowed: false, message: "Only instructor or admin can upload course content" };
  }
  if (!user.isInstructorActive) {
    return { allowed: false, message: "Your instructor access is inactive. Contact admin." };
  }
  if (user.permissionExpiry && new Date() > new Date(user.permissionExpiry)) {
    /* Auto-mark expired */
    await User.findByIdAndUpdate(userId, {
      $set: { isInstructorActive: false, isExpired: true },
    });
    return { allowed: false, message: "Your instructor permission has expired. Contact admin." };
  }

  return { allowed: true, user };
};

/* ═══════════════════════════════════════
   1. GET PRESIGNED UPLOAD URL
   POST /api/upload/presigned-url
   Body: { courseId, sectionId, fileName, fileType, fileSize, videoTitle }
═══════════════════════════════════════ */
export const getPresignedUrl = async (req, res) => {
  try {
    const instructorId = req.user?._id || req.user?.id;
    const {
      courseId,
      sectionId,
      fileName,
      fileType,
      fileSize,
      videoTitle,
      resourceTitle,
      resourceType = "video",
      resourceCategory,
    } = req.body;
    const title = resourceTitle || videoTitle;

    /* ── Validate instructor ── */
    const access = await validateInstructorAccess(instructorId);
    if (!access.allowed) return sendError(res, access.message, 403);

    /* ── Validate inputs ── */
    if (!courseId || !sectionId || !fileName || !fileType || !fileSize) {
      return sendError(res, "courseId, sectionId, fileName, fileType, fileSize are required", 400);
    }
    if (!title?.trim()) {
      return sendError(res, "Title is required before upload", 400);
    }
    if (!isValidId(courseId) || !isValidId(sectionId)) {
      return sendError(res, "Invalid courseId or sectionId", 400);
    }

    /* ── Verify instructor is assigned to this course/section ── */
    const course = await Course.findOne({ _id: courseId, isDeleted: { $ne: true } });
    if (!course) return sendError(res, "Course not found", 404);

    if (access.user.role !== "admin") {
      const permission = course.canInstructorUpload(instructorId, sectionId);
      if (!permission.allowed) return sendError(res, permission.reason, 403);
    }

    /* ── Generate presigned URL ── */
    const uploadTarget = await generatePresignedUploadUrl({
      fileName,
      fileType,
      fileSize: Number(fileSize),
      courseId,
      sectionId,
      instructorId,
      resourceType,
      resourceCategory,
    });

    return sendOk(res, {
      presignedUrl: uploadTarget.presignedUrl,
      videoUrl: uploadTarget.videoUrl,
      fileUrl: uploadTarget.fileUrl,
      s3Key: uploadTarget.s3Key,
      resourceType: uploadTarget.resourceType,
      resourceCategory: uploadTarget.resourceCategory,
      expiresIn: 3600,
    }, "Presigned URL generated — upload directly to S3");

  } catch (error) {
    console.error("❌ [Upload] getPresignedUrl Error:", error.message);
    return sendError(res, error.message || "Failed to generate upload URL");
  }
};

/* ═══════════════════════════════════════
   2. CONFIRM UPLOAD COMPLETE + SAVE TO DB
   POST /api/upload/confirm
   Body: { courseId, sectionId, s3Key, videoUrl, title, duration, isFreePreview }
═══════════════════════════════════════ */
export const confirmUpload = async (req, res) => {
  try {
    const instructorId = req.user?._id || req.user?.id;
    const {
      courseId,
      sectionId,
      s3Key,
      videoUrl,
      fileUrl,
      title,
      description,
      fileName,
      fileType,
      fileSize,
      duration,
      isFreePreview,
      resourceType = "video",
      resourceCategory,
    } = req.body;

    /* ── Validate instructor ── */
    const access = await validateInstructorAccess(instructorId);
    if (!access.allowed) return sendError(res, access.message, 403);

    /* ── Validate inputs ── */
    const savedFileUrl = fileUrl || videoUrl;

    if (!courseId || !sectionId || !s3Key || !savedFileUrl || !title) {
      return sendError(res, "courseId, sectionId, s3Key, fileUrl, title are required", 400);
    }

    const { video, resource } = await confirmUploadAndSave({
      courseId,
      sectionId,
      s3Key,
      videoUrl: savedFileUrl,
      fileUrl: savedFileUrl,
      title,
      description,
      fileName,
      fileType,
      fileSize,
      duration,
      isFreePreview,
      uploadedBy: instructorId,
      isAdmin: access.user.role === "admin",
      resourceType,
      resourceCategory,
    });

    return sendOk(
      res,
      { video: video || null, resource, courseId, sectionId, resourceType, resourceCategory },
      "Upload saved successfully"
    );

    return sendOk(res, { video, courseId, sectionId }, "Video saved successfully 🎉");

  } catch (error) {
    console.error("❌ [Upload] confirmUpload Error:", error.message);
    return sendError(res, error.message || "Failed to save video");
  }
};

/* ═══════════════════════════════════════
   3. DELETE VIDEO (S3 + DB)
   DELETE /api/upload/video/:courseId/:sectionId/:videoId
═══════════════════════════════════════ */
export const deleteVideo = async (req, res) => {
  try {
    const requesterId = req.user?._id || req.user?.id;
    const isAdmin     = req.user?.role === "admin";
    const { courseId, sectionId, videoId } = req.params;

    if (!isValidId(courseId) || !isValidId(sectionId) || !isValidId(videoId)) {
      return sendError(res, "Invalid ID format", 400);
    }

    /* Non-admins must be active instructors */
    if (!isAdmin) {
      const access = await validateInstructorAccess(requesterId);
      if (!access.allowed) return sendError(res, access.message, 403);
    }

    const result = await deleteVideoFromS3AndDB({
      courseId,
      sectionId,
      videoId,
      requesterId,
      isAdmin,
    });

    return sendOk(res, result, "Video deleted successfully");

  } catch (error) {
    console.error("❌ [Upload] deleteVideo Error:", error.message);
    return sendError(res, error.message || "Failed to delete video");
  }
};

/* ═══════════════════════════════════════
   4. GET COURSE VIDEOS (INSTRUCTOR VIEW)
   GET /api/upload/courses/:courseId/videos
═══════════════════════════════════════ */
export const getCourseVideoList = async (req, res) => {
  try {
    const instructorId = req.user?._id || req.user?.id;
    const { courseId } = req.params;

    if (!isValidId(courseId)) return sendError(res, "Invalid courseId", 400);

    /* Validate instructor */
    const access = await validateInstructorAccess(instructorId);
    if (!access.allowed) return sendError(res, access.message, 403);

    const data = await getCourseVideos(courseId);

    return sendOk(res, data);

  } catch (error) {
    console.error("❌ [Upload] getCourseVideoList Error:", error.message);
    return sendError(res, error.message || "Failed to fetch videos");
  }
};
