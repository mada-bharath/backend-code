/**
 * =========================================================
 * 💳 PAYMENT MODEL (FINAL PRODUCTION 🔥)
 * =========================================================
 * Path: backend/modules/payment/models/payment.model.js
 * =========================================================
 */

import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    /* ── User who made the payment ── */
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
    },

    /* ── Course being purchased ── */
    courseId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Course",
      required: true,
    },

    isBulk: {
      type:    Boolean,
      default: false,
    },

    items: [
      {
        courseId: {
          type: mongoose.Schema.Types.ObjectId,
          ref:  "Course",
        },
        courseName: {
          type:    String,
          default: "",
          trim:    true,
        },
        originalAmount: {
          type:    Number,
          default: 0,
          min:     0,
        },
        discountAmount: {
          type:    Number,
          default: 0,
          min:     0,
        },
        finalAmount: {
          type:    Number,
          default: 0,
          min:     0,
        },
      },
    ],

    /* ── Razorpay IDs ── */
    razorpayOrderId: {
      type:     String,
      default:  "",
      trim:     true,
    },

    razorpayPaymentId: {
      type:    String,
      default: "",
      trim:    true,
    },

    razorpaySignature: {
      type:    String,
      default: "",
      trim:    true,
    },

    /* ── Amount in paise (₹1 = 100 paise) ── */
    amount: {
      type:     Number,
      default:  0,
      min:      0,
    },
    originalAmount: {
      type:    Number,
      default: 0,
      min:     0,
    },
    discountAmount: {
      type:    Number,
      default: 0,
      min:     0,
    },
    finalAmount: {
      type:    Number,
      default: 0,
      min:     0,
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
    },

    couponCode: {
      type:    String,
      default: null,
      trim:    true,
    },
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  "Coupon",
      default: null,
    },

    currency: {
      type:    String,
      default: "INR",
      trim:    true,
    },

    /* ── Payment status ── */
    status: {
      type:    String,
      enum:    ["created", "pending", "paid", "success", "failed", "refunded"],
      default: "created",
    },
    purchaseDate: {
      type:    Date,
      default: null,
    },
    expiryDate: {
      type:    Date,
      default: null,
    },
    attempts: {
      type:    Number,
      default: 0,
    },
    isReconciled: {
      type:    Boolean,
      default: false,
    },
    ipAddress: {
      type:    String,
      default: "",
    },
    userAgent: {
      type:    String,
      default: "",
    },

    /* ── Optional receipt / notes ── */
    receipt: {
      type:    String,
      default: "",
      trim:    true,
    },

    notes: {
      type:    String,
      default: "",
      trim:    true,
    },

    /* ── Refund tracking ── */
    refundId: {
      type:    String,
      default: null,
    },

    refundedAt: {
      type:    Date,
      default: null,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

/* ── Indexes ── */
paymentSchema.index({ userId:           1 });
paymentSchema.index({ courseId:         1 });
paymentSchema.index(
  { razorpayOrderId: 1 },
  {
    unique: true,
    partialFilterExpression: { razorpayOrderId: { $type: "string", $ne: "" } },
  }
);
paymentSchema.index({ status:           1 });
paymentSchema.index({ createdAt:        -1 });

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;
