import express from "express";
import { protect } from "../../../shared/middleware/auth.middleware.js";
import {
  saveProgress,
  getCourseProgress,
} from "../controllers/progress.controller.js";

const router = express.Router();

/* 📊 SAVE */
router.post("/", protect, saveProgress);

/* 📈 GET PROGRESS */
router.get("/:courseId", protect, getCourseProgress);

export default router;