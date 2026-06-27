/**
 * =========================================================
 * 👤 USER CONTROLLER (FINAL PRODUCTION 🔥)
 * =========================================================
 * Path: backend/modules/user/controllers/user.controller.js
 *
 * MERGED from two versions — nothing removed:
 *
 * From user.controller.js (v2):
 * ✅ getMe           → GET    /api/users/me
 * ✅ updateMe        → PUT    /api/users/me
 * ✅ changePassword  → PUT    /api/users/me/password
 * ✅ getMyCourses    → GET    /api/users/me/courses
 *
 * From admin.controller.js (v1 — missing functions added):
 * ✅ getAllUsers      → GET    /api/admin/users
 * ✅ updateUserRole  → PATCH  /api/admin/users/:userId/role
 * ✅ grantFreeAccess → POST   /api/admin/users/grant-free
 * ✅ revokeAccess    → DELETE /api/admin/users/:userId/revoke
 * ✅ getProfile      → alias for getMe  (backward compat)
 * ✅ updateProfile   → alias for updateMe (adds gender/birthday/profileImage)
 *
 * Rules applied to every function:
 * ❌ No express-validator — plain JS validation
 * ❌ No next(error) in catch — always sendError(res, ...)
 * ❌ No .save() for non-password updates — findByIdAndUpdate
 * ✅ Password hashed manually before findByIdAndUpdate (no double-hash)
 * =========================================================
 */

import bcrypt   from "bcryptjs";
import mongoose from "mongoose";
import User     from "../models/user.js";
import Course   from "../../course/models/course.model.js";

/* ─────────────────────────────────────────
   🧠 HELPERS
───────────────────────────────────────── */
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const sendError = (res, message = "Something went wrong", code = 500) =>
  res.status(code).json({ success: false, message });

const sendOk = (res, data, message = "Success", code = 200) =>
  res.status(code).json({ success: true, message, data });

/* ═══════════════════════════════════════
   👤 GET MY PROFILE
═══════════════════════════════════════ */
/**
 * @desc    Return the currently authenticated user's profile
 * @route   GET /api/users/me
 * @access  Authenticated (any role)
 */
export const getMe = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;

    const user = await User.findById(userId).select("-password").lean();
    if (!user) return sendError(res, "User not found", 404);

    return sendOk(res, user, "Profile fetched successfully");
  } catch (error) {
    console.error("❌ [UserController] getMe Error:", error.message);
    return sendError(res, "Failed to fetch profile");
  }
};

/* Alias — v1 used getProfile */
export const getProfile = getMe;

/* ═══════════════════════════════════════
   ✏️ UPDATE MY PROFILE
═══════════════════════════════════════ */
/**
 * @desc    Update own profile.
 *          Supports v2 fields (name, bio, avatar, phone)
 *          AND v1 fields (gender, birthday, profileImage).
 *          findByIdAndUpdate bypasses pre-save bcrypt hook.
 * @route   PUT /api/users/me
 * @access  Authenticated (any role)
 * @body    { name?, bio?, avatar?, phone?, gender?, birthday?, profileImage? }
 */
export const updateMe = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;

    const {
      name, email, bio, avatar, phone,
      gender, birthday, profileImage,
    } = req.body;

    const updateData = {};
    if (name         !== undefined) updateData.name         = String(name || "").trim();
    if (email        !== undefined) updateData.email        = String(email || "").trim().toLowerCase();
    if (bio          !== undefined) updateData.bio          = String(bio || "").trim();
    if (avatar       !== undefined) updateData.avatar       = String(avatar || "").trim();
    if (phone        !== undefined) updateData.phone        = String(phone || "").trim();
    if (gender       !== undefined) updateData.gender       = gender;
    if (birthday     !== undefined) updateData.birthday     = birthday || null;
    if (profileImage !== undefined) updateData.avatar       = String(profileImage || "").trim();

    if (updateData.name !== undefined && updateData.name.length < 2) {
      return sendError(res, "Name must be at least 2 characters", 400);
    }

    if (updateData.email !== undefined) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(updateData.email)) {
        return sendError(res, "Please enter a valid email address", 400);
      }

      const existingEmailUser = await User.findOne({
        email: updateData.email,
        _id:   { $ne: userId },
      }).select("_id").lean();

      if (existingEmailUser) {
        return sendError(res, "Email is already in use", 400);
      }
    }

    if (updateData.gender !== undefined) {
      const allowedGenders = ["male", "female", "other", ""];
      updateData.gender = String(updateData.gender || "").toLowerCase();
      if (!allowedGenders.includes(updateData.gender)) {
        return sendError(res, "Gender must be male, female, other or empty", 400);
      }
    }

    if (updateData.birthday) {
      const parsedBirthday = new Date(updateData.birthday);
      if (isNaN(parsedBirthday.getTime())) {
        return sendError(res, "Please enter a valid birthday", 400);
      }
      updateData.birthday = parsedBirthday;
    }

    if (Object.keys(updateData).length === 0) {
      return sendError(res, "No valid fields provided to update", 400);
    }

    const updated = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, select: "-password", runValidators: false }
    );

    if (!updated) return sendError(res, "User not found", 404);

    return sendOk(res, updated, "Profile updated successfully");
  } catch (error) {
    console.error("❌ [UserController] updateMe Error:", error.message);
    return sendError(res, "Failed to update profile");
  }
};

/* Alias — v1 used updateProfile */
export const updateProfile = updateMe;

/* ═══════════════════════════════════════
   🔑 CHANGE PASSWORD
═══════════════════════════════════════ */
/**
 * @desc    Change own password.
 *          Verifies current password, hashes new password manually,
 *          writes via findByIdAndUpdate — no pre-save hook double-hash.
 * @route   PUT /api/users/me/password
 * @access  Authenticated (any role)
 * @body    { currentPassword, newPassword }
 */
export const changePassword = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return sendError(res, "Both currentPassword and newPassword are required", 400);
    }
    if (newPassword.length < 6) {
      return sendError(res, "New password must be at least 6 characters", 400);
    }
    if (currentPassword === newPassword) {
      return sendError(res, "New password must be different from the current password", 400);
    }

    /* password field has select:false in schema — must explicitly request it */
    const user = await User.findById(userId).select("+password");
    if (!user) return sendError(res, "User not found", 404);

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return sendError(res, "Current password is incorrect", 401);

    /* Hash first, then write — bypasses pre-save hook entirely */
    const salt           = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await User.findByIdAndUpdate(
      userId,
      { $set: { password: hashedPassword } },
      { runValidators: false }
    );

    return sendOk(res, null, "Password changed successfully");
  } catch (error) {
    console.error("❌ [UserController] changePassword Error:", error.message);
    return sendError(res, "Failed to change password");
  }
};

/* ═══════════════════════════════════════
   📚 GET MY PURCHASED COURSES
═══════════════════════════════════════ */
/**
 * @desc    Return all courses the user has purchased or been given access to.
 *          Free-access users → all published courses.
 *          Regular users     → only their active (non-expired) purchases.
 * @route   GET /api/users/me/courses
 * @access  Authenticated (any role)
 */
export const getMyCourses = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;

    const user = await User.findById(userId)
      .select("purchasedCourses isFreeAccess")
      .lean();

    if (!user) return sendError(res, "User not found", 404);

    /* Free-access users see everything */
    if (user.isFreeAccess) {
      const courses = await Course.find({ isDeleted: false, isPublished: true })
        .select("title description thumbnail courseId finalPrice isFree level totalStudents averageRating")
        .sort({ createdAt: -1 })
        .lean();
      return sendOk(res, courses, "Free access — all courses available");
    }

    if (!user.purchasedCourses?.length) {
      return sendOk(res, [], "No courses purchased yet");
    }

    /* Filter expired access */
    const now             = new Date();
    const activeCourseIds = user.purchasedCourses
      .filter((pc) => !pc.expiresAt || new Date(pc.expiresAt) > now)
      .map((pc) => pc.courseId);

    if (!activeCourseIds.length) {
      return sendOk(res, [], "All course access has expired");
    }

    const courses = await Course.find({
      _id:         { $in: activeCourseIds },
      isDeleted:   false,
      isPublished: true,
    })
      .select("title description thumbnail courseId finalPrice isFree level totalStudents averageRating sections")
      .lean();

    return sendOk(res, courses, "Purchased courses fetched successfully");
  } catch (error) {
    console.error("❌ [UserController] getMyCourses Error:", error.message);
    return sendError(res, "Failed to fetch courses");
  }
};

/* ═══════════════════════════════════════
   👑 ADMIN: GET ALL USERS (PAGINATED + SEARCH)
   From v1 admin.controller.js — kept here
   so user.routes.js can import from one place.
   Also exported from user.admin.controller.js.
═══════════════════════════════════════ */
/**
 * @desc    Get all users with search, role filter, pagination
 * @route   GET /api/admin/users
 * @access  Admin only
 * @query   ?page=1&limit=10&role=student&search=name&isFreeAccess=true
 */
export const getAllUsers = async (req, res) => {
  try {
    const {
      role, isFreeAccess, search,
      page = 1, limit = 10,
    } = req.query;

    const query = {};
    if (role)                    query.role         = role;
    if (isFreeAccess === "true") query.isFreeAccess = true;
    if (search) {
      query.$or = [
        { name:  { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [users, totalUsers] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select("-password")
        .lean(),
      User.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      count:   users.length,
      data:    users,
      pagination: {
        totalUsers,
        totalPages:  Math.ceil(totalUsers / parseInt(limit)),
        currentPage: parseInt(page),
        limit:       parseInt(limit),
      },
    });
  } catch (error) {
    console.error("❌ [UserController] getAllUsers Error:", error.message);
    return sendError(res, "Failed to fetch users");
  }
};

/* ═══════════════════════════════════════
   👑 ADMIN: UPDATE USER ROLE
   From v1 admin.controller.js.
   Uses findByIdAndUpdate — bypasses pre-save bcrypt hook.
═══════════════════════════════════════ */
/**
 * @desc    Promote/demote user role, set instructor fields.
 * @route   PATCH /api/admin/users/:userId/role
 *          PUT   /api/admin/users/:id/role   (alias in admin.routes.js)
 * @access  Admin only
 * @body    { role, isInstructorActive?, permissionExpiry?, subjects?, bio? }
 */
export const updateUserRole = async (req, res) => {
  try {
    const userId = req.params.userId || req.params.id;
    const { role, isInstructorActive, permissionExpiry, subjects, bio } = req.body;

    if (!isValidObjectId(userId)) {
      return sendError(res, "Invalid user ID", 400);
    }

    const allowedRoles = ["student", "instructor", "admin"];
    if (!role || !allowedRoles.includes(role)) {
      return sendError(res, `Role must be one of: ${allowedRoles.join(", ")}`, 400);
    }

    const updateData = { role };

    if (role === "instructor") {
      updateData.isInstructorActive = isInstructorActive ?? true;
      updateData.status             = "approved";
      updateData.approvedByAdmin    = true;
      updateData.subjects           = subjects || [];
      if (bio) updateData.bio       = bio;

      if (permissionExpiry) {
        const parsed = new Date(permissionExpiry);
        if (isNaN(parsed.getTime())) {
          return sendError(res, "Invalid permissionExpiry date format", 400);
        }
        updateData.permissionExpiry = parsed;
      } else {
        const twoYears = new Date();
        twoYears.setFullYear(twoYears.getFullYear() + 2);
        updateData.permissionExpiry = twoYears;
      }
    }

    if (role === "student") {
      updateData.isInstructorActive = false;
      updateData.status             = "pending";
      updateData.permissionExpiry   = null;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: false, select: "-password" }
    );

    if (!user) return sendError(res, "User not found", 404);

    return res.status(200).json({
      success: true,
      message: `User successfully updated to ${role}`,
      data:    user,
    });
  } catch (error) {
    console.error("❌ [UserController] updateUserRole Error:", error.message);
    return sendError(res, "Failed to update user role");
  }
};

/* ═══════════════════════════════════════
   👑 ADMIN: GRANT / REVOKE FREE ACCESS
   Merged from v1 grantFreeAccess +
   v2 giveFreeAccess/revokeFreeAccess.
   One function handles both grant and revoke.
═══════════════════════════════════════ */
/**
 * @desc    Grant or revoke free access.
 *          If user doesn't exist → creates pre-approved placeholder.
 * @route   POST /api/admin/users/grant-free
 * @access  Admin only
 * @body    { email?, phone?, isFreeAccess: boolean, days? }
 */
export const grantFreeAccess = async (req, res) => {
  try {
    const { email, phone, isFreeAccess, days = 30 } = req.body;

    if (!email && !phone) {
      return sendError(res, "Email or phone is required", 400);
    }
    if (isFreeAccess === undefined || isFreeAccess === null) {
      return sendError(res, "isFreeAccess (true or false) is required", 400);
    }

    const grantAccess    = isFreeAccess === true || isFreeAccess === "true";
    const orConditions   = [];
    if (email) orConditions.push({ email: email.toLowerCase().trim() });
    if (phone) orConditions.push({ phone: phone.trim() });

    let user = await User.findOneAndUpdate(
      { $or: orConditions },
      {
        $set: {
          isFreeAccess:     grantAccess,
          freeAccessExpiry: grantAccess
            ? new Date(Date.now() + Number(days) * 86_400_000)
            : null,
        },
      },
      { new: true, select: "-password" }
    );

    /* User not found + granting → pre-approve for future signup */
    if (!user && grantAccess) {
      user = await User.create({
        name:             email ? email.split("@")[0] : "New User",
        email:            email?.toLowerCase().trim(),
        phone:            phone?.trim() || "",
        password:         "TemporaryPassword@123",
        role:             "student",
        status:           "pending",
        isFreeAccess:     true,
        freeAccessExpiry: new Date(Date.now() + Number(days) * 86_400_000),
        isPreApproved:    true,
      });

      return res.status(201).json({
        success: true,
        message: "User pre-approved. Free access active on registration.",
        data:    user,
      });
    }

    if (!user) return sendError(res, "User not found", 404);

    return res.status(200).json({
      success: true,
      message: `Free access ${grantAccess ? "granted" : "revoked"} for ${user.email || user.phone}`,
      data:    user,
    });
  } catch (error) {
    console.error("❌ [UserController] grantFreeAccess Error:", error.message);
    return sendError(res, "Failed to update free access");
  }
};

/* ═══════════════════════════════════════
   👑 ADMIN: REVOKE ACCESS (DEMOTE)
   From v1 admin.controller.js revokeAccess.
═══════════════════════════════════════ */
/**
 * @desc    Revoke all access — demotes instructor to student,
 *          removes free access, clears instructor fields.
 * @route   DELETE /api/admin/users/:userId/revoke
 * @access  Admin only
 */
export const revokeAccess = async (req, res) => {
  try {
    const userId = req.params.userId || req.params.id;

    if (!isValidObjectId(userId)) {
      return sendError(res, "Invalid user ID", 400);
    }

    const existing = await User.findById(userId).select("role status").lean();
    if (!existing) return sendError(res, "User not found", 404);

    const wasInstructor = existing.role === "instructor";

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          role:               "student",
          isInstructorActive: false,
          isFreeAccess:       false,
          freeAccessExpiry:   null,
          permissionExpiry:   null,
          approvedByAdmin:    false,
          status:             wasInstructor ? "suspended" : existing.status,
        },
      },
      { new: true, select: "-password", runValidators: false }
    );

    return res.status(200).json({
      success: true,
      message: wasInstructor
        ? "Instructor access revoked — account demoted to student."
        : "User access revoked — complimentary permissions removed.",
      data: updatedUser,
    });
  } catch (error) {
    console.error("❌ [UserController] revokeAccess Error:", error.message);
    return sendError(res, "Failed to revoke access");
  }
};
