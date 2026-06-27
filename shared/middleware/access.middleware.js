import mongoose from "mongoose";
import Purchase from "../../modules/purchase/models/purchase.model.js";

/**
 * 🔒 COURSE ACCESS MIDDLEWARE (FINAL PRODUCTION)
 * ------------------------------------------------
 * ✔ Validates user + courseId
 * ✔ Prevents invalid Mongo queries
 * ✔ Checks purchase
 * ✔ Clean error handling
 */
export const checkCourseAccess = async (req, res, next) => {
  try {
    /**
     * 🔐 USER CHECK
     */
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Please login",
      });
    }

    /**
     * 📥 PARAM VALIDATION
     */
    const { courseId } = req.params;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: "Course ID is required",
      });
    }

    /**
     * ❌ INVALID OBJECT ID
     */
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid course ID",
      });
    }

    /**
     * 🔍 CHECK PURCHASE
     */
    const purchase = await Purchase.findOne({
      user: req.user._id,
      course: courseId,
      status: "completed",
      isActive: { $ne: false },
    }).lean();

    /**
     * ❌ NOT PURCHASED
     */
    if (!purchase) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Please purchase this course.",
      });
    }

    /**
     * ✅ ACCESS GRANTED
     */
    const expiry = purchase.expiryDate || purchase.expiresAt;
    if (expiry && new Date(expiry) <= new Date()) {
      await Purchase.findByIdAndUpdate(purchase._id, {
        $set: { isActive: false },
      });

      return res.status(403).json({
        success: false,
        message: "Access expired. Please renew this course.",
      });
    }

    next();

  } catch (error) {
    console.error("❌ Access Middleware Error:", error);

    return res.status(500).json({
      success: false,
      message: "Access check failed",
    });
  }
};
