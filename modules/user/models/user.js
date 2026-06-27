/**
 * =========================================================
 * 👤 USER MODEL (FINAL PRODUCTION 🔥)
 * =========================================================
 * Path: backend/modules/user/models/user.js
 *
 * FIXES IN THIS VERSION:
 * ✅ FIX 1: Added changePassword named export
 *           payment.model.js imports { changePassword } from user.js
 *           Without it: "does not provide an export named 'changePassword'"
 *           → changePassword is a standalone async function that updates
 *             a user's password safely (finds user, verifies old password,
 *             hashes new password, saves via .save() to trigger pre-save hook)
 *
 * ✅ FIX 2: Removed duplicate index warning
 *           email had BOTH unique:true AND schema.index({ email:1 })
 *           → Kept unique:true on field, removed redundant schema.index
 *
 * ✅ FIX 3: All fields from previous enterprise user.js preserved
 *           (extensionHistory, reactivationHistory, assignedCourses,
 *            purchasedCourses, isFreeAccess, isPreApproved, etc.)
 *
 * DEFAULT EXPORT:  User (the Mongoose model)
 * NAMED EXPORTS:   changePassword (standalone utility function)
 * =========================================================
 */

import mongoose from "mongoose";
import bcrypt   from "bcryptjs";
import { ADMIN_PERMISSION_KEYS } from "../../../shared/constants/adminPages.js";

/* ─────────────────────────────────────────
   SCHEMA
───────────────────────────────────────── */
const userSchema = new mongoose.Schema(
  {
    /* ── Identity ── */
    name: {
      type:     String,
      required: [true, "Name is required"],
      trim:     true,
    },

    email: {
      type:      String,
      required:  [true, "Email is required"],
      unique:    true,   // ✅ Already creates unique index — no schema.index needed
      lowercase: true,
      trim:      true,
    },

    phone: {
      type:    String,
      default: "",
      trim:    true,
    },

    /* ── Auth ── */
    password: {
      type:      String,
      required:  [true, "Password is required"],
      minlength: 6,
      select:    false, // Never returned in queries unless explicitly .select("+password")
    },

    /* ── Role & Status ── */
    role: {
      type:    String,
      enum:    ["student", "instructor", "admin"],
      default: "student",
    },

    adminAccess: {
      managed: {
        type:    Boolean,
        default: false,
      },
      fullAccess: {
        type:    Boolean,
        default: false,
      },
      pages: [
        {
          type: String,
          enum: ADMIN_PERMISSION_KEYS,
        },
      ],
      grantedBy: {
        type:    mongoose.Schema.Types.ObjectId,
        ref:     "User",
        default: null,
      },
      grantedAt: {
        type:    Date,
        default: null,
      },
      updatedAt: {
        type:    Date,
        default: null,
      },
    },

    isBlocked: {
      type:    Boolean,
      default: false,
    },

    /* ── Instructor-specific fields ── */
    isInstructorActive: {
      type:    Boolean,
      default: false,
    },

    approvedByAdmin: {
      type:    Boolean,
      default: false,
    },

    status: {
      type:    String,
      enum:    ["pending", "approved", "rejected", "inactive", "suspended"],
      default: "pending",
    },

    permissionType: {
      type:    String,
      enum:    ["SINGLE", "MULTIPLE"],
      default: "SINGLE",
    },

    permissionExpiry: {
      type:    Date,
      default: null,
    },

    isExpired: {
      type:    Boolean,
      default: false,
    },

    /* Audit log for time extensions (max 20 per instructor) */
    extensionHistory: [
      {
        extendedBy:     { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        days:           Number,
        previousExpiry: Date,
        newExpiry:      Date,
        reason:         { type: String, default: "Admin extension" },
        _id:            false,
      },
    ],

    maxExtensions: {
      type:    Number,
      default: 20,
    },

    /* Audit log for reactivations */
    reactivationHistory: [
      {
        reactivatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        reason:        String,
        reactivatedAt: { type: Date, default: Date.now },
        _id:           false,
      },
    ],

    /* Courses the instructor has been assigned to teach */
    assignedCourses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref:  "Course",
      },
    ],

    /* Subjects / topics the instructor teaches */
    subjects: [String],

    /* ── Free / Complimentary Access ── */
    isFreeAccess: {
      type:    Boolean,
      default: false,
    },

    freeAccessExpiry: {
      type:    Date,
      default: null,
    },

    /* Set when admin grants access before user registers */
    isPreApproved: {
      type:    Boolean,
      default: false,
    },

    /* ── Purchased or Admin-Granted Courses ── */
    purchasedCourses: [
      {
        courseId: {
          type: mongoose.Schema.Types.ObjectId,
          ref:  "Course",
        },
        accessType: {
          type:    String,
          enum:    ["purchased", "free"],
          default: "purchased",
        },
        purchasedAt: {
          type:    Date,
          default: Date.now,
        },
        expiresAt: {
          type:    Date,
          default: null, // null = lifetime access
        },
      },
    ],

    /* ── Profile ── */
    avatar: {
      type:    String,
      default: "",
    },

    bio: {
      type:    String,
      default: "",
    },

    gender: {
      type: String,
      enum: ["male", "female", "other", ""],
      default: "",
    },

    birthday: {
      type:    Date,
      default: null,
    },

    /* ── Password Reset ── */
    resetPasswordToken: {
      type:   String,
      select: false,
    },
    resetPasswordExpires: {
      type:   Date,
      select: false,
    },

    /* ── OTP (for phone/email verification) ── */
    otp: {
      type:   String,
      select: false,
    },
    otpExpiry: {
      type:   Date,
      select: false,
    },

    /* ── Session tracking ── */
    lastLogin: {
      type:    Date,
      default: null,
    },
  },
  {
    timestamps: true, // createdAt + updatedAt auto-added
  }
);

/* ─────────────────────────────────────────
   PRE-SAVE HOOK — Hash password ONLY when changed
   ⚠️  This is why updateUserRole and other admin
       updates use findByIdAndUpdate() with $set
       instead of user.save() — to avoid triggering
       this hook and re-hashing an already-hashed password.
───────────────────────────────────────── */
userSchema.pre("save", async function () {
  /* Skip if password field was not changed */
  if (!this.isModified("password")) return;

  const salt    = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

/* ─────────────────────────────────────────
   INSTANCE METHOD — Compare password at login
   Usage: const isMatch = await user.matchPassword(enteredPassword)
───────────────────────────────────────── */
userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

/* ─────────────────────────────────────────
   INDEXES
   ✅ email unique index created by unique:true above
      Do NOT add schema.index({ email: 1 }) — causes duplicate warning
   ✅ Only add indexes here for fields that don't have
      index/unique on the field definition itself
───────────────────────────────────────── */
userSchema.index({ role:         1 });
userSchema.index({ role: 1, "adminAccess.managed": 1 });
userSchema.index({ isFreeAccess: 1 });
userSchema.index({ createdAt:    -1 });
userSchema.index({ isInstructorActive: 1, permissionExpiry: 1 }); // For expiry cron jobs

/* ─────────────────────────────────────────
   MODEL
───────────────────────────────────────── */
const User = mongoose.model("User", userSchema);

/* ─────────────────────────────────────────
   ✅ NAMED EXPORT: changePassword
   ─────────────────────────────────────────
   This is what payment.model.js (and any other file) imports:
     import { changePassword } from "../../user/models/user.js"

   Why it's here (not in a controller):
   - payment.model.js needs it at the model level
   - Keeps password logic next to the User model (single responsibility)

   What it does:
   1. Finds user by ID (with password field selected)
   2. Verifies the current/old password
   3. Sets new password and calls .save() to trigger
      the pre-save bcrypt hook above
   4. Returns the updated user (without password)

   Usage:
     const result = await changePassword(userId, oldPassword, newPassword);
     if (!result.success) return res.status(400).json(result);
   ─────────────────────────────────────────
*/
export const changePassword = async (userId, oldPassword, newPassword) => {
  try {
    /* ── Validation ── */
    if (!userId || !oldPassword || !newPassword) {
      return { success: false, message: "All fields are required" };
    }

    if (newPassword.length < 6) {
      return { success: false, message: "New password must be at least 6 characters" };
    }

    if (oldPassword === newPassword) {
      return { success: false, message: "New password must be different from current password" };
    }

    /* ── Find user with password ──
       Must use .select("+password") because password has select:false */
    const user = await User.findById(userId).select("+password");

    if (!user) {
      return { success: false, message: "User not found" };
    }

    /* ── Verify old password ── */
    const isMatch = await bcrypt.compare(oldPassword, user.password);

    if (!isMatch) {
      return { success: false, message: "Current password is incorrect" };
    }

    /* ── Set new password ──
       Setting user.password and calling .save() triggers the
       pre-save hook which hashes the new password automatically */
    user.password = newPassword;
    await user.save();

    return {
      success: true,
      message: "Password changed successfully",
    };

  } catch (err) {
    console.error("❌ [changePassword] Error:", err.message);
    return { success: false, message: "Failed to change password" };
  }
};

/* ─────────────────────────────────────────
   DEFAULT EXPORT: User model
───────────────────────────────────────── */
export default User;
