/**
 * =========================================================
 * 👥 ADMIN → USER CONTROLLER (FINAL PRODUCTION 🔥)
 * =========================================================
 * Path: backend/modules/admin/controllers/user.admin.controller.js
 *
 * Named exports (must match admin.routes.js imports exactly):
 * ✅ getUsers
 * ✅ getUserById
 * ✅ updateUserRole      ← THE 500 FIX
 * ✅ toggleUserBlock
 * ✅ getFreeUsers         ← NEW dedicated free users list
 * ✅ giveFreeAccess
 * ✅ revokeFreeAccess
 * ✅ giveAccess
 *
 * ROOT CAUSE OF 500 ERROR + FIX:
 * ─────────────────────────────────────────────────────────
 * Old code (causes 500):
 *   const user = await User.findById(id);
 *   user.role = req.body.role;
 *   await user.save();   ← PROBLEM
 *
 * Why it crashed:
 *   The User schema has a pre("save") hook that checks
 *   isModified("password"). When you call .save() after
 *   modifying .role, Mongoose marks the whole document as
 *   modified. In some schema setups this triggers the hook
 *   which tries to hash an undefined password → bcrypt throws
 *   → unhandled error → Express returns 500.
 *
 * Fix:
 *   Use findByIdAndUpdate() with $set operator.
 *   This is a direct MongoDB write that completely BYPASSES
 *   all Mongoose pre-save middleware. Safe, fast, correct.
 * ─────────────────────────────────────────────────────────
 * =========================================================
 */

import mongoose from "mongoose";
import User     from "../../user/models/user.js";
import {
  ADMIN_PAGE_PERMISSIONS,
  getEffectiveAdminAccess,
  normalizeAdminPages,
} from "../../../shared/constants/adminPages.js";

/* ─────────────────────────────────────────
   🧠 HELPERS
───────────────────────────────────────── */

/** Check if string is a valid MongoDB ObjectId before any DB call */
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/** Consistent error response shape */
const sendError = (res, message = "Something went wrong", code = 500) =>
  res.status(code).json({ success: false, message });

const toAdminAccessUser = (user) => {
  const plainUser = typeof user?.toObject === "function" ? user.toObject() : user;
  return {
    ...plainUser,
    adminAccess: getEffectiveAdminAccess(plainUser),
  };
};

/* =========================================================
   ADMIN ACCESS OPTIONS
========================================================= */
export const getAdminAccessOptions = async (req, res) => {
  return res.json({
    success: true,
    data: ADMIN_PAGE_PERMISSIONS,
  });
};

/* =========================================================
   ADMIN ACCESS USERS
========================================================= */
export const getAdminAccessUsers = async (req, res) => {
  try {
    const { page = 1, limit = 50, role = "all", search } = req.query;
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const safePage = Math.max(Number(page) || 1, 1);
    const skip = (safePage - 1) * safeLimit;

    const query = {};

    if (role && role !== "all") {
      query.role = role;
    }

    if (search) {
      query.$or = [
        { name:  { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select("name email phone role adminAccess isBlocked createdAt updatedAt")
        .sort({ role: 1, createdAt: -1 })
        .skip(skip)
        .limit(safeLimit),
      User.countDocuments(query),
    ]);

    return res.json({
      success: true,
      data: users.map(toAdminAccessUser),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    });
  } catch (error) {
    console.error("[UserAdmin] getAdminAccessUsers Error:", error.message);
    return sendError(res, "Failed to fetch admin access users");
  }
};

/* =========================================================
   UPDATE ADMIN ACCESS
========================================================= */
export const updateAdminAccess = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullAccess = false, pages = [] } = req.body;

    if (!isValidObjectId(id)) {
      return sendError(res, "Invalid user ID format", 400);
    }

    if (String(req.user?._id) === String(id)) {
      return sendError(res, "You cannot change your own admin access", 400);
    }

    const normalizedPages = fullAccess ? [] : normalizeAdminPages(pages);

    if (!fullAccess && normalizedPages.length === 0) {
      return sendError(res, "Select at least one admin page or enable full access", 400);
    }

    const existingUser = await User.findById(id).select("adminAccess role");
    if (!existingUser) return sendError(res, "User not found", 404);

    const now = new Date();

    const updatedUser = await User.findByIdAndUpdate(
      id,
      {
        $set: {
          role: "admin",
          "adminAccess.managed": true,
          "adminAccess.fullAccess": Boolean(fullAccess),
          "adminAccess.pages": normalizedPages,
          "adminAccess.grantedBy": existingUser.adminAccess?.grantedBy || req.user?._id,
          "adminAccess.grantedAt": existingUser.adminAccess?.grantedAt || now,
          "adminAccess.updatedAt": now,
        },
      },
      {
        new: true,
        runValidators: true,
        select: "name email phone role adminAccess isBlocked createdAt updatedAt",
      }
    );

    return res.json({
      success: true,
      message: "Admin access updated",
      data: toAdminAccessUser(updatedUser),
    });
  } catch (error) {
    console.error("[UserAdmin] updateAdminAccess Error:", error.message);
    if (error.name === "ValidationError") {
      return sendError(res, error.message, 400);
    }
    return sendError(res, "Failed to update admin access");
  }
};

/* =========================================================
   REVOKE ADMIN ACCESS
========================================================= */
export const revokeAdminAccess = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return sendError(res, "Invalid user ID format", 400);
    }

    if (String(req.user?._id) === String(id)) {
      return sendError(res, "You cannot revoke your own admin access", 400);
    }

    const updatedUser = await User.findByIdAndUpdate(
      id,
      {
        $set: {
          role: "student",
          isInstructorActive: false,
          status: "pending",
          permissionExpiry: null,
          "adminAccess.managed": false,
          "adminAccess.fullAccess": false,
          "adminAccess.pages": [],
          "adminAccess.grantedBy": null,
          "adminAccess.grantedAt": null,
          "adminAccess.updatedAt": new Date(),
        },
      },
      {
        new: true,
        runValidators: true,
        select: "name email phone role adminAccess isBlocked createdAt updatedAt",
      }
    );

    if (!updatedUser) return sendError(res, "User not found", 404);

    return res.json({
      success: true,
      message: "Admin access revoked",
      data: toAdminAccessUser(updatedUser),
    });
  } catch (error) {
    console.error("[UserAdmin] revokeAdminAccess Error:", error.message);
    return sendError(res, "Failed to revoke admin access");
  }
};

/* ═══════════════════════════════════════
   GET ALL USERS
═══════════════════════════════════════ */
/**
 * @desc    Get all users with optional search, role filter, pagination
 * @route   GET /api/admin/users
 * @access  Admin only
 * @query   ?page=1&limit=10&role=student&search=name
 */
export const getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, role, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    /* Build dynamic filter */
    const query = {};
    if (role && role !== "all") query.role = role;
    if (search) {
      query.$or = [
        { name:  { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    /* Parallel fetch for speed */
    const [users, total] = await Promise.all([
      User.find(query)
        .select("-password")      // NEVER return password hash
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      User.countDocuments(query),
    ]);

    return res.json({
      success: true,
      data:    users,
      pagination: {
        page:       Number(page),
        limit:      Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("❌ [UserAdmin] getUsers Error:", error.message);
    return sendError(res, "Failed to fetch users");
  }
};

/* ═══════════════════════════════════════
   GET SINGLE USER BY ID
═══════════════════════════════════════ */
/**
 * @desc    Get a single user by MongoDB _id
 * @route   GET /api/admin/users/:id
 * @access  Admin only
 */
export const getUserById = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendError(res, "Invalid user ID format", 400);
    }

    const user = await User.findById(req.params.id).select("-password");
    if (!user) return sendError(res, "User not found", 404);

    return res.json({ success: true, data: user });
  } catch (error) {
    console.error("❌ [UserAdmin] getUserById Error:", error.message);
    return sendError(res);
  }
};

/* ═══════════════════════════════════════
   ✅ UPDATE USER ROLE — THE 500 FIX
═══════════════════════════════════════ */
/**
 * @desc    Update a user's role
 * @route   PUT /api/admin/users/:id/role
 * @access  Admin only
 * @body    { role: 'student' | 'instructor' | 'admin' }
 *
 * THE FIX:
 * Uses findByIdAndUpdate($set) instead of user.save()
 * This bypasses the pre-save bcrypt hook that was causing the 500.
 *
 * When promoting to instructor:
 *   - Sets isInstructorActive: true (can use instructor dashboard immediately)
 *   - Sets status: "approved"
 *   - Sets permissionExpiry: 30 days from now (default)
 *
 * When demoting to student:
 *   - Clears isInstructorActive, permissionExpiry
 */
export const updateUserRole = async (req, res) => {
  try {
    const { id }   = req.params;
    const { role } = req.body;

    /* ── Validate ID ── */
    if (!isValidObjectId(id)) {
      return sendError(res, "Invalid user ID format", 400);
    }

    /* ── Validate role ── */
    const allowedRoles = ["student", "instructor", "admin"];
    if (!role || !allowedRoles.includes(role)) {
      return sendError(
        res,
        `Role must be one of: ${allowedRoles.join(", ")}`,
        400
      );
    }

    /* ── Build update payload ── */
    const updateData = { role };

    if (role === "admin") {
      updateData.adminAccess = {
        managed:   false,
        fullAccess: true,
        pages:      [],
        grantedBy:  req.user?._id || null,
        grantedAt:  new Date(),
        updatedAt:  new Date(),
      };
    }

    if (role === "instructor") {
      /* Auto-activate + set 30-day default on promotion */
      updateData.isInstructorActive = true;
      updateData.status             = "approved";
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 30);
      updateData.permissionExpiry = expiry;
      updateData.adminAccess = {
        managed:   false,
        fullAccess: false,
        pages:      [],
        grantedBy:  null,
        grantedAt:  null,
        updatedAt:  new Date(),
      };
    }

    if (role === "student") {
      /* Clear instructor fields on demotion */
      updateData.isInstructorActive = false;
      updateData.status             = "pending";
      updateData.permissionExpiry   = null;
      updateData.adminAccess = {
        managed:   false,
        fullAccess: false,
        pages:      [],
        grantedBy:  null,
        grantedAt:  null,
        updatedAt:  new Date(),
      };
    }

    /* ── THE FIX: findByIdAndUpdate bypasses pre-save hooks ── */
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $set: updateData },
      {
        new:           true,  // Return the updated doc (not the old one)
        runValidators: true,  // Validate enum values in schema
        select:        "-password",
      }
    );

    if (!updatedUser) return sendError(res, "User not found", 404);

    return res.json({
      success: true,
      message: `Role updated to '${role}' successfully`,
      data:    updatedUser,
    });
  } catch (error) {
    console.error("❌ [UserAdmin] updateUserRole Error:", error.message);
    if (error.name === "ValidationError") {
      return sendError(res, error.message, 400);
    }
    return sendError(res, "Failed to update user role");
  }
};

/* ═══════════════════════════════════════
   BLOCK / UNBLOCK USER
═══════════════════════════════════════ */
/**
 * @desc    Block or unblock a user account
 * @route   PUT /api/admin/users/:id/block
 * @access  Admin only
 * @body    { isBlocked: boolean }
 */
export const toggleUserBlock = async (req, res) => {
  try {
    const { isBlocked } = req.body;

    if (typeof isBlocked !== "boolean") {
      return sendError(res, "isBlocked must be true or false", 400);
    }

    /* findByIdAndUpdate used here too — avoid any pre-save hook issues */
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { isBlocked } },
      { new: true, select: "-password" }
    );

    if (!user) return sendError(res, "User not found", 404);

    return res.json({
      success: true,
      message: isBlocked ? "User blocked" : "User unblocked",
      data:    user,
    });
  } catch (error) {
    console.error("❌ [UserAdmin] toggleUserBlock Error:", error.message);
    return sendError(res);
  }
};

/* ═══════════════════════════════════════
   GET FREE USERS (NEW — DEDICATED PAGE)
═══════════════════════════════════════ */
/**
 * @desc    Get all users with isFreeAccess: true (paginated)
 *          Powers the dedicated /admin/free-users page
 * @route   GET /api/admin/free-users
 * @access  Admin only
 * @query   ?page=1&limit=10&search=name
 */
export const getFreeUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    /* Always filter by isFreeAccess */
    const query = { isFreeAccess: true };

    if (search) {
      query.$or = [
        { name:  { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      User.countDocuments(query),
    ]);

    return res.json({
      success: true,
      data:    users,
      pagination: {
        page:       Number(page),
        limit:      Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("❌ [UserAdmin] getFreeUsers Error:", error.message);
    return sendError(res, "Failed to fetch free access users");
  }
};

/* ═══════════════════════════════════════
   GIVE FREE ACCESS
═══════════════════════════════════════ */
/**
 * @desc    Grant complimentary (free) access to a user
 *          If user hasn't signed up yet — creates a placeholder (pre-approval)
 *          When they register, they inherit free access + see welcome popup
 * @route   POST /api/admin/free-access
 * @access  Admin only
 * @body    { userId?, email?, phone?, days? }
 */
export const giveFreeAccess = async (req, res) => {
  try {
    const { userId, email, phone, days = 30 } = req.body;

    if (!userId && !email && !phone) {
      return sendError(res, "userId, email, or phone is required", 400);
    }

    /* Calculate expiry */
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + Number(days));

    let user = null;

    if (userId && isValidObjectId(userId)) {
      user = await User.findByIdAndUpdate(
        userId,
        { $set: { isFreeAccess: true, freeAccessExpiry: expiry } },
        { new: true, select: "-password" }
      );
    } else {
      const searchQuery = {};
      if (email) searchQuery.email = email.toLowerCase().trim();
      else if (phone) searchQuery.phone = phone.trim();

      user = await User.findOneAndUpdate(
        searchQuery,
        { $set: { isFreeAccess: true, freeAccessExpiry: expiry } },
        { new: true, select: "-password" }
      );

      /* PRE-APPROVAL: user hasn't registered yet → create placeholder */
      if (!user && email) {
        user = await User.create({
          email:            email.toLowerCase().trim(),
          phone:            phone || "",
          name:             email.split("@")[0],
          password:         "TemporaryPassword@123",
          role:             "student",
          isFreeAccess:     true,
          freeAccessExpiry: expiry,
          isPreApproved:    true,
        });
      }
    }

    if (!user) return sendError(res, "User not found", 404);

    return res.json({
      success: true,
      message: `Complimentary access granted for ${days} days`,
      data:    user,
    });
  } catch (error) {
    console.error("❌ [UserAdmin] giveFreeAccess Error:", error.message);
    return sendError(res);
  }
};

/* ═══════════════════════════════════════
   REVOKE FREE ACCESS
═══════════════════════════════════════ */
/**
 * @desc    Revoke complimentary access from a user
 *          After this, user must purchase courses normally
 * @route   POST /api/admin/revoke-access
 * @access  Admin only
 * @body    { userId?, email? }
 */
export const revokeFreeAccess = async (req, res) => {
  try {
    const { userId, email } = req.body;

    if (!userId && !email) {
      return sendError(res, "userId or email is required", 400);
    }

    const query = userId && isValidObjectId(userId)
      ? { _id: userId }
      : { email: email.toLowerCase().trim() };

    const user = await User.findOneAndUpdate(
      query,
      { $set: { isFreeAccess: false, freeAccessExpiry: null } },
      { new: true, select: "-password" }
    );

    if (!user) return sendError(res, "User not found", 404);

    return res.json({
      success: true,
      message: "Free access revoked — user can now purchase courses normally",
      data:    user,
    });
  } catch (error) {
    console.error("❌ [UserAdmin] revokeFreeAccess Error:", error.message);
    return sendError(res);
  }
};

/* ═══════════════════════════════════════
   GIVE COURSE ACCESS (SPECIFIC COURSE)
═══════════════════════════════════════ */
/**
 * @desc    Give a user access to one specific course (no purchase needed)
 * @route   POST /api/admin/give-access
 * @access  Admin only
 * @body    { userId, courseId, days? }
 */
export const giveAccess = async (req, res) => {
  try {
    const { userId, courseId, days } = req.body;

    if (!userId || !courseId) {
      return sendError(res, "userId and courseId are required", 400);
    }

    if (!isValidObjectId(userId) || !isValidObjectId(courseId)) {
      return sendError(res, "Invalid ID format", 400);
    }

    const user = await User.findById(userId);
    if (!user) return sendError(res, "User not found", 404);

    if (!user.purchasedCourses) user.purchasedCourses = [];

    let expiry = null;
    if (days) {
      expiry = new Date();
      expiry.setDate(expiry.getDate() + Number(days));
    }

    /* Update expiry if already has access, otherwise add */
    const existing = user.purchasedCourses.find(
      (c) => c.courseId?.toString() === courseId
    );

    if (existing) {
      existing.expiresAt = expiry;
    } else {
      user.purchasedCourses.push({ courseId, accessType: "free", expiresAt: expiry });
    }

    await user.save();

    return res.json({ success: true, message: "Course access granted" });
  } catch (error) {
    console.error("❌ [UserAdmin] giveAccess Error:", error.message);
    return sendError(res, "Failed to give course access");
  }
};
