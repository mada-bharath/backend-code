/**
 * 💳 PAYMENT SERVICE (FINAL PRODUCTION 🔥)
 * ------------------------------------------------
 * ✅ Razorpay order creation
 * ✅ Secure payment verification
 * ✅ Purchase saving (with coupon + final price)
 * ✅ Duplicate prevention
 * ✅ Clean architecture (service layer = business logic)
 */

import crypto from "crypto";
import { razorpayInstance } from "./razorpay.service.js";
import Purchase from "../../purchase/models/purchase.model.js";

/* =========================================================
   💳 CREATE ORDER
========================================================= */
export const createOrderService = async (userId, courseId, amount) => {
  try {
    if (!userId || !courseId || !amount) {
      throw new Error("Missing required fields for order");
    }

    const options = {
      amount: Math.round(amount * 100), // ₹ → paise
      currency: "INR",
      receipt: `receipt_${userId}_${Date.now()}`,
    };

    const order = await razorpayInstance.orders.create(options);

    return order;

  } catch (err) {
    console.error("❌ CREATE ORDER SERVICE ERROR:", err);
    throw new Error("Failed to create payment order");
  }
};

/* =========================================================
   🔐 VERIFY PAYMENT SIGNATURE
========================================================= */
export const verifyPaymentService = ({ orderId, paymentId, signature }) => {
  try {
    const body = `${orderId}|${paymentId}`;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== signature) {
      throw new Error("Payment verification failed");
    }

    return true;

  } catch (err) {
    console.error("❌ VERIFY PAYMENT ERROR:", err);
    throw err;
  }
};

/* =========================================================
   💾 SAVE PURCHASE (FINAL 🔥)
========================================================= */
export const savePurchaseService = async (
  userId,
  courseId,
  paymentId,
  couponCode = null,
  finalPrice = null
) => {
  try {
    /* ===============================
       🔒 VALIDATION
    =============================== */
    if (!userId || !courseId || !paymentId) {
      throw new Error("Missing purchase details");
    }

    /* ===============================
       ⚠️ PREVENT DUPLICATE PURCHASE
    =============================== */
    const existing = await Purchase.findOne({
      user: userId,
      course: courseId,
    });

    if (existing) {
      throw new Error("Course already purchased");
    }

    const purchasedAt = new Date();
    const expiresAt = new Date(purchasedAt);
    expiresAt.setFullYear(expiresAt.getFullYear() + 2);

    /* ===============================
       🧠 CREATE PURCHASE RECORD
    =============================== */
    const purchase = await Purchase.create({
      user: userId,
      course: courseId,
      paymentId,
      purchasedAt,
      purchaseDate: purchasedAt,
      expiresAt,
      expiryDate: expiresAt,
      isActive: true,
      status: "completed",

      // 🔥 NEW FIELDS (IMPORTANT)
      couponCode: couponCode || null,
      finalPrice: finalPrice || 0,
    });

    return purchase;

  } catch (err) {
    console.error("❌ SAVE PURCHASE ERROR:", err);
    throw err;
  }
};
