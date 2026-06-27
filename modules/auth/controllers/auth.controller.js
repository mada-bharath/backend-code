/**
 * =========================================================
 * 🔐 AUTH CONTROLLER (FINAL PRODUCTION READY)
 * =========================================================
 * ✔ Email/password login
 * ✔ Phone OTP login (SNS)
 * ✔ Forgot password with OTP
 * ✔ Clean architecture
 */

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import User from "../../user/models/user.js";
import Instructor from "../../instructor/models/instructor.model.js";

import { loginService } from "../services/auth.service.js";
import { sendOtpService, verifyOtpService } from "../services/otp.service.js";

import { generateOTP } from "../../../shared/utils/generateOTP.js";

/* =========================================================
   🔐 SIGNUP
========================================================= */
export const signup = async (req, res, next) => {
  try {
    let { name, email, phone, password } = req.body;

    name = name?.trim();
    email = email?.trim().toLowerCase();
    password = password?.trim();
    phone = phone?.trim();

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      phone: phone || "",
      password: hashedPassword,
      role: "student",
    });

    return res.status(201).json({
      success: true,
      message: "Signup successful",
      user,
    });

  } catch (error) {
    console.error("SIGNUP ERROR:", error.message);
    next(error);
  }
};

/* =========================================================
   🔐 LOGIN (EMAIL/PASSWORD)
========================================================= */
export const login = async (req, res, next) => {
  try {
    const { token, user } = await loginService({
      email: req.body.email,
      password: req.body.password,
    });

    return res.status(200).json({
      success: true,
      token,
      user,
    });

  } catch (error) {
    console.error("LOGIN ERROR:", error.message);
    next(error);
  }
};

/* =========================================================
   📩 SEND OTP (PHONE LOGIN - SNS)
========================================================= */
export const sendOTP = async (req, res, next) => {
  try {
    let { phone } = req.body;

    phone = phone?.trim();

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    await sendOtpService(phone);

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
    });

  } catch (error) {
    console.error("SEND OTP ERROR:", error.message);
    next(error);
  }
};

/* =========================================================
   🔐 VERIFY OTP (PHONE LOGIN)
========================================================= */
export const verifyOTP = async (req, res, next) => {
  try {
    let { phone, otp } = req.body;

    phone = phone?.trim();
    otp = otp?.trim();

    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: "Phone and OTP are required",
      });
    }

    await verifyOtpService(phone, otp);

    // 👤 create user if not exists
    let user = await User.findOne({ phone });

    if (!user) {
      user = await User.create({
        phone,
        role: "student",
      });
    }

    const token = jwt.sign(
      { id: user._id, phone: user.phone },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
      token,
      user,
    });

  } catch (error) {
    console.error("VERIFY OTP ERROR:", error.message);
    next(error);
  }
};

/* =========================================================
   🔐 FORGOT PASSWORD (EMAIL OTP)
========================================================= */
export const forgotPassword = async (req, res, next) => {
  try {
    let { email } = req.body;

    email = email?.trim().toLowerCase();

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const otp = generateOTP();
    const otpExpiry = Date.now() + 5 * 60 * 1000;

    user.otp = otp;
    user.otpExpiry = otpExpiry;

    await user.save();

    console.log("🔐 FORGOT OTP:", otp);

    return res.json({
      success: true,
      message: "OTP sent for password reset",
    });

  } catch (error) {
    next(error);
  }
};

/* =========================================================
   🔁 RESEND OTP
========================================================= */
export const resendOTP = async (req, res, next) => {
  try {
    let { email } = req.body;

    email = email?.trim().toLowerCase();

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const otp = generateOTP();
    const otpExpiry = Date.now() + 5 * 60 * 1000;

    user.otp = otp;
    user.otpExpiry = otpExpiry;

    await user.save();

    console.log("🔁 RESEND OTP:", otp);

    return res.json({
      success: true,
      message: "OTP resent successfully",
    });

  } catch (error) {
    next(error);
  }
};

/* =========================================================
   🔐 VERIFY RESET OTP
========================================================= */
export const verifyResetOtp = async (req, res, next) => {
  try {
    let { email, otp } = req.body;

    email = email?.trim().toLowerCase();
    otp = otp?.trim();

    const user = await User.findOne({ email });

    if (!user || !user.otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid request",
      });
    }

    if (String(user.otp) !== String(otp)) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    if (user.otpExpiry < Date.now()) {
      return res.status(400).json({
        success: false,
        message: "OTP expired",
      });
    }

    return res.json({
      success: true,
      message: "OTP verified",
    });

  } catch (error) {
    next(error);
  }
};

/* =========================================================
   🔐 RESET PASSWORD
========================================================= */
export const resetPassword = async (req, res, next) => {
  try {
    let { email, password } = req.body;

    email = email?.trim().toLowerCase();
    password = password?.trim();

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const hashed = await bcrypt.hash(password, 10);

    user.password = hashed;
    user.otp = null;
    user.otpExpiry = null;

    await user.save();

    return res.json({
      success: true,
      message: "Password updated successfully",
    });

  } catch (error) {
    next(error);
  }
};

/* =========================================================
   👤 GET CURRENT USER (AUTH ME)
========================================================= */
export const getMe = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    /* 🔥 FETCH INSTRUCTOR DATA */
    const userData = req.user.toObject();

    const instructor = await Instructor.findOne({
      userId: req.user._id,
      isDeleted: false,
    }).lean();

    const isInstructorUser = userData.role === "instructor" || Boolean(instructor);
    const instructorStatus = instructor?.status || userData.status;
    const instructorActive =
      instructor?.isInstructorActive ?? userData.isInstructorActive ?? false;

    /* 🔥 MERGE USER + INSTRUCTOR */
    const finalUser = {
      ...userData,

      role: isInstructorUser ? "instructor" : userData.role,
      status: instructorStatus,
      isInstructorActive: isInstructorUser
        ? Boolean(instructorActive)
        : Boolean(userData.isInstructorActive),
      approvedByAdmin: isInstructorUser
        ? instructorStatus === "approved" || Boolean(userData.approvedByAdmin)
        : Boolean(userData.approvedByAdmin),
      permissionType: instructor?.permissionType || userData.permissionType,
      permissionExpiry:
        instructor?.permissionExpiry || userData.permissionExpiry || null,
      assignedCourses:
        instructor?.assignedCourses?.length > 0
          ? instructor.assignedCourses
          : userData.assignedCourses || [],
    };

    return res.status(200).json({
      success: true,
      user: finalUser,
    });

  } catch (error) {
    console.error("GET ME ERROR:", error.message);
    next(error);
  }
};
