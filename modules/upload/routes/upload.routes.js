/**
 * 📦 UPLOAD ROUTES (FINAL PRODUCTION 🔥)
 * ------------------------------------------------
 * ✅ Secure (auth protected)
 * ✅ S3 upload integration
 * ✅ Proper error handling
 * ✅ Clean response structure
 */

import express from "express";
const router = express.Router();

/* =========================================================
   🔐 MIDDLEWARES
========================================================= */
import { protect } from "../../../shared/middleware/auth.middleware.js";

/* =========================================================
   📦 UPLOAD MIDDLEWARE
========================================================= */
import {
  uploadSingle,
  handleUploadError,
} from "../../../shared/middleware/upload.middleware.js";

/* =========================================================
   🚀 UPLOAD FILE (SINGLE)
========================================================= */
router.post(
  "/",
  protect,          // 🔐 require login
  uploadSingle(),   // 📤 upload to S3
  handleUploadError, // 🛑 catch multer errors
  (req, res) => {
    try {
      /* ===============================
         🔒 VALIDATION
      =============================== */
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
        });
      }

      /* ===============================
         ✅ SUCCESS RESPONSE
      =============================== */
      return res.status(200).json({
        success: true,
        message: "File uploaded successfully",
        data: {
          url: req.file.location, // 🔥 S3 URL
          key: req.file.key,      // 🔑 used for delete
          mimetype: req.file.mimetype,
          size: req.file.size,
        },
      });

    } catch (err) {
      console.error("❌ UPLOAD ROUTE ERROR:", err);

      return res.status(500).json({
        success: false,
        message: "Upload failed",
      });
    }
  }
);

export default router;
