import Coupon from "../admin/models/coupon.model.js";

/**
 * =========================================================
 * 🎟️ VALIDATE COUPON (PRODUCTION READY 🔥)
 * =========================================================
 * ✅ Safe validation
 * ✅ Uses model method
 * ✅ Handles expiry, usage, inactive
 * ✅ Returns final amount
 * =========================================================
 */

export const validateCoupon = async (req, res) => {
  try {
    let { code, amount } = req.body;

    /* ================= VALIDATE INPUT ================= */
    if (!code || typeof code !== "string") {
      return res.status(400).json({
        success: false,
        message: "Coupon code is required",
      });
    }

    code = code.trim().toUpperCase();

    const price = Number(amount);

    if (isNaN(price) || price <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount",
      });
    }

    /* ================= FIND COUPON ================= */
    const coupon = await Coupon.findOne({
      code,
      isActive: true,
    });

    if (!coupon) {
      return res.status(400).json({
        success: false,
        message: "Invalid coupon",
      });
    }

    /* ================= VALIDATE USING MODEL ================= */
    if (!coupon.isValidCoupon()) {
      return res.status(400).json({
        success: false,
        message: "Coupon expired or usage limit reached",
      });
    }

    /* ================= CALCULATE ================= */
    const discountAmount = (price * coupon.discount) / 100;
    const finalAmount = Math.max(price - discountAmount, 0);

    /* ================= RESPONSE ================= */
    return res.json({
      success: true,
      data: {
        couponId: coupon._id,
        code: coupon.code,
        percentage: coupon.discount,
        discount: discountAmount,
        finalAmount,
      },
    });

  } catch (error) {
    console.error("VALIDATE COUPON ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to validate coupon",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  }
};