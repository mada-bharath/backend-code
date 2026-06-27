/**
 * =========================================================
 * 💳 PURCHASE MODEL (FINAL PRODUCTION 🔥)
 * =========================================================
 * Path: backend/modules/purchase/models/purchase.model.js
 *
 * Tracks every course purchase made by students.
 * Used for:
 * ✅ Access control (did this user buy this course?)
 * ✅ Revenue tracking
 * ✅ Purchase history page
 * ✅ Admin analytics dashboard
 * =========================================================
 */

import mongoose from "mongoose";

const addYears = (date, years) => {
  const next = new Date(date || Date.now());
  next.setFullYear(next.getFullYear() + years);
  return next;
};

const purchaseSchema = new mongoose.Schema(
  {
    /* ── Who bought ── */
    user: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      index:    true,
    },
    userId: {
      type:  mongoose.Schema.Types.ObjectId,
      ref:   "User",
      index: true,
    },

    /* ── What was bought ── */
    course: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Course",
      index:    true,
    },
    courseId: {
      type:  mongoose.Schema.Types.ObjectId,
      ref:   "Course",
      index: true,
    },

    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  "Payment",
      default: null,
    },

    snapshot: {
      userName: {
        type: String,
        default: "",
      },
      userEmail: {
        type: String,
        default: "",
      },
      courseName: {
        type: String,
        default: "",
      },
      amountPaid: {
        type: Number,
        default: 0,
      },
    },

    /* ── Payment details ── */
    pricePaid: {
      type:    Number,
      default: 0,
      min:     0,
    },

    /* Payment method: razorpay, free, admin_grant, coupon */
    paymentMethod: {
      type:    String,
      enum:    ["razorpay", "free", "admin_grant", "coupon", "mock"],
      default: "razorpay",
    },

    /* Razorpay payment ID (filled after successful payment) */
    razorpayPaymentId: {
      type:    String,
      default: null,
    },

    /* Razorpay order ID */
    razorpayOrderId: {
      type:    String,
      default: null,
    },

    /* Coupon code used (if any) */
    couponCode: {
      type:    String,
      default: null,
    },

    /* Discount amount applied */
    discountAmount: {
      type:    Number,
      default: 0,
    },

    /* ── Status ── */
    status: {
      type:    String,
      enum:    ["pending", "completed", "failed", "refunded"],
      default: "pending",
      index:   true,
    },

    /* ── Timestamps ── */
    purchasedAt: {
      type:    Date,
      default: Date.now,
    },
    purchaseDate: {
      type:    Date,
      default: Date.now,
    },

    /* Access expiry — null means lifetime access */
    expiresAt: {
      type:    Date,
      default: null,
    },
    expiryDate: {
      type:    Date,
      default: null,
    },

    accessType: {
      type:    String,
      enum:    ["purchased", "free", "admin_grant", "coupon", "instructor"],
      default: "purchased",
    },

    isActive: {
      type:    Boolean,
      default: true,
      index:   true,
    },

    courseDeleted: {
      type:    Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

/* ─────────────────────────────────────────
   INDEXES
   Compound index for the most common query:
   "Did this user purchase this course?"
───────────────────────────────────────── */
purchaseSchema.index({ user: 1, course: 1 }); // Fast duplicate check
purchaseSchema.index({ userId: 1, courseId: 1 });
purchaseSchema.index({ status: 1, purchasedAt: -1 }); // Admin analytics

/* ─────────────────────────────────────────
   VIRTUAL: isExpired
   Returns true if access has expired
───────────────────────────────────────── */
purchaseSchema.virtual("isExpired").get(function () {
  const expiry = this.expiresAt || this.expiryDate;
  if (!expiry) return false; // null = lifetime
  return new Date() > new Date(expiry);
});

purchaseSchema.pre("validate", function () {
  if (!this.user && this.userId) this.user = this.userId;
  if (!this.userId && this.user) this.userId = this.user;
  if (!this.course && this.courseId) this.course = this.courseId;
  if (!this.courseId && this.course) this.courseId = this.course;
  if (!this.purchaseDate && this.purchasedAt) this.purchaseDate = this.purchasedAt;
  if (!this.purchasedAt && this.purchaseDate) this.purchasedAt = this.purchaseDate;
  if (!this.expiresAt && !this.expiryDate && this.accessType !== "instructor") {
    const startDate = this.purchaseDate || this.purchasedAt || new Date();
    this.expiresAt = addYears(startDate, 2);
    this.expiryDate = this.expiresAt;
  }
  if (!this.expiryDate && this.expiresAt) this.expiryDate = this.expiresAt;
  if (!this.expiresAt && this.expiryDate) this.expiresAt = this.expiryDate;
});

const Purchase = mongoose.model("Purchase", purchaseSchema);

export default Purchase;
