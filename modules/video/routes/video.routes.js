/**
 * 🎥 VIDEO ROUTES (PRODUCTION)
 * ------------------------------------------------
 * ✅ Instructor upload route
 * ✅ Protected + role-based
 */

import express from "express";
const router = express.Router();

/* =========================================================
   🔐 MIDDLEWARES
========================================================= */

import { protect } from "../../../shared/middleware/auth.middleware.js";
import { allowRoles } from "../../../shared/middleware/role.middleware.js";

/* =========================================================
   📦 CONTROLLER
========================================================= */

import { uploadVideo } from "../controllers/video.controller.js";

/* =========================================================
   📁 FILE UPLOAD (MULTER)
========================================================= */

import multer from "multer";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/videos/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

/* =========================================================
   🚀 ROUTES
========================================================= */

/**
 * 🎬 INSTRUCTOR → UPLOAD VIDEO
 */
router.post(
  "/upload",
  protect,
  allowRoles("instructor"),
  upload.single("video"),
  uploadVideo
);

/* =========================================================
   📦 EXPORT
========================================================= */

export default router;