import express from "express";
import { protect } from "../../../shared/middleware/auth.middleware.js";
import { allowRoles } from "../../../shared/middleware/role.middleware.js";
import {
  handleUploadError,
  uploadDiscussionImages,
} from "../../../shared/middleware/upload.middleware.js";
import {
  addDiscussionComment,
  createDiscussionPost,
  createPoll,
  deleteDiscussion,
  getDiscussionPosts,
  pinDiscussion,
  recordDiscussionShare,
  shareDiscussionLink,
  toggleDiscussionLike,
  votePoll,
} from "../controllers/discussion.controller.js";

const router = express.Router();

router.get("/", protect, getDiscussionPosts);
router.post(
  "/",
  protect,
  allowRoles("student", "instructor", "admin"),
  uploadDiscussionImages,
  handleUploadError,
  createDiscussionPost
);
router.post("/polls", protect, allowRoles("admin"), createPoll);
router.post(
  "/links",
  protect,
  allowRoles("student", "instructor", "admin"),
  uploadDiscussionImages,
  handleUploadError,
  shareDiscussionLink
);
router.post("/:id/comments", protect, allowRoles("student", "instructor", "admin"), addDiscussionComment);
router.post("/:id/like", protect, allowRoles("student", "instructor", "admin"), toggleDiscussionLike);
router.post("/:id/share", protect, allowRoles("student", "instructor", "admin"), recordDiscussionShare);
router.post("/:id/vote", protect, allowRoles("student", "instructor", "admin"), votePoll);
router.patch("/:id/pin", protect, allowRoles("admin"), pinDiscussion);
router.delete("/:id", protect, allowRoles("student", "instructor", "admin"), deleteDiscussion);

export default router;
