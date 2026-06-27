/**
 * =========================================================
 * 🎓 INSTRUCTOR MODEL (FINAL ENTERPRISE VERSION 🔥)
 * =========================================================
 * ✅ Clean schema
 * ✅ No duplicate index warnings
 * ✅ Optimized queries
 * ✅ Scalable structure
 * ✅ Production safe
 */

import mongoose from "mongoose";

/* =========================================================
   📦 SCHEMA
========================================================= */
const instructorSchema = new mongoose.Schema(
  {
    /* 🔗 LINK TO USER */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // ✅ single index only
    },

    /* 📧 EMAIL (FOR QUICK ACCESS) */
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    /* 📊 STATUS (ADMIN CONTROL) */
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },

    /* ✅ ACTIVE FLAG */
    isInstructorActive: {
      type: Boolean,
      default: false,
      index: true,
    },

    /* ⏳ PERMISSION EXPIRY */
    permissionExpiry: {
      type: Date,
      default: null,
      index: true,
    },

    /* 🧾 PERMISSION TYPE */
    permissionType: {
      type: String,
      enum: ["SINGLE", "MULTIPLE"],
      default: "SINGLE",
    },

    /* 📚 ASSIGNED COURSES */
    assignedCourses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
      },
    ],

    /* 🗑️ SOFT DELETE */
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    /* 👤 AUDIT FIELDS */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

/* =========================================================
   🚀 COMPOUND INDEXES (NO DUPLICATES)
========================================================= */
instructorSchema.index({ userId: 1, isDeleted: 1 });
instructorSchema.index({ status: 1, isInstructorActive: 1 });

/* =========================================================
   ⚡ VIRTUAL FIELD (OPTIONAL)
========================================================= */
instructorSchema.virtual("isValidInstructor").get(function () {
  return (
    this.status === "approved" &&
    this.isInstructorActive === true &&
    (!this.permissionExpiry ||
      new Date(this.permissionExpiry) > new Date())
  );
});

/* =========================================================
   🔄 TO JSON CLEANUP
========================================================= */
instructorSchema.set("toJSON", {
  virtuals: true,
  transform: (_, ret) => {
    delete ret.__v;
    return ret;
  },
});

/* =========================================================
   📦 EXPORT MODEL
========================================================= */
const Instructor = mongoose.model("Instructor", instructorSchema);

export default Instructor;