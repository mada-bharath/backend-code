/**
 * =========================================================
 * 🔐 AUTH ROUTES (FINAL PRODUCTION READY)
 * =========================================================
 * Base URL: /api/auth
 *
 * ✔ Email/password auth
 * ✔ Phone OTP auth (SNS)
 * ✔ Forgot/reset password
 * ✔ Get current user (AUTH ME) 🔥
 */

import express from "express";

/* ================= CONTROLLERS ================= */
import {
  signup,
  login,

  // 📱 Phone OTP (SNS)
  sendOTP,
  verifyOTP,

  // 📧 Email OTP (forgot password)
  forgotPassword,
  resendOTP,
  verifyResetOtp,
  resetPassword,

  // 👤 CURRENT USER (🔥 NEW)
  getMe,
} from "../controllers/auth.controller.js";

/* ================= MIDDLEWARE ================= */
import { protect } from "../../../shared/middleware/auth.middleware.js";

const router = express.Router();

/* =========================================================
   🟢 SIGNUP
   POST /api/auth/signup
========================================================= */
router.post("/signup", signup);

/* =========================================================
   🔐 LOGIN (EMAIL/PASSWORD)
   POST /api/auth/login
========================================================= */
router.post("/login", login);

/* =========================================================
   📱 SEND OTP (PHONE LOGIN - SNS)
   POST /api/auth/send-otp
========================================================= */
router.post("/send-otp", sendOTP);

/* =========================================================
   ✅ VERIFY OTP (PHONE LOGIN)
   POST /api/auth/verify-otp
========================================================= */
router.post("/verify-otp", verifyOTP);

/* =========================================================
   📧 FORGOT PASSWORD (EMAIL OTP)
   POST /api/auth/forgot-password
========================================================= */
router.post("/forgot-password", forgotPassword);

/* =========================================================
   🔁 RESEND OTP (EMAIL)
   POST /api/auth/resend-otp
========================================================= */
router.post("/resend-otp", resendOTP);

/* =========================================================
   ✅ VERIFY RESET OTP (EMAIL)
   POST /api/auth/verify-reset-otp
========================================================= */
router.post("/verify-reset-otp", verifyResetOtp);

/* =========================================================
   🔐 RESET PASSWORD
   POST /api/auth/reset-password
========================================================= */
router.post("/reset-password", resetPassword);

/* =========================================================
   👤 GET CURRENT USER (🔥 CRITICAL FIX)
   GET /api/auth/me
========================================================= */
router.get("/me", protect, getMe);

/* =========================================================
   🚀 EXPORT ROUTER
========================================================= */
export default router;