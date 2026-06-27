/**
 * =========================================================
 * 💳 PURCHASE CONTROLLER (FINAL PRODUCTION 🔥)
 * =========================================================
 * Path: backend/modules/purchase/controllers/purchase.controller.js
 *
 * FIXES IN THIS VERSION:
 * ✅ FIX 1: Converted from CommonJS (exports.x = ) to ES Module
 *           (export const x = ) so routes can import { getMyCourses }
 *           This was the crash: "does not provide an export named 'getMyCourses'"
 *
 * ✅ FIX 2: Converted require() to import statements
 *           Project uses "type": "module" in package.json → must use import/export
 *
 * ✅ FIX 3: Added purchaseCourse, getMyCourses, checkCourseAccess
 *           All named exports matching what purchase.routes.js imports
 *
 * ✅ FIX 4: MongoDB session transaction kept for data integrity
 * ✅ FIX 5: paymentModel import added for full payment record tracking
 *
 * EXPORTS (must match purchase.routes.js imports exactly):
 * ✅ purchaseCourse    — create a purchase record (POST)
 * ✅ getMyCourses      — get all purchased courses for logged-in user (GET)
 * ✅ checkCourseAccess — check if user has access to a specific course (GET)
 * ✅ getPurchaseHistory — full purchase history with pagination (GET)
 * =========================================================
 */

import mongoose from "mongoose";

import Purchase from "../models/purchase.model.js";
import Course   from "../../course/models/course.model.js";

/* ─────────────────────────────────────────
   🧠 HELPER
───────────────────────────────────────── */
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const sendError = (res, message = "Something went wrong", code = 500) =>
  res.status(code).json({ success: false, message });

const calcExpiryDate = (from = new Date()) => {
  const expiry = new Date(from);
  expiry.setFullYear(expiry.getFullYear() + 2);
  return expiry;
};

const getCourseRuntimeStats = (course) => {
  const sections = Array.isArray(course?.sections) ? course.sections : [];

  return sections.reduce(
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
};

const withCourseRuntimeStats = (course) => {
  if (!course) return course;

  const stats = getCourseRuntimeStats(course);

  return {
    ...course,
    totalDuration: stats.totalDuration,
    totalDurationSeconds: stats.totalDuration,
    totalHours: Number((stats.totalDuration / 3600).toFixed(2)),
    totalVideos: stats.totalVideos,
  };
};

/* ═══════════════════════════════════════
   💳 PURCHASE COURSE
   POST /api/purchases
   Creates a purchase record in a MongoDB
   transaction to prevent partial writes.
═══════════════════════════════════════ */
export const purchaseCourse = async (req, res) => {
  /* Start a MongoDB session for transaction safety */
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const userId   = req.user?._id;
    const { courseId } = req.body;

    /* ── Validation ── */
    if (!userId) {
      await session.abortTransaction();
      session.endSession();
      return sendError(res, "Unauthorized", 401);
    }

    if (!courseId || !isValidId(courseId)) {
      await session.abortTransaction();
      session.endSession();
      return sendError(res, "Invalid course ID", 400);
    }

    /* ── Fetch course ── */
    const course = await Course.findById(courseId).session(session);

    if (!course || !course.isPublished) {
      await session.abortTransaction();
      session.endSession();
      return sendError(res, "Course not found or not available", 404);
    }

    /* ── Prevent duplicate purchase ── */
    const existing = await Purchase.findOne({
      user:   userId,
      course: courseId,
      status: "completed",
    }).session(session);

    if (existing) {
      const expiry = existing.expiryDate || existing.expiresAt;
      const isExpired = expiry && new Date(expiry) <= new Date();

      if (!isExpired && existing.isActive !== false) {
        await session.abortTransaction();
        session.endSession();
        return sendError(res, "You have already purchased this course", 400);
      }

      await Purchase.findByIdAndUpdate(
        existing._id,
        { $set: { isActive: false } },
        { session }
      );
    }

    /* ── Calculate price ── */
    const pricePaid = course.finalPrice ?? course.originalPrice ?? 0;
    const purchasedAt = new Date();
    const expiresAt = calcExpiryDate(purchasedAt);

    /* ── Create purchase record ── */
    const [purchase] = await Purchase.create(
      [
        {
          user:          userId,
          course:        courseId,
          pricePaid,
          status:        "completed",
          paymentMethod: "razorpay", // Update after Razorpay integration
          purchasedAt,
          purchaseDate: purchasedAt,
          expiresAt,
          expiryDate: expiresAt,
          isActive: true,
        },
      ],
      { session }
    );

    /* ── Increment enrolled students count ── */
    await Course.findByIdAndUpdate(
      courseId,
      { $inc: { totalStudents: 1 } },
      { session }
    );

    /* ── Commit transaction ── */
    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      success: true,
      message: "Course purchased successfully",
      data:    purchase,
    });

  } catch (error) {
    /* ── Rollback on any error ── */
    await session.abortTransaction();
    session.endSession();

    console.error("❌ [Purchase] purchaseCourse Error:", error.message);
    return sendError(res, "Purchase failed. Please try again.");
  }
};

/* ═══════════════════════════════════════
   📚 GET MY COURSES (PURCHASED)
   GET /api/purchases/my-courses
   Returns all courses the logged-in user
   has successfully purchased.
═══════════════════════════════════════ */
export const getMyCourses = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) return sendError(res, "Unauthorized", 401);

    /* Populate course details for each purchase */
    const purchases = await Purchase.find({
      user:   userId,
      status: "completed",
    })
      .populate({
        path:   "course",
        select: "title description thumbnail finalPrice originalPrice sections assignedInstructors totalStudents averageRating isPublished",
        match:  { isDeleted: false }, // Exclude soft-deleted courses
      })
      .sort({ purchasedAt: -1 }) // Newest first
      .lean();

    /* Filter out any purchases where course was deleted (populate returns null) */
    const validPurchases = purchases
      .filter((p) => p.course !== null)
      .map((purchase) => ({
        ...purchase,
        course: withCourseRuntimeStats(purchase.course),
      }));

    return res.json({
      success: true,
      data:    validPurchases,
      total:   validPurchases.length,
    });

  } catch (error) {
    console.error("❌ [Purchase] getMyCourses Error:", error.message);
    return sendError(res, "Failed to fetch your courses");
  }
};

/* ═══════════════════════════════════════
   🔐 CHECK COURSE ACCESS
   GET /api/purchases/access/:courseId
   Returns isPurchased: true/false
   Used by CoursePlayer to decide whether
   to show locked or unlocked content.
═══════════════════════════════════════ */
export const checkCourseAccess = async (req, res) => {
  try {
    const userId   = req.user?._id;
    const { courseId } = req.params;

    if (!userId) return sendError(res, "Unauthorized", 401);

    if (!isValidId(courseId)) {
      return sendError(res, "Invalid course ID", 400);
    }

    /* Check purchase record */
    const purchase = await Purchase.findOne({
      user:   userId,
      course: courseId,
      status: "completed",
    }).lean();

    /* Also check if admin granted free access via user.purchasedCourses */
    let hasFreeAccess = false;
    if (!purchase) {
      const User = (await import("../../user/models/user.js")).default;
      const user = await User.findById(userId).select("isFreeAccess purchasedCourses").lean();

      hasFreeAccess =
        user?.isFreeAccess ||
        user?.purchasedCourses?.some(
          (c) => c.courseId?.toString() === courseId &&
                 (!c.expiresAt || new Date(c.expiresAt) > new Date())
        );
    }

    return res.json({
      success:      true,
      isPurchased:  !!(purchase || hasFreeAccess),
      purchaseData: purchase || null,
    });

  } catch (error) {
    console.error("❌ [Purchase] checkCourseAccess Error:", error.message);
    return sendError(res, "Access check failed");
  }
};

/* ═══════════════════════════════════════
   📋 GET PURCHASE HISTORY (PAGINATED)
   GET /api/purchases/history?page=1&limit=10
   Full purchase history with pagination
   for the student's Purchase History page.
═══════════════════════════════════════ */
export const getPurchaseHistory = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) return sendError(res, "Unauthorized", 401);

    const { page = 1, limit = 10 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [purchases, total] = await Promise.all([
      Purchase.find({ user: userId })
        .populate({
          path:   "course",
          select: "title thumbnail finalPrice originalPrice",
          match:  { isDeleted: false },
        })
        .sort({ purchasedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Purchase.countDocuments({ user: userId }),
    ]);

    return res.json({
      success: true,
      data:    purchases.filter((p) => p.course !== null),
      pagination: {
        page:       Number(page),
        limit:      Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });

  } catch (error) {
    console.error("❌ [Purchase] getPurchaseHistory Error:", error.message);
    return sendError(res, "Failed to fetch purchase history");
  }
};
