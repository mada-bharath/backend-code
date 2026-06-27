/**
 * =========================================================
 * 📦 UPLOAD MIDDLEWARE (FINAL ENTERPRISE PRODUCTION 🔥)
 * =========================================================
 * Path: backend/shared/middleware/upload.middleware.js
 *
 * MERGED FROM:
 * ✅ Doc 28 (your VS Code) → S3 + local strategy switching,
 *                             uploadCourseAssets, handleUploadError,
 *                             uploadSingle(fieldName), dynamic S3 import,
 *                             ensureDir helper, s3Storage prefix system
 * ✅ Doc 29 (previous)     → uploadCourseFiles alias, uploadProfileImage,
 *                             imageOrPdfFilter, handleMulterError alias,
 *                             uploadSingleImage (profile use)
 *
 * RESULT — all exports available, no duplication:
 * ✅ uploadCourseAssets     — thumbnail (image) + roadmap (PDF)
 * ✅ uploadCourseFiles      — exact alias for uploadCourseAssets
 *                             (used by admin.routes.js imports)
 * ✅ uploadVideo            — single video file (up to 2GB)
 * ✅ uploadProfileImage     — single profile avatar (up to 5MB)
 * ✅ uploadSingleImage      — generic single image (up to 10MB)
 * ✅ uploadSingle(field)    — returns middleware for any single field
 * ✅ handleUploadError      — express 4-arg error-handler for multer
 * ✅ handleMulterError      — alias for handleUploadError
 *
 * Strategy:
 *   AWS env vars configured → files go to S3 via multer-s3 (production)
 *   Not configured          → files go to local /uploads folder (dev/fallback)
 * =========================================================
 */

import multer            from "multer";
import path              from "path";
import fs                from "fs";
import { fileURLToPath } from "url";

/* ─────────────────────────────────────────
   📁 LOCAL UPLOAD ROOT DIRECTORY
───────────────────────────────────────── */
const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);
const IS_VERCEL   = Boolean(process.env.VERCEL);
const UPLOADS_DIR = IS_VERCEL
  ? path.join("/tmp", "uploads")
  : path.join(process.cwd(), "uploads");

/* Creates a directory if it doesn't exist */
const ensureDir = (dir) => {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return true;
  } catch (error) {
    console.warn(`[Upload] Could not create upload directory ${dir}: ${error.message}`);
    return false;
  }
};

/* Pre-create common upload subdirectories */
["thumbnails", "roadmaps", "brochures", "videos", "profiles", "images", "discussion", "misc"].forEach(
  (sub) => ensureDir(path.join(UPLOADS_DIR, sub))
);

/* ─────────────────────────────────────────
   ☁️ S3 CONFIGURATION CHECK
───────────────────────────────────────── */
const S3_CONFIGURED =
  !!process.env.AWS_ACCESS_KEY_ID     &&
  !!process.env.AWS_SECRET_ACCESS_KEY &&
  !!process.env.AWS_S3_BUCKET_NAME;

/* ─────────────────────────────────────────
   🔍 FILE FILTER HELPERS
───────────────────────────────────────── */
const imageFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (allowed.includes(file.mimetype)) return cb(null, true);
  cb(new Error(`${file.fieldname} must be a JPG, PNG, or WebP image`), false);
};

const pdfFilter = (req, file, cb) => {
  if (file.mimetype === "application/pdf") return cb(null, true);
  cb(new Error(`${file.fieldname} must be a PDF file`), false);
};

const imageOrPdfFilter = (req, file, cb) => {
  const allowed = [
    "image/jpeg", "image/jpg", "image/png", "image/webp",
    "application/pdf",
  ];
  if (allowed.includes(file.mimetype)) return cb(null, true);
  cb(new Error("Only images (JPG, PNG, WEBP) and PDFs are allowed"), false);
};

const videoFilter = (req, file, cb) => {
  const allowed = [
    "video/mp4", "video/mpeg", "video/quicktime",
    "video/x-msvideo", "video/webm",
  ];
  if (allowed.includes(file.mimetype)) return cb(null, true);
  cb(new Error("Video must be MP4, MOV, AVI, or WebM format"), false);
};

const anyFileFilter = (req, file, cb) => cb(null, true);

/* ─────────────────────────────────────────
   🏠 LOCAL DISK STORAGE FACTORY
───────────────────────────────────────── */
const localDiskStorage = (subDir) =>
  multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(UPLOADS_DIR, subDir);
      if (!ensureDir(dir)) {
        cb(new Error("Upload storage is not writable. Configure S3 for production uploads."));
        return;
      }
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext      = path.extname(file.originalname).toLowerCase();
      const safeName =
        `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
      cb(null, safeName);
    },
  });

/* ─────────────────────────────────────────
   ☁️ S3 STORAGE FACTORY (PRODUCTION)
   Dynamically imported to avoid crash when
   AWS env vars are not configured.
───────────────────────────────────────── */
let s3Storage = null;

if (S3_CONFIGURED) {
  try {
    const { default: multerS3 } = await import("multer-s3");
    const { S3Client }          = await import("@aws-sdk/client-s3");

    const s3Client = new S3Client({
      region: process.env.AWS_REGION || "ap-south-1",
      credentials: {
        accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    const BUCKET = process.env.AWS_S3_BUCKET_NAME;

    /* s3Storage is a FUNCTION that returns multer-s3 storage for a given prefix */
    s3Storage = (prefix) =>
      multerS3({
        s3:          s3Client,
        bucket:      BUCKET,
        acl:         "public-read",
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: (req, file, cb) => {
          const ext      = path.extname(file.originalname).toLowerCase();
          const safeName = `${prefix}/${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
          cb(null, safeName);
        },
      });

    console.log("✅ [Upload] S3 storage configured — files will upload to S3");
  } catch (err) {
    console.warn("⚠️ [Upload] S3 config failed, falling back to local disk:", err.message);
    s3Storage = null;
  }
}

/* ─────────────────────────────────────────
   🏗️ STORAGE SELECTOR
   Returns S3 storage if configured, otherwise local disk.
   s3Prefix: folder name inside S3 bucket (e.g., "thumbnails")
   localSub:  folder name inside /uploads/  (e.g., "thumbnails")
───────────────────────────────────────── */
const getStorage = (s3Prefix, localSub) =>
  s3Storage ? s3Storage(s3Prefix) : localDiskStorage(localSub);

/* ═══════════════════════════════════════
   🎓 COURSE ASSETS UPLOAD
   Fields: thumbnail (image) + roadmap (PDF)
   Both fields are optional — missing files
   are handled gracefully in controllers.
═══════════════════════════════════════ */
const courseAssetMulter = multer({
  storage: getStorage("course-assets", "misc"),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB per file
    files:    3,                 // thumbnail + roadmap + brochure
  },
  fileFilter: (req, file, cb) => {
    /* Per-field filters */
    if (file.fieldname === "thumbnail") return imageFilter(req, file, cb);
    if (file.fieldname === "roadmap")   return imageFilter(req, file, cb);
    if (file.fieldname === "brochure")  return pdfFilter(req, file, cb);
    /* Silently ignore unknown fields */
    cb(null, false);
  },
});

/**
 * uploadCourseAssets
 * Middleware for course create / update.
 * Accepts: thumbnail (optional image), roadmap (optional image), brochure (optional PDF).
 * All fields optional — controllers handle null req.files safely.
 */
export const uploadCourseAssets = (req, res, next) => {
  const upload = courseAssetMulter.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "roadmap",   maxCount: 1 },
    { name: "brochure",  maxCount: 1 },
  ]);

  upload(req, res, (err) => {
    if (err instanceof multer.MulterError || err) {
      return res.status(400).json({
        success: false,
        message: err.message || "File upload failed",
      });
    }
    next();
  });
};

/**
 * uploadCourseFiles
 * ✅ Exact alias for uploadCourseAssets.
 * admin.routes.js imports this name — keeping both so
 * neither file needs to change.
 */
export const uploadCourseFiles = uploadCourseAssets;

/* ═══════════════════════════════════════
   🎬 VIDEO UPLOAD
   Single video file, up to 2 GB.
   Uses video/ MIME type filter.
═══════════════════════════════════════ */
const videoMulter = multer({
  storage:    getStorage("videos", "videos"),
  fileFilter: videoFilter,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2 GB
    files:    1,
  },
});

export const uploadVideo = (req, res, next) => {
  const upload = videoMulter.single("video");

  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          message: "Video file is too large. Maximum allowed size is 2 GB.",
        });
      }
      return res.status(400).json({
        success: false,
        message: err.message || "Video upload failed",
      });
    }
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || "Video upload failed",
      });
    }
    next();
  });
};

/* ═══════════════════════════════════════
   👤 PROFILE IMAGE UPLOAD
   Single image for user avatar, up to 5MB.
   Field name: "avatar"
═══════════════════════════════════════ */
const profileMulter = multer({
  storage:    getStorage("profiles", "profiles"),
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
    files:    1,
  },
});

export const uploadProfileImage = (req, res, next) => {
  const upload = profileMulter.single("avatar");
  upload(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || "Profile image upload failed" });
    }
    next();
  });
};

/* ═══════════════════════════════════════
   🖼️ SINGLE IMAGE UPLOAD (GENERIC)
   For banners, thumbnails, etc.
   Field name: "image"
   Limit: 10 MB
═══════════════════════════════════════ */
const singleImageMulter = multer({
  storage:    getStorage("images", "images"),
  fileFilter: imageFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
    files:    1,
  },
});

export const uploadSingleImage = (req, res, next) => {
  const upload = singleImageMulter.single("image");
  upload(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || "Image upload failed" });
    }
    next();
  });
};

/* ════════════════════════════════════════
   DISCUSSION IMAGES
   Up to 4 images per discussion post.
════════════════════════════════════════ */
const discussionImageMulter = multer({
  storage:    getStorage("discussion", "discussion"),
  fileFilter: imageFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files:    4,
  },
});

export const uploadDiscussionImages = (req, res, next) => {
  const upload = discussionImageMulter.array("images", 4);
  upload(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || "Discussion image upload failed",
      });
    }
    next();
  });
};

/* ═══════════════════════════════════════
   📎 GENERIC SINGLE FILE UPLOAD
   Returns a middleware for any field name.
   Accepts any file type, up to 20 MB.

   Usage:
     router.post("/upload", uploadSingle("brochure"), handler)
     router.post("/upload", uploadSingle(),           handler) // default "file"
═══════════════════════════════════════ */
const genericMulter = multer({
  storage:    getStorage("misc", "misc"),
  fileFilter: anyFileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB
    files:    1,
  },
});

export const uploadSingle = (fieldName = "file") =>
  (req, res, next) => {
    const upload = genericMulter.single(fieldName);
    upload(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message || "File upload failed",
        });
      }
      next();
    });
  };

/* ═══════════════════════════════════════
   🛡️ HANDLE UPLOAD ERROR
   Express 4-argument error-handler middleware.
   Place AFTER any upload middleware in route
   to return clean JSON instead of HTML 500.

   Usage (per-route):
     router.post("/courses", uploadCourseAssets, handleUploadError, createCourse)

   Usage (global — add once after all routes in app.js):
     app.use(handleUploadError)
═══════════════════════════════════════ */
// eslint-disable-next-line no-unused-vars
export const handleUploadError = (err, req, res, next) => {
  if (!err) return next();

  /* Multer-specific errors */
  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE:       "File is too large. Check the allowed size for this upload.",
      LIMIT_FILE_COUNT:      "Too many files uploaded at once.",
      LIMIT_FIELD_KEY:       "Form field name is too long.",
      LIMIT_FIELD_VALUE:     "Form field value is too long.",
      LIMIT_FIELD_COUNT:     "Too many fields in the request.",
      LIMIT_UNEXPECTED_FILE: "Unexpected file field name.",
    };
    return res.status(400).json({
      success: false,
      message: messages[err.code] || err.message || "Upload error",
    });
  }

  /* File-filter errors (wrong MIME type) */
  if (err?.message) {
    return res.status(400).json({ success: false, message: err.message });
  }

  /* Unknown upload error — pass to global error handler */
  next(err);
};

/**
 * handleMulterError
 * ✅ Alias for handleUploadError.
 * Some files import this name — keeping both.
 */
export const handleMulterError = handleUploadError;

/* ─────────────────────────────────────────
   DEFAULT EXPORT (convenience — use named
   exports whenever possible)
───────────────────────────────────────── */
export default {
  uploadCourseAssets,
  uploadCourseFiles,
  uploadVideo,
  uploadProfileImage,
  uploadSingleImage,
  uploadDiscussionImages,
  uploadSingle,
  handleUploadError,
  handleMulterError,
};
