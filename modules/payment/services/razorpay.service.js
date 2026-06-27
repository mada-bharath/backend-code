/**
 * =========================================================
 * 💳 RAZORPAY SERVICE (FINAL PRODUCTION 🔥)
 * =========================================================
 * Path: backend/modules/payment/services/razorpay.service.js
 *
 * Wraps all Razorpay SDK calls so the controller stays clean.
 * =========================================================
 */

import Razorpay   from "razorpay";
import crypto     from "crypto";

/* ─────────────────────────────────────────
   RAZORPAY INSTANCE
   Created once and reused
───────────────────────────────────────── */
let razorpayInstance = null;

const getRazorpay = () => {
  if (!razorpayInstance) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error(
        "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in .env"
      );
    }
    razorpayInstance = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpayInstance;
};

/* ─────────────────────────────────────────
   CREATE ORDER
───────────────────────────────────────── */
/**
 * Creates a Razorpay order
 * @param {number} amount    - Final amount in PAISE (INR × 100)
 * @param {string} receipt   - Unique receipt (your internal payment record _id)
 * @param {object} notes     - Optional metadata
 * @returns {object}         - Razorpay order object
 */
export const createRazorpayOrder = async (amount, receipt, notes = {}) => {
  try {
    const rz = getRazorpay();

    const order = await rz.orders.create({
      amount:   Math.round(amount * 100), // convert to paise
      currency: "INR",
      receipt:  String(receipt).substring(0, 40), // Razorpay limit: 40 chars
      notes,
    });

    return order;
  } catch (err) {
    console.error("❌ [RazorpayService] createOrder Error:", err.message);
    throw new Error(err.error?.description || "Failed to create Razorpay order");
  }
};

/* ─────────────────────────────────────────
   VERIFY SIGNATURE
───────────────────────────────────────── */
/**
 * Verifies the payment signature from Razorpay webhook/callback
 * CRITICAL: Never trust frontend — always verify here
 *
 * @param {string} razorpayOrderId   - From Razorpay
 * @param {string} razorpayPaymentId - From Razorpay
 * @param {string} razorpaySignature - From Razorpay
 * @returns {boolean}
 */
export const verifyRazorpaySignature = (
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature
) => {
  try {
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) throw new Error("RAZORPAY_KEY_SECRET not set");

    const body = `${razorpayOrderId}|${razorpayPaymentId}`;

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");

    return expectedSignature === razorpaySignature;
  } catch (err) {
    console.error("❌ [RazorpayService] verifySignature Error:", err.message);
    return false;
  }
};

/* ─────────────────────────────────────────
   FETCH PAYMENT DETAILS (FOR RECONCILIATION)
───────────────────────────────────────── */
/**
 * Fetches payment details from Razorpay API
 * Used for recovery when DB write failed after payment succeeded
 *
 * @param {string} razorpayPaymentId
 * @returns {object} Razorpay payment object
 */
export const fetchRazorpayPayment = async (razorpayPaymentId) => {
  try {
    const rz      = getRazorpay();
    const payment = await rz.payments.fetch(razorpayPaymentId);
    return payment;
  } catch (err) {
    console.error("❌ [RazorpayService] fetchPayment Error:", err.message);
    throw new Error("Failed to fetch payment from Razorpay");
  }
};

/* ─────────────────────────────────────────
   FETCH ORDER DETAILS
───────────────────────────────────────── */
export const fetchRazorpayOrder = async (razorpayOrderId) => {
  try {
    const rz    = getRazorpay();
    const order = await rz.orders.fetch(razorpayOrderId);
    return order;
  } catch (err) {
    console.error("❌ [RazorpayService] fetchOrder Error:", err.message);
    throw new Error("Failed to fetch order from Razorpay");
  }
};

/* ─────────────────────────────────────────
   INITIATE REFUND
───────────────────────────────────────── */
export const initiateRefund = async (razorpayPaymentId, amount, notes = {}) => {
  try {
    const rz     = getRazorpay();
    const refund = await rz.payments.refund(razorpayPaymentId, {
      amount: Math.round(amount * 100), // paise
      notes,
    });
    return refund;
  } catch (err) {
    console.error("❌ [RazorpayService] initiateRefund Error:", err.message);
    throw new Error(err.error?.description || "Refund failed");
  }
};