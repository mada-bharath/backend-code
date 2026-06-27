/**
 * =========================================================
 * 💳 PAYMENT ROUTES (FINAL PRODUCTION 🔥)
 * =========================================================
 * Path: backend/modules/payment/routes/payment.routes.js
 * Base URL: /api/payment
 * =========================================================
 */

import express from "express";
import {
  createOrder,
  createWishlistOrder,
  verifyPayment,
  handlePaymentFailure,
  recoverPayment,
  checkPaymentStatus,
  getMyPaymentHistory,
  deleteFailedPayment,
  getMyCourses,
  checkCourseAccess,
  adminGetAllPayments,
  validateCoupon,
} from "../controllers/payment.controller.js";

import { protect }   from "../../../shared/middleware/auth.middleware.js";
import { authorize } from "../../../shared/middleware/role.middleware.js";

const router = express.Router();

/* ─────────────────────────────────────────
   PUBLIC (no auth required)
───────────────────────────────────────── */
// None — all payment endpoints require login

/* ─────────────────────────────────────────
   STUDENT / ANY LOGGED-IN USER
───────────────────────────────────────── */
router.use(protect);

/* Coupon validation (pre-checkout) */
router.post("/validate-coupon",   validateCoupon);

/* Create Razorpay order (STEP 1) */
router.post("/create-order",      createOrder);

/* Create one Razorpay order for multiple wishlist courses */
router.post("/create-wishlist-order", createWishlistOrder);

/* Verify payment after Razorpay callback (STEP 2) */
router.post("/verify",            verifyPayment);

/* Handle payment failure */
router.post("/failed",            handlePaymentFailure);

/* Recovery for DB crash case */
router.post("/recover",           recoverPayment);

/* Check payment status (page refresh case) */
router.get("/status/:orderId",    checkPaymentStatus);

/* Get user's payment history */
router.get("/my-history",         getMyPaymentHistory);

/* Delete a failed payment history item */
router.delete("/failed/:id",      deleteFailedPayment);

/* Get user's purchased courses */
router.get("/my-courses",         getMyCourses);

/* Check if user has access to a specific course */
router.get("/access/:courseId",   checkCourseAccess);

/* ─────────────────────────────────────────
   ADMIN ONLY
───────────────────────────────────────── */
router.get("/admin/all",          authorize("admin"), adminGetAllPayments);

export default router;
