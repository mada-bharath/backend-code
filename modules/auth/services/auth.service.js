import bcrypt from "bcryptjs";
import User from "../../user/models/user.js";
import { generateToken } from "../../../shared/utils/generateToken.js";

export const loginService = async ({ email, password }) => {
  // ✅ normalize input
  email = email?.trim().toLowerCase();
  password = typeof password === "string" ? password.trim() : "";

  // ✅ include password from DB
  const user = await User.findOne({ email }).select("+password");

  if (!user) {
    throw new Error("User not found");
  }

  if (!password || password.length === 0) {
    throw new Error("Password missing");
  }

  if (!user.password) {
    throw new Error("User password not found in DB");
  }

  // ✅ compare password
  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    throw new Error("Invalid credentials");
  }

  // ✅ generate token
  const token = generateToken(user);

  // ✅ FINAL FIX: ensure role always exists
  const safeRole = user.role ? user.role.toLowerCase() : "student";

  return {
    token,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      status: user.status,
      isInstructorActive: Boolean(user.isInstructorActive),
      approvedByAdmin: Boolean(user.approvedByAdmin),
      permissionType: user.permissionType,
      permissionExpiry: user.permissionExpiry || null,
      assignedCourses: user.assignedCourses || [],
      adminAccess: user.adminAccess || null,
      role: safeRole, // ✅ ALWAYS GUARANTEED
    },
  };
};
