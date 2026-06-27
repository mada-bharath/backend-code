/**
 * =========================================================
 * ☁️ UPLOAD SERVICE (FINAL PRODUCTION 🔥)
 * =========================================================
 * Path: backend/modules/media/services/upload.service.js
 *
 * ✅ Generates presigned URLs for direct S3 upload
 * ✅ Confirms upload after S3 receives file
 * ✅ Saves video metadata to Course in DB
 * ✅ Deletes video from S3 + DB
 * ✅ Works with both AWS_S3_BUCKET and AWS_S3_BUCKET_NAME
 * =========================================================
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import path             from "path";
import Course           from "../../course/models/course.model.js";

/* ─────────────────────────────────────────
   S3 CLIENT
───────────────────────────────────────── */
const BUCKET = process.env.AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET;
const REGION = process.env.AWS_REGION || "ap-south-1";
const hasStaticCredentials =
  Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

const s3 = new S3Client({
  region: REGION,
  ...(hasStaticCredentials
    ? {
        credentials: {
          accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      }
    : {}),
});

/* ─────────────────────────────────────────
   ALLOWED VIDEO TYPES
───────────────────────────────────────── */
const ALLOWED_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/mpeg",
];

const MAX_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

const ATTACHMENT_TYPES = [
  ...ALLOWED_TYPES,
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "text/plain",
];

const RESOURCE_TYPES = ["video", "project", "internship", "interview", "material"];
const RESOURCE_ALIASES = {
  videos: "video",
  projects: "project",
  virtualinternship: "internship",
  virtualinternships: "internship",
  interviews: "interview",
  study: "material",
  study_material: "material",
  studymaterial: "material",
  study_materials: "material",
  studymaterials: "material",
  material: "material",
  materials: "material",
  ppt: "material",
  presentation: "material",
  assignment: "material",
  casestudy: "material",
  case_study: "material",
  pdf: "material",
  document: "material",
};
const RESOURCE_FOLDERS = {
  video: "videos",
  project: "projects",
  internship: "internships",
  interview: "interviews",
  material: "study-materials",
};
const RESOURCE_COLLECTIONS = {
  project: "projects",
  internship: "virtualInternships",
  interview: "interviews",
  material: "studyMaterials",
};

const normalizeResourceType = (value = "video") => {
  const key = String(value || "video")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const resourceType = RESOURCE_ALIASES[key] || key;
  if (!RESOURCE_TYPES.includes(resourceType)) {
    throw new Error(`Invalid resource type. Allowed: ${RESOURCE_TYPES.join(", ")}`);
  }
  return resourceType;
};

const normalizeMaterialCategory = ({ resourceType, resourceCategory, fileType, fileName }) => {
  const value = String(resourceCategory || resourceType || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");

  if (["ppt", "presentation"].includes(value)) return "ppt";
  if (value === "assignment") return "assignment";
  if (["case-study", "casestudy"].includes(value)) return "case-study";
  if (value === "pdf" || fileType === "application/pdf") return "pdf";

  const name = String(fileName || "").toLowerCase();
  if (name.endsWith(".ppt") || name.endsWith(".pptx")) return "ppt";
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".doc") || name.endsWith(".docx") || name.endsWith(".txt")) return "document";

  return "other";
};

const validateResourceFile = ({ resourceType, fileType, fileSize }) => {
  const size = Number(fileSize);

  if (resourceType === "video" && !ALLOWED_TYPES.includes(fileType)) {
    throw new Error(
      `Invalid file type: ${fileType}. Allowed: MP4, WebM, MOV, AVI, MPEG`
    );
  }

  if (resourceType !== "video" && !ATTACHMENT_TYPES.includes(fileType)) {
    throw new Error(
      `Invalid file type: ${fileType}. Upload PDF, document, spreadsheet, slide, image, ZIP, or video files.`
    );
  }

  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("File size is required before upload.");
  }

  if (size > MAX_SIZE_BYTES) {
    throw new Error("File too large. Maximum size is 2 GB.");
  }
};

const ensureS3Configured = () => {
  if (!BUCKET) {
    throw new Error("AWS S3 bucket is not configured. Set AWS_S3_BUCKET or AWS_S3_BUCKET_NAME.");
  }
};

const parseBoolean = (value) =>
  value === true || value === "true" || value === 1 || value === "1";

/* ═══════════════════════════════════════
   1. GENERATE PRESIGNED UPLOAD URL
   Called BEFORE upload starts.
   Frontend uploads directly to S3 using this URL.
═══════════════════════════════════════ */
export const generatePresignedUploadUrl = async ({
  fileName,
  fileType,
  fileSize,
  courseId,
  sectionId,
  instructorId,
  resourceType = "video",
  resourceCategory,
}) => {
  ensureS3Configured();

  const normalizedType = normalizeResourceType(resourceType);
  const normalizedCategory =
    normalizedType === "material"
      ? normalizeMaterialCategory({ resourceType, resourceCategory, fileType, fileName })
      : "";
  validateResourceFile({
    resourceType: normalizedType,
    fileType,
    fileSize,
  });

  /* Build safe S3 key */
  const ext     = path.extname(fileName).toLowerCase() || (normalizedType === "video" ? ".mp4" : ".bin");
  const folder  = RESOURCE_FOLDERS[normalizedType];
  const safeKey = `courses/${courseId}/sections/${sectionId}/${folder}/${uuidv4()}${ext}`;

  const command = new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         safeKey,
    ContentType: fileType,
    Metadata: {
      courseId:     String(courseId),
      sectionId:    String(sectionId),
      instructorId: String(instructorId),
      resourceType: normalizedType,
      resourceCategory: normalizedCategory,
      originalName: encodeURIComponent(fileName),
    },
  });

  /* Presigned URL valid for 1 hour */
  const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

  /* Final public URL (after upload completes) */
  const fileUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${safeKey}`;

  return {
    presignedUrl,
    videoUrl: fileUrl,
    fileUrl,
    s3Key: safeKey,
    resourceType: normalizedType,
    resourceCategory: normalizedCategory,
  };
};

/* ═══════════════════════════════════════
   2. CONFIRM UPLOAD + SAVE TO DB
   Called AFTER frontend finishes uploading to S3.
   Verifies the file actually exists in S3,
   then saves video metadata to the Course document.
═══════════════════════════════════════ */
export const confirmUploadAndSave = async ({
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
  uploadedBy,
  isAdmin = false,
  resourceType = "video",
  resourceCategory,
}) => {
  ensureS3Configured();

  const normalizedType = normalizeResourceType(resourceType);
  const savedFileUrl = fileUrl || videoUrl;
  const normalizedCategory =
    normalizedType === "material"
      ? normalizeMaterialCategory({ resourceType, resourceCategory, fileType, fileName })
      : "";

  /* Verify file exists in S3 */
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: s3Key }));
  } catch {
    throw new Error(
      "Uploaded file was not found in S3. Upload may have failed - please try again."
    );
  }

  /* Load course */
  const course = await Course.findById(courseId);
  if (!course) throw new Error("Course not found");

  const section = course.sections?.id(sectionId);
  if (!section) throw new Error("Section not found");

  /* Admins can upload anywhere; instructors remain scoped to their assignments. */
  if (!isAdmin) {
    const permission = course.canInstructorUpload(uploadedBy, sectionId);
    if (!permission.allowed) throw new Error(permission.reason);
  }

  if (normalizedType !== "video") {
    const collectionName = RESOURCE_COLLECTIONS[normalizedType];
    if (!section[collectionName]) section[collectionName] = [];
    section[collectionName].push({
      title: title.trim(),
      description: description?.trim() || "",
      fileUrl: savedFileUrl,
      s3Key,
      originalFileName: fileName || "",
      mimeType: fileType || "",
      fileSize: Number(fileSize) || 0,
      duration: Number(duration) || 0,
      uploadStatus: "approved",
      category: normalizedCategory,
      uploadedBy,
      order: section[collectionName].length,
    });

    await course.save();

    const saved = section[collectionName][section[collectionName].length - 1];
    return { resource: saved, course, resourceType: normalizedType };
  }

  /* Add video to section */
  section.videos.push({
    title:         title.trim(),
    description:   description?.trim() || "",
    videoUrl:      savedFileUrl,
    s3Key,
    originalFileName: fileName || "",
    mimeType:      fileType || "",
    fileSize:      Number(fileSize) || 0,
    duration:      Number(duration) || 0,
    isFreePreview: parseBoolean(isFreePreview),
    uploadStatus:  "approved",
    uploadedBy,
    order:         section.videos.length,
  });

  await course.save();

  /* Return the newly added video */
  const saved = section.videos[section.videos.length - 1];
  return { video: saved, resource: saved, course, resourceType: normalizedType };
};

/* ═══════════════════════════════════════
   3. DELETE VIDEO FROM S3 + DB
═══════════════════════════════════════ */
export const deleteVideoFromS3AndDB = async ({
  courseId,
  sectionId,
  videoId,
  requesterId,
  isAdmin,
}) => {
  const course  = await Course.findById(courseId);
  if (!course) throw new Error("Course not found");

  const section = course.sections?.id(sectionId);
  if (!section) throw new Error("Section not found");

  const video = section.videos?.id(videoId);
  if (!video) throw new Error("Video not found");

  /* Non-admins can only delete videos they uploaded */
  if (!isAdmin && video.uploadedBy?.toString() !== requesterId?.toString()) {
    throw new Error("Not authorized to delete this video");
  }

  /* Delete from S3 */
  if (video.s3Key) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: video.s3Key }));
    } catch (err) {
      console.warn("⚠️ S3 delete failed (continuing DB delete):", err.message);
    }
  }

  /* Remove from DB */
  section.videos = section.videos.filter(
    (v) => v._id.toString() !== videoId
  );
  await course.save();

  return { deleted: true, videoId };
};

/* ═══════════════════════════════════════
   4. GET ALL VIDEOS FOR A COURSE
   Used by instructor dashboard
═══════════════════════════════════════ */
export const getCourseVideos = async (courseId) => {
  const course = await Course.findById(courseId)
    .select("title sections")
    .lean();

  if (!course) throw new Error("Course not found");

  const sections = (course.sections || []).map((s) => ({
    _id:    s._id,
    title:  s.title,
    order:  s.order,
    videos: (s.videos || []).map((v) => ({
      _id:          v._id,
      title:        v.title,
      videoUrl:     v.videoUrl,
      duration:     v.duration,
      uploadStatus: v.uploadStatus,
      isFreePreview: v.isFreePreview,
      order:        v.order,
      createdAt:    v.createdAt,
    })),
    projects: s.projects || [],
    studyMaterials: s.studyMaterials || [],
    virtualInternships: s.virtualInternships || [],
    interviews: s.interviews || [],
  }));

  return { courseTitle: course.title, sections };
};
