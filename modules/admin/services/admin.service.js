// 📁 modules/admin/services/admin.service.js

import mongoose from "mongoose";
import User from "../../user/models/user.js";
import Coupon from "../models/coupon.model.js";
import Notification from "../../notification/models/notification.model.js";

/**
 * 🧠 Helper: Calculate expiry date
 */
const calculateExpiry = (days = 30) => {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
};

/**
 * 📊 DASHBOARD STATS
 */
export const getDashboardStats = async () => {
  const [users, instructors] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: "instructor" }),
  ]);

  return {
    users,
    instructors,
  };
};

/**
 * 👥 GET USERS
 */
export const getAllUsers = async () => {
  return await User.find().select("-password").lean();
};

/**
 * 🎓 GIVE FREE ACCESS (SAFE)
 */
export const giveFreeAccess = async ({ email, phone, courseId, months = 6 }) => {
  if (!courseId) throw new Error("Course ID is required");

  const user = await User.findOne({
    $or: [{ email }, { phone }],
  });

  if (!user) throw new Error("User not found");

  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + months);

  // ✅ Prevent duplicate free access
  const alreadyExists = user.purchasedCourses.some(
    (c) => c.courseId.toString() === courseId
  );

  if (alreadyExists) {
    throw new Error("User already has access to this course");
  }

  user.purchasedCourses.push({
    courseId,
    accessType: "free",
    expiresAt,
  });

  await user.save();

  return user;
};

/**
 * 🚀 PROMOTE USER → INSTRUCTOR (LEGACY SUPPORT)
 */
export const promoteToInstructor = async ({ email, phone }) => {
  const user = await User.findOne({
    $or: [{ email }, { phone }],
  });

  if (!user) throw new Error("User not found");

  user.role = "instructor";

  await user.save();

  return user;
};

/**
 * ✅ GRANT INSTRUCTOR ACCESS (🔥 MAIN FIX)
 * Enterprise-level:
 * - Idempotent
 * - Safe
 * - Validated
 * - Transaction supported
 */
export const grantInstructorAccess = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await User.findById(userId).session(session);

    if (!user) {
      throw new Error("User not found");
    }

    // ✅ Idempotency: avoid unnecessary updates
    const alreadyActive =
      user.role === "instructor" &&
      user.isInstructorActive === true &&
      user.approvedByAdmin === true &&
      user.permissionExpiry &&
      new Date(user.permissionExpiry) > new Date();

    if (alreadyActive) {
      await session.commitTransaction();
      session.endSession();
      return user;
    }

    // ✅ Update instructor permissions
    user.role = "instructor";
    user.isInstructorActive = true;
    user.approvedByAdmin = true;
    user.permissionExpiry = calculateExpiry(30); // configurable

    await user.save({ session });

    await session.commitTransaction();
    session.endSession();

    return user;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

/**
 * ❌ REVOKE INSTRUCTOR ACCESS (IMPORTANT)
 */
export const revokeInstructorAccess = async (userId) => {
  const user = await User.findById(userId);

  if (!user) throw new Error("User not found");

  user.isInstructorActive = false;
  user.approvedByAdmin = false;

  await user.save();

  return user;
};

/**
 * 🔔 SEND NOTIFICATION TO ALL USERS
 */
export const sendNotificationToAll = async (message) => {
  if (!message) throw new Error("Message is required");

  const users = await User.find().select("_id");

  const notifications = users.map((u) => ({
    userId: u._id,
    message,
    type: "admin_message",
    read: false,
    createdAt: new Date(),
  }));

  await Notification.insertMany(notifications);
};

/**
 * 🎟️ CREATE COUPON (SAFE)
 */
export const createCoupon = async ({ code, discount, expiry }) => {
  if (!code || !discount) {
    throw new Error("Code and discount are required");
  }

  const existing = await Coupon.findOne({ code });

  if (existing) {
    throw new Error("Coupon already exists");
  }

  const coupon = new Coupon({
    code,
    discount,
    expiry,
    isActive: true,
  });

  await coupon.save();

  return coupon;
};