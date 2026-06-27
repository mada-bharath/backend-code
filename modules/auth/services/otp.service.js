/**
 * =========================================================
 * 🔐 OTP SERVICE (PRODUCTION READY)
 * =========================================================
 * Responsibilities:
 *  - Generate OTP
 *  - Hash OTP (security)
 *  - Store in DB
 *  - Handle expiry
 *  - Rate limit (basic)
 *  - Send SMS via AWS SNS
 */

import crypto from "crypto";
import OTP from "../models/otp.model.js";
import { sendSMS } from "../../aws/services/sns.service.js";

// 🔒 CONFIG
const OTP_EXPIRY_MINUTES = 5;
const OTP_LENGTH = 6;
const MAX_REQUESTS = 20; // per 5 mins

/**
 * 🔢 Generate Numeric OTP
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * 🔐 Hash OTP using SHA256
 */
const hashOTP = (otp) => {
  return crypto.createHash("sha256").update(otp).digest("hex");
};

/**
 * 🚫 Rate Limit Check (basic DB-based)
 */
const checkRateLimit = async (phone) => {
  const existing = await OTP.findOne({ phone });

  if (!existing) return;

  if (existing.requestCount >= MAX_REQUESTS) {
    const diff = Date.now() - new Date(existing.updatedAt).getTime();

    // 5 mins cooldown
    if (diff < OTP_EXPIRY_MINUTES * 60 * 1000) {
      throw new Error("Too many OTP requests. Try again later.");
    }
  }
};

/**
 * 📩 SEND OTP SERVICE
 */
export const sendOtpService = async (phone) => {
  // 🚫 Validate phone
  if (!phone || phone.length !== 10) {
    throw new Error("Invalid phone number");
  }

  // 🚫 Rate limit
  await checkRateLimit(phone);

  // 🔢 Generate OTP
  const otp = generateOTP();

  // 🔐 Hash OTP before storing
  const hashedOtp = hashOTP(otp);

  // ⏱ Expiry
  const expiresAt = new Date(
    Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000
  );

  // 🔄 Upsert OTP record
  const existing = await OTP.findOne({ phone });

  let requestCount = 1;

  if (existing) {
    requestCount = (existing.requestCount || 0) + 1;
  }

  await OTP.findOneAndUpdate(
    { phone },
    {
      otp: hashedOtp,
      expiresAt,
      requestCount,
    },
    { upsert: true, new: true }
  );

  // 📱 Send SMS via SNS
  await sendSMS(
    `+91${phone}`,
    `Your OTP is ${otp}. Valid for ${OTP_EXPIRY_MINUTES} minutes.`
  );

  return {
    success: true,
    message: "OTP sent successfully",
  };
};

/**
 * ✅ VERIFY OTP SERVICE
 */
export const verifyOtpService = async (phone, otp) => {
  if (!phone || !otp) {
    throw new Error("Phone and OTP required");
  }

  const record = await OTP.findOne({ phone });

  if (!record) {
    throw new Error("OTP not found");
  }

  // ⏱ Expiry check
  if (record.expiresAt < new Date()) {
    await OTP.deleteOne({ phone });
    throw new Error("OTP expired");
  }

  // 🔐 Compare hashed OTP
  const hashedOtp = hashOTP(otp);

  if (record.otp !== hashedOtp) {
    throw new Error("Invalid OTP");
  }

  // 🧹 Clean up after success
  await OTP.deleteOne({ phone });

  return {
    success: true,
    message: "OTP verified",
  };
};