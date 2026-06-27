/**
 * =========================================================
 * 👑 ADMIN CONTROLLER (FINAL PRODUCTION 🔥)
 * =========================================================
 * Path: backend/modules/admin/controllers/admin.controller.js
 *
 * This file handles:
 * ✅ Dashboard stats
 * ✅ Coupon management (createCoupon, getCoupons, deleteCoupon, validateCoupon)
 * ✅ Notifications (sendNotification)
 * ✅ Video deletion (deleteVideo)
 *
 * User management     → user.admin.controller.js
 * Instructor mgmt     → instructor.admin.controller.js
 * Course CRUD         → course.admin.controller.js
 * =========================================================
 */

import mongoose from "mongoose";
import User         from "../../user/models/user.js";
import Course       from "../../course/models/course.model.js";
import Coupon       from "../models/coupon.model.js";
import Notification from "../../notification/models/notification.model.js";

/* ─────────────────────────────────────────
   🧠 HELPER
───────────────────────────────────────── */
const sendError = (res, message = "Something went wrong", code = 500) =>
  res.status(code).json({ success: false, message });

const TARGET_MAP = {
  all: "ALL",
  students: "USERS",
  users: "USERS",
  instructors: "INSTRUCTORS",
  ALL: "ALL",
  USERS: "USERS",
  INSTRUCTORS: "INSTRUCTORS",
};

const ALLOWED_NOTIFICATION_TYPES = new Set([
  "info",
  "warning",
  "success",
  "system",
  "course",
  "promotion",
  "admin",
]);

const normalizeNotificationTarget = (target = "ALL") =>
  TARGET_MAP[String(target).trim()] || "ALL";

/* ═══════════════════════════════════════
   📊 DASHBOARD STATS
═══════════════════════════════════════ */
/**
 * @desc    Get high-level stats for the Super Admin Dashboard
 * @route   GET /api/admin/stats
 * @access  Admin only
 */
export const getDashboardStats = async (req, res) => {
  try {
    const [users, instructors, courses, activeCoupons] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "instructor" }),
      Course.countDocuments({ isDeleted: false }),
      Coupon.countDocuments({ isActive: true }),
    ]);

    return res.status(200).json({
      success: true,
      data: { users, instructors, courses, activeCoupons },
    });
  } catch (error) {
    console.error("❌ [Admin] getDashboardStats Error:", error.message);
    return sendError(res);
  }
};

/* ═══════════════════════════════════════
   🎬 VIDEO MANAGEMENT
═══════════════════════════════════════ */
/**
 * @desc    Admin override to permanently delete a video from a course section
 * @route   DELETE /api/admin/courses/:courseId/sections/:sectionId/videos/:videoId
 * @access  Admin only
 */
export const deleteVideo = async (req, res) => {
  try {
    const { courseId, sectionId, videoId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return sendError(res, "Invalid course ID", 400);
    }

    const course = await Course.findById(courseId);
    if (!course) return sendError(res, "Course not found", 404);

    const section = course.sections?.id(sectionId);
    if (!section) return sendError(res, "Section not found", 404);

    const videoExists = section.videos?.some(
      (v) => v._id.toString() === videoId
    );
    if (!videoExists) return sendError(res, "Video not found", 404);

    section.videos = section.videos.filter(
      (v) => v._id.toString() !== videoId
    );

    await course.save();

    return res.status(200).json({
      success: true,
      message: "Video permanently removed via admin override",
    });
  } catch (error) {
    console.error("❌ [Admin] deleteVideo Error:", error.message);
    return sendError(res);
  }
};

/* ═══════════════════════════════════════
   🎟️ COUPON MANAGEMENT
═══════════════════════════════════════ */

/**
 * @desc    Get all coupons (active + inactive)
 * @route   GET /api/admin/coupons
 * @access  Admin only
 */
export const getCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 }).lean();
    return res.status(200).json({ success: true, data: coupons });
  } catch (error) {
    console.error("❌ [Admin] getCoupons Error:", error.message);
    return sendError(res);
  }
};

/**
 * @desc    Create a new discount coupon
 * @route   POST /api/admin/coupons
 * @access  Admin only
 * @body    { code, discount, expiresAt?, usageLimit? }
 */
export const createCoupon = async (req, res) => {
  try {
    const { code, discount, expiresAt, usageLimit } = req.body;

    if (!code || !discount) {
      return sendError(res, "Coupon code and discount percentage are required", 400);
    }

    const cleanCode = code.trim().toUpperCase();
    const discountValue = Number(discount);
    const usageLimitValue =
      usageLimit === "" || usageLimit === null || usageLimit === undefined
        ? null
        : Number(usageLimit);

    if (!Number.isFinite(discountValue) || discountValue < 1 || discountValue > 100) {
      return sendError(res, "Discount must be between 1 and 100", 400);
    }

    if (
      usageLimitValue !== null &&
      (!Number.isFinite(usageLimitValue) || usageLimitValue < 1)
    ) {
      return sendError(res, "Usage limit must be a positive number", 400);
    }

    const exists = await Coupon.findOne({ code: cleanCode });
    if (exists) return sendError(res, "Coupon code already exists", 400);

    const coupon = await Coupon.create({
      code:       cleanCode,
      discount:   discountValue,
      expiresAt:  expiresAt  ? new Date(expiresAt)  : null,
      usageLimit: usageLimitValue,
      isActive:   true,
      usedCount:  0,
      createdBy:  req.user?._id || null,
    });

    return res.status(201).json({
      success: true,
      message: "Coupon created successfully",
      data:    coupon,
    });
  } catch (error) {
    console.error("❌ [Admin] createCoupon Error:", error.message);
    return sendError(res);
  }
};

/**
 * @desc    Update an existing discount coupon
 * @route   PUT /api/admin/coupons/:id
 * @access  Admin only
 * @body    { code?, discount?, expiresAt?, usageLimit?, isActive? }
 */
export const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, "Invalid coupon ID", 400);
    }

    const coupon = await Coupon.findById(id);
    if (!coupon) return sendError(res, "Coupon not found", 404);

    const { code, discount, expiresAt, usageLimit, isActive } = req.body;
    const update = {};

    if (code !== undefined) {
      const cleanCode = String(code).trim().toUpperCase();
      if (!cleanCode) return sendError(res, "Coupon code is required", 400);

      const duplicate = await Coupon.findOne({
        _id: { $ne: id },
        code: cleanCode,
      }).lean();
      if (duplicate) return sendError(res, "Coupon code already exists", 400);

      update.code = cleanCode;
    }

    if (discount !== undefined) {
      const discountValue = Number(discount);
      if (!Number.isFinite(discountValue) || discountValue < 1 || discountValue > 100) {
        return sendError(res, "Discount must be between 1 and 100", 400);
      }
      update.discount = discountValue;
    }

    if (expiresAt !== undefined) {
      update.expiresAt = expiresAt ? new Date(expiresAt) : null;
    }

    if (usageLimit !== undefined) {
      const usageLimitValue =
        usageLimit === "" || usageLimit === null ? null : Number(usageLimit);

      if (
        usageLimitValue !== null &&
        (!Number.isFinite(usageLimitValue) || usageLimitValue < 1)
      ) {
        return sendError(res, "Usage limit must be a positive number", 400);
      }

      if (usageLimitValue !== null && usageLimitValue < coupon.usedCount) {
        return sendError(res, "Usage limit cannot be lower than used count", 400);
      }

      update.usageLimit = usageLimitValue;
    }

    if (isActive !== undefined) {
      update.isActive = Boolean(isActive);
    }

    const updated = await Coupon.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true }
    ).lean();

    return res.status(200).json({
      success: true,
      message: "Coupon updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("âŒ [Admin] updateCoupon Error:", error.message);
    return sendError(res);
  }
};

/**
 * @desc    Validate a coupon code during checkout
 * @route   POST /api/admin/coupons/validate
 * @access  Admin only
 * @body    { code, amount }
 */
export const validateCoupon = async (req, res) => {
  try {
    const { code, amount } = req.body;

    if (!code) return sendError(res, "Coupon code is required", 400);

    const coupon = await Coupon.findOne({
      code:     code.trim().toUpperCase(),
      isActive: true,
    });

    if (!coupon) return sendError(res, "Invalid or expired coupon code", 404);

    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      return sendError(res, "This coupon has expired", 400);
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return sendError(res, "Coupon usage limit has been reached", 400);
    }

    const discountAmount = amount ? (Number(amount) * coupon.discount) / 100 : 0;
    const finalPrice     = amount ? Number(amount) - discountAmount : 0;

    return res.status(200).json({
      success: true,
      data: {
        code:               coupon.code,
        discountPercentage: coupon.discount,
        discountAmount:     Math.round(discountAmount),
        finalPrice:         Math.round(finalPrice),
        usedCount:          coupon.usedCount,
        usageLimit:         coupon.usageLimit,
        remaining:          coupon.usageLimit
          ? coupon.usageLimit - coupon.usedCount
          : "Unlimited",
      },
    });
  } catch (error) {
    console.error("❌ [Admin] validateCoupon Error:", error.message);
    return sendError(res);
  }
};

/**
 * @desc    Delete a coupon permanently
 * @route   DELETE /api/admin/coupons/:id
 * @access  Admin only
 */
export const deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) return sendError(res, "Coupon not found", 404);

    return res.status(200).json({
      success: true,
      message: "Coupon deleted successfully",
    });
  } catch (error) {
    console.error("❌ [Admin] deleteCoupon Error:", error.message);
    return sendError(res);
  }
};

/* ═══════════════════════════════════════
   🔔 NOTIFICATIONS
═══════════════════════════════════════ */
/**
 * @desc    Broadcast a notification to all / students / instructors
 * @route   POST /api/admin/notification
 * @access  Admin only
 * @body    { title, message, target: "ALL" | "USERS" | "INSTRUCTORS" }
 */
export const sendNotification = async (req, res) => {
  try {
    const {
      title = "Admin Notification",
      message,
      target = "ALL",
      type = "admin",
    } = req.body;

    if (!message || !message.trim()) {
      return sendError(res, "Message is required", 400);
    }
    if (message.trim().length < 5) {
      return sendError(res, "Message must be at least 5 characters", 400);
    }
    if (!title || !title.trim() || title.trim().length < 3) {
      return sendError(res, "Title must be at least 3 characters", 400);
    }

    const normalizedTarget = normalizeNotificationTarget(target);
    const safeType = ALLOWED_NOTIFICATION_TYPES.has(type) ? type : "admin";

    let userFilter = {};
    if (normalizedTarget === "USERS")       userFilter = { role: "student"    };
    if (normalizedTarget === "INSTRUCTORS") userFilter = { role: "instructor" };

    const users = await User.find(userFilter).select("_id").lean();

    if (!users.length) {
      return sendError(res, "No users found matching the target audience", 404);
    }

    const notificationDocs = users.map((u) => ({
      user:      u._id,
      title:     title.trim(),
      message:   message.trim(),
      type:      safeType,
      target:    normalizedTarget,
      isRead:    false,
      isPublic:  true,
      createdBy: req.user?._id || req.user?.id || null,
    }));

    await Notification.insertMany(notificationDocs, { ordered: false });

    return res.status(201).json({
      success:     true,
      message:     "Notification broadcast successful",
      deliveredTo: users.length,
      target:      normalizedTarget,
      type:        safeType,
    });
  } catch (error) {
    console.error("❌ [Admin] sendNotification Error:", error.message);
    return sendError(res);
  }
};

/**
 * @desc    Delete notifications older than an admin-selected age
 * @route   DELETE /api/admin/notifications/cleanup
 * @access  Admin only
 * @body    { days: 10 }
 */
export const deleteOldNotifications = async (req, res) => {
  try {
    const days = Number(req.body?.days);

    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return sendError(res, "Days must be a whole number between 1 and 365", 400);
    }

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await Notification.deleteMany({ createdAt: { $lt: cutoff } });

    return res.status(200).json({
      success: true,
      message: `Deleted notifications older than ${days} day${days === 1 ? "" : "s"}`,
      deletedCount: result.deletedCount || 0,
      cutoff,
    });
  } catch (error) {
    console.error("[Admin] deleteOldNotifications Error:", error.message);
    return sendError(res, "Failed to delete old notifications");
  }
};
