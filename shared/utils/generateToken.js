import jwt from "jsonwebtoken";

export const generateToken = (user) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not defined ❌");
  }

  return jwt.sign(
    {
      id: user._id,        // ✅ user id
      role: user.role,     // ✅ VERY IMPORTANT (admin check)
      email: user.email,   // ✅ optional (useful for frontend)
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );
};