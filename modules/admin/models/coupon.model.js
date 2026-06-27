/**
 * =========================================================
 * 🎟️ COUPON MODEL (FINAL PRODUCTION 🔥)
 * =========================================================
 * Path: backend/modules/admin/models/coupon.model.js
 *
 * Tracks discount coupons for the payment/checkout flow.
 * Admin creates coupons, students apply them during purchase.
 * =========================================================
 */

import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
  {
    /* ── Coupon Identity ── */
    code: {
      type:     String,
      required: [true, "Coupon code is required"],
      unique:   true,
      uppercase: true,  // Always stored as uppercase — "SAVE50" not "save50"
      trim:     true,
    },

    /* ── Discount Value ── */
    discount: {
      type:     Number,
      required: [true, "Discount percentage is required"],
      min:      [1,   "Discount must be at least 1%"],
      max:      [100, "Discount cannot exceed 100%"],
    },

    /* ── Validity Window ── */
    expiresAt: {
      type:    Date,
      default: null, // null = no expiry (valid forever until manually deleted)
    },

    /* ── Usage Tracking ── */
    usageLimit: {
      type:    Number,
      default: null, // null = unlimited usage
    },

    usedCount: {
      type:    Number,
      default: 0,    // Incremented each time a student applies this coupon
    },

    /* ── Status ── */
    isActive: {
      type:    Boolean,
      default: true,
      index:   true,
    },

    /* ── Audit ── */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  "User",
      default: null,
    },
  },
  {
    timestamps: true, // createdAt + updatedAt auto-added
  }
);

/* ── Index for fast coupon lookup during checkout ── */
couponSchema.index({ code: 1, isActive: 1 });

/**
 * Virtual: how many uses remain
 * coupon.remainingUses → number or "Unlimited"
 */
couponSchema.virtual("remainingUses").get(function () {
  if (!this.usageLimit) return "Unlimited";
  return Math.max(0, this.usageLimit - this.usedCount);
});

/**
 * Instance method: check if this coupon is currently usable
 * Returns { valid: boolean, reason?: string }
 */
couponSchema.methods.isUsable = function () {
  if (!this.isActive) {
    return { valid: false, reason: "Coupon is inactive" };
  }
  if (this.expiresAt && new Date(this.expiresAt) < new Date()) {
    return { valid: false, reason: "Coupon has expired" };
  }
  if (this.usageLimit && this.usedCount >= this.usageLimit) {
    return { valid: false, reason: "Usage limit reached" };
  }
  return { valid: true };
};

const Coupon = mongoose.model("Coupon", couponSchema);

export default Coupon;