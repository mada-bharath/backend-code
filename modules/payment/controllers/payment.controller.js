/**
 * =========================================================
 * 💳 PAYMENT CONTROLLER (FINAL PRODUCTION 🔥)
 * =========================================================
 * Path: backend/modules/payment/controllers/payment.controller.js
 *
 * Implements ALL requirement rules:
 * ✅ Create order (BEFORE payment starts)
 * ✅ Verify payment (backend verification — never trust frontend)
 * ✅ Duplicate purchase prevention
 * ✅ Pending payment handling (page refresh case)
 * ✅ 2-year course expiry
 * ✅ DB failure recovery (reconciliation endpoint)
 * ✅ Coupon validation and discount
 * ✅ Payment history for user
 * ✅ Admin payment overview
 * ✅ ALL controllers use (req, res) — never (req, res, next)
 * =========================================================
 */

import mongoose  from "mongoose";
import Payment   from "../models/payment.model.js";
import Purchase  from "../../purchase/models/purchase.model.js";
import Course    from "../../course/models/course.model.js";
import User      from "../../user/models/user.js";
import Coupon    from "../../admin/models/coupon.model.js";
import {
  createRazorpayOrder,
  verifyRazorpaySignature,
  fetchRazorpayPayment,
  fetchRazorpayOrder,
} from "../services/razorpay.service.js";

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
const sendError = (res, message = "Something went wrong", code = 500) =>
  res.status(code).json({ success: false, message });

const sendOk = (res, data, message = "Success", code = 200) =>
  res.status(code).json({ success: true, message, data });

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const asObjectId = (id) => new mongoose.Types.ObjectId(id);

const isRazorpayConfigured = () =>
  Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

const buildPendingOrderPlaceholder = () =>
  `pending_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const buildPurchaseLookup = (userId, courseId) => ({
  $or: [
    { userId: asObjectId(userId), courseId: asObjectId(courseId) },
    { user: asObjectId(userId), course: asObjectId(courseId) },
  ],
});

const buildUserPurchaseLookup = (userId) => ({
  $or: [{ userId: asObjectId(userId) }, { user: asObjectId(userId) }],
});

const getPurchaseCourse = (purchase) => purchase.courseId || purchase.course;

const getCourseRuntimeStats = (course) => {
  const sections = Array.isArray(course?.sections) ? course.sections : [];

  return sections.reduce(
    (stats, section) => {
      const videos = Array.isArray(section?.videos) ? section.videos : [];
      stats.totalVideos += videos.length;
      stats.totalDuration += videos.reduce(
        (sum, video) => sum + (Number(video?.duration) || 0),
        0
      );
      return stats;
    },
    { totalDuration: 0, totalVideos: 0 }
  );
};

const withCourseRuntimeStats = (course) => {
  if (!course || (!course._id && !course.title && !course.sections)) return course;

  const stats = getCourseRuntimeStats(course);

  return {
    ...course,
    totalDuration: stats.totalDuration,
    totalDurationSeconds: stats.totalDuration,
    totalHours: Number((stats.totalDuration / 3600).toFixed(2)),
    totalVideos: stats.totalVideos,
  };
};

const normalizePurchaseAccess = (purchase, now = new Date()) => {
  const course = withCourseRuntimeStats(getPurchaseCourse(purchase));
  const expiry = purchase.expiryDate || purchase.expiresAt || null;
  const hasExpiry = Boolean(expiry);
  const isExpired = hasExpiry && new Date(expiry) <= now;
  const statusAllowsAccess =
    !purchase.status || ["completed", "success", "paid"].includes(purchase.status);

  return {
    ...purchase,
    courseId: course,
    course,
    expiryDate: expiry,
    expiresAt: expiry,
    accessType:
      purchase.accessType ||
      (purchase.paymentMethod === "admin_grant" ? "admin_grant" : "purchased"),
    isActive:
      statusAllowsAccess &&
      purchase.isActive !== false &&
      !isExpired,
    isExpired,
    daysRemaining: hasExpiry
      ? Math.max(
          0,
          Math.ceil((new Date(expiry) - now) / (1000 * 60 * 60 * 24))
        )
      : null,
  };
};

/* Calculate 2-year expiry from purchase date */
const calcExpiryDate = (from = new Date()) => {
  const d = new Date(from);
  d.setFullYear(d.getFullYear() + 2);
  return d;
};

const getCoursePaymentPrice = (course = {}) => {
  if (course.isFree) return 0;
  return Number(course.finalPrice ?? course.discountPrice ?? course.price ?? course.originalPrice ?? 0);
};

const getCourseOriginalPaymentPrice = (course = {}) =>
  Number(course.originalPrice ?? course.price ?? getCoursePaymentPrice(course));

const buildPaymentItem = (course = {}) => {
  const originalAmount = getCourseOriginalPaymentPrice(course);
  const finalAmount = getCoursePaymentPrice(course);

  return {
    courseId: course._id,
    courseName: course.title || "Course",
    originalAmount,
    discountAmount: Math.max(originalAmount - finalAmount, 0),
    finalAmount,
  };
};

const getPaymentCourseItems = (paymentRecord) => {
  const savedItems = Array.isArray(paymentRecord?.items) ? paymentRecord.items : [];

  if (savedItems.length > 0) {
    return savedItems
      .filter((item) => item?.courseId)
      .map((item) => ({
        courseId: item.courseId,
        courseName: item.courseName || paymentRecord.snapshot?.courseName || "Course",
        originalAmount: Number(item.originalAmount || item.finalAmount || 0),
        discountAmount: Number(item.discountAmount || 0),
        finalAmount: Number(item.finalAmount || 0),
      }));
  }

  if (!paymentRecord?.courseId) return [];

  return [
    {
      courseId: paymentRecord.courseId,
      courseName: paymentRecord.snapshot?.courseName || "Course",
      originalAmount: Number(paymentRecord.originalAmount || paymentRecord.finalAmount || 0),
      discountAmount: Number(paymentRecord.discountAmount || 0),
      finalAmount: Number(paymentRecord.finalAmount || 0),
    },
  ];
};

const createPurchaseRecordsForItems = async ({
  userId,
  userName,
  userEmail,
  items,
  paymentRecordId = null,
  purchaseDate,
  expiryDate,
  paymentMethod,
  accessType,
  razorpayPaymentId = null,
  razorpayOrderId = null,
  couponCode = null,
  session = null,
}) => {
  const writeOptions = session ? { session } : {};

  await Promise.all(
    items.map((item) =>
      Purchase.findOneAndUpdate(
        buildPurchaseLookup(userId, item.courseId),
        {
          $set: {
            userId,
            user:     userId,
            courseId: item.courseId,
            course:   item.courseId,
            paymentId: paymentRecordId,
            snapshot: {
              userName,
              userEmail,
              courseName: item.courseName,
              amountPaid: item.finalAmount,
            },
            purchaseDate,
            purchasedAt: purchaseDate,
            expiryDate,
            expiresAt: expiryDate,
            accessType,
            isActive:   true,
            status:     "completed",
            pricePaid:  item.finalAmount,
            paymentMethod,
            razorpayPaymentId,
            razorpayOrderId,
            couponCode,
            discountAmount: item.discountAmount || 0,
            courseDeleted: false,
          },
        },
        { upsert: true, new: true, ...writeOptions }
      )
    )
  );

  await User.findByIdAndUpdate(
    userId,
    {
      $addToSet: {
        purchasedCourses: {
          $each: items.map((item) => ({
            courseId:   item.courseId,
            accessType,
            expiresAt:  expiryDate,
          })),
        },
      },
    },
    writeOptions
  );

  await Course.updateMany(
    { _id: { $in: items.map((item) => item.courseId) } },
    { $inc: { totalStudents: 1 } },
    writeOptions
  );
};

/* ═══════════════════════════════════════
   1. CREATE ORDER
   POST /api/payment/create-order
   Called BEFORE showing Razorpay checkout
═══════════════════════════════════════ */
export const createOrder = async (req, res) => {
  try {
    const userId   = req.user?.id || req.user?._id;
    const { courseId, couponCode } = req.body;

    if (!isValidId(courseId)) {
      return sendError(res, "Invalid courseId", 400);
    }

    /* ── Fetch user + course in parallel ── */
    const [user, course] = await Promise.all([
      User.findById(userId).select("-password").lean(),
      Course.findOne({ _id: courseId, isDeleted: false, isPublished: true }).lean(),
    ]);

    if (!user)   return sendError(res, "User not found", 404);
    if (!course) return sendError(res, "Course not found or not available", 404);

    /* ── Duplicate purchase check ── */
    const existingPurchase = await Purchase.findOne(
      buildPurchaseLookup(userId, courseId)
    ).lean();

    if (existingPurchase) {
      /* Active purchase exists */
      const existingAccess = normalizePurchaseAccess(existingPurchase);
      if (existingAccess.isActive) {
        return sendError(res, "You have already purchased this course and your access is still active.", 400);
      }
      /* Expired — allow re-purchase (fall through) */
    }

    /* ── Check for existing PENDING payment (page refresh case) ── */
    const pendingPayment = await Payment.findOne({
      userId,
      courseId,
      status: "pending",
    })
      .sort({ createdAt: -1 })
      .lean();

    if (pendingPayment && pendingPayment.razorpayOrderId) {
      if (!String(pendingPayment.razorpayOrderId).startsWith("order_")) {
        await Payment.findByIdAndUpdate(pendingPayment._id, {
          $set: { status: "failed" },
        });
      } else {
        if (!isRazorpayConfigured()) {
          return sendError(
            res,
            "Payment gateway is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.",
            503
          );
        }

        /* Resume existing pending order */
        return sendOk(res, {
          orderId:        pendingPayment.razorpayOrderId,
          paymentRecordId: String(pendingPayment._id),
          amount:          pendingPayment.finalAmount,
          currency:        "INR",
          courseName:      course.title,
          courseId:        String(course._id),
          keyId:           process.env.RAZORPAY_KEY_ID,
          prefill: {
            name:  user.name,
            email: user.email,
            contact: user.phone || "",
          },
        }, "Resuming existing pending order");
      }
    }

    /* ── Apply coupon if provided ── */
    let discountAmount = 0;
    let couponDoc      = null;
    let finalAmount    = course.finalPrice || course.originalPrice || 0;
    const originalAmount = finalAmount;

    if (couponCode) {
      couponDoc = await Coupon.findOne({
        code:     couponCode.trim().toUpperCase(),
        isActive: true,
      }).lean();

      if (!couponDoc) {
        return sendError(res, "Invalid or expired coupon code", 400);
      }
      if (couponDoc.expiresAt && new Date(couponDoc.expiresAt) < new Date()) {
        return sendError(res, "This coupon has expired", 400);
      }
      if (couponDoc.usageLimit && couponDoc.usedCount >= couponDoc.usageLimit) {
        return sendError(res, "Coupon usage limit has been reached", 400);
      }

      discountAmount = Math.round((originalAmount * couponDoc.discount) / 100);
      finalAmount    = Math.max(0, originalAmount - discountAmount);
    }

    /* ── Free course — skip Razorpay ── */
    if (finalAmount === 0 || course.isFree) {
      const purchaseDate = new Date();
      const expiryDate   = calcExpiryDate(purchaseDate);

      /* Upsert purchase */
      await Purchase.findOneAndUpdate(
        buildPurchaseLookup(userId, courseId),
        {
          $set: {
            userId,
            user:      userId,
            courseId,
            course:    courseId,
            paymentId:    null,
            snapshot: {
              userName:   user.name,
              userEmail:  user.email,
              courseName: course.title,
              amountPaid: 0,
            },
            purchaseDate,
            purchasedAt: purchaseDate,
            expiryDate,
            expiresAt: expiryDate,
            accessType: "free",
            isActive:   true,
            status:     "completed",
            pricePaid:  0,
            paymentMethod: couponDoc ? "coupon" : "free",
            couponCode: couponDoc?.code || null,
            discountAmount,
            courseDeleted: false,
          },
        },
        { upsert: true, new: true }
      );

      /* Also add to user.purchasedCourses */
      await User.findByIdAndUpdate(userId, {
        $addToSet: {
          purchasedCourses: { courseId, accessType: "free", expiresAt: expiryDate },
        },
      });

      if (couponDoc) {
        await Coupon.findByIdAndUpdate(couponDoc._id, { $inc: { usedCount: 1 } });
      }

      await Course.findByIdAndUpdate(courseId, { $inc: { totalStudents: 1 } });

      return sendOk(res, { isFree: true, courseId: String(course._id) }, "Free course enrolled");
    }

    if (!isRazorpayConfigured()) {
      return sendError(
        res,
        "Payment gateway is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.",
        503
      );
    }

    /* ── Create Payment record (status = pending) BEFORE Razorpay ── */
    const paymentRecord = await Payment.create({
      userId,
      courseId,
      snapshot: {
        userName:   user.name,
        userEmail:  user.email,
        courseName: course.title,
      },
      originalAmount,
      discountAmount,
      finalAmount,
      amount:      Math.round(finalAmount * 100),
      razorpayOrderId: buildPendingOrderPlaceholder(),
      couponCode:  couponCode || null,
      couponId:    couponDoc?._id || null,
      status:      "pending",
      ipAddress:   req.ip,
      userAgent:   req.get("User-Agent"),
    });

    /* ── Create Razorpay order ── */
    let rzOrder;
    try {
      rzOrder = await createRazorpayOrder(finalAmount, String(paymentRecord._id), {
        courseId:  String(courseId),
        userId:    String(userId),
        courseName: course.title,
      });
    } catch (err) {
      await Payment.findByIdAndUpdate(paymentRecord._id, {
        $set: { status: "failed" },
        $inc: { attempts: 1 },
      });
      throw err;
    }

    /* ── Store Razorpay orderId in our record ── */
    await Payment.findByIdAndUpdate(paymentRecord._id, {
      $set: { razorpayOrderId: rzOrder.id },
    });

    return sendOk(res, {
      orderId:         rzOrder.id,
      paymentRecordId: String(paymentRecord._id),
      amount:          finalAmount,
      currency:        "INR",
      courseName:      course.title,
      courseId:        String(course._id),
      originalAmount,
      discountAmount,
      couponApplied:   !!couponDoc,
      keyId:           process.env.RAZORPAY_KEY_ID,
      prefill: {
        name:    user.name,
        email:   user.email,
        contact: user.phone || "",
      },
    }, "Order created successfully");

  } catch (error) {
    console.error("❌ [Payment] createOrder Error:", error.message);
    return sendError(res, error.message || "Failed to create payment order");
  }
};

/* ═══════════════════════════════════════
   2. VERIFY PAYMENT
   POST /api/payment/verify
   Called AFTER Razorpay redirects back
═══════════════════════════════════════ */
export const createWishlistOrder = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const requestedIds = Array.isArray(req.body.courseIds) ? req.body.courseIds : [];
    const courseIds = [...new Set(requestedIds.map(String).filter(isValidId))];

    if (courseIds.length === 0) {
      return sendError(res, "Select at least one valid wishlist course", 400);
    }

    const objectIds = courseIds.map(asObjectId);

    const [user, courses, existingPurchases] = await Promise.all([
      User.findById(userId).select("-password").lean(),
      Course.find({
        _id: { $in: objectIds },
        isDeleted: false,
        isPublished: true,
      }).lean(),
      Purchase.find({
        $or: [
          { userId: asObjectId(userId), courseId: { $in: objectIds } },
          { user: asObjectId(userId), course: { $in: objectIds } },
        ],
      }).lean(),
    ]);

    if (!user) return sendError(res, "User not found", 404);
    if (courses.length === 0) {
      return sendError(res, "No wishlist courses are available for checkout", 404);
    }

    const activeCourseIds = new Set(
      existingPurchases
        .filter((purchase) => normalizePurchaseAccess(purchase).isActive)
        .map((purchase) => String(purchase.courseId || purchase.course))
    );

    const items = courses
      .filter((course) => !activeCourseIds.has(String(course._id)))
      .map(buildPaymentItem);

    if (items.length === 0) {
      return sendError(res, "You already have access to these courses", 400);
    }

    const originalAmount = items.reduce((sum, item) => sum + item.originalAmount, 0);
    const discountAmount = items.reduce((sum, item) => sum + item.discountAmount, 0);
    const finalAmount = items.reduce((sum, item) => sum + item.finalAmount, 0);
    const firstItem = items[0];
    const courseName =
      items.length === 1 ? firstItem.courseName : `${items.length} wishlist courses`;

    if (finalAmount === 0) {
      const purchaseDate = new Date();
      const expiryDate = calcExpiryDate(purchaseDate);

      await createPurchaseRecordsForItems({
        userId,
        userName: user.name,
        userEmail: user.email,
        items,
        purchaseDate,
        expiryDate,
        paymentMethod: "free",
        accessType: "free",
      });

      return sendOk(
        res,
        {
          isFree: true,
          courseId: String(firstItem.courseId),
          courseIds: items.map((item) => String(item.courseId)),
          courseCount: items.length,
        },
        "Wishlist courses enrolled"
      );
    }

    if (!isRazorpayConfigured()) {
      return sendError(
        res,
        "Payment gateway is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.",
        503
      );
    }

    const paymentRecord = await Payment.create({
      userId,
      courseId: firstItem.courseId,
      isBulk: items.length > 1,
      items,
      snapshot: {
        userName:   user.name,
        userEmail:  user.email,
        courseName,
      },
      originalAmount,
      discountAmount,
      finalAmount,
      amount:      Math.round(finalAmount * 100),
      razorpayOrderId: buildPendingOrderPlaceholder(),
      status:      "pending",
      ipAddress:   req.ip,
      userAgent:   req.get("User-Agent"),
    });

    let rzOrder;
    try {
      rzOrder = await createRazorpayOrder(finalAmount, String(paymentRecord._id), {
        source: "wishlist",
        userId: String(userId),
        courseCount: String(items.length),
      });
    } catch (err) {
      await Payment.findByIdAndUpdate(paymentRecord._id, {
        $set: { status: "failed" },
        $inc: { attempts: 1 },
      });
      throw err;
    }

    await Payment.findByIdAndUpdate(paymentRecord._id, {
      $set: { razorpayOrderId: rzOrder.id },
    });

    return sendOk(
      res,
      {
        orderId:         rzOrder.id,
        paymentRecordId: String(paymentRecord._id),
        amount:          finalAmount,
        currency:        "INR",
        courseName,
        courseId:        String(firstItem.courseId),
        courseIds:       items.map((item) => String(item.courseId)),
        courseCount:     items.length,
        originalAmount,
        discountAmount,
        keyId:           process.env.RAZORPAY_KEY_ID,
        prefill: {
          name:    user.name,
          email:   user.email,
          contact: user.phone || "",
        },
      },
      "Wishlist order created successfully"
    );
  } catch (error) {
    console.error("[Payment] createWishlistOrder Error:", error.message);
    return sendError(res, error.message || "Failed to create wishlist payment order");
  }
};

export const verifyPayment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user?.id || req.user?._id;
    const {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      paymentRecordId,
    } = req.body;

    /* ── Input validation ── */
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      await session.abortTransaction();
      return sendError(res, "Missing payment verification fields", 400);
    }

    /* ── Signature verification (CRITICAL — never trust frontend) ── */
    const isValid = verifyRazorpaySignature(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature
    );

    if (!isValid) {
      /* Mark as failed */
      if (paymentRecordId && isValidId(paymentRecordId)) {
        await Payment.findByIdAndUpdate(paymentRecordId, {
          $set: { status: "failed", razorpayPaymentId },
        });
      }
      await session.abortTransaction();
      return sendError(res, "Payment verification failed — invalid signature", 400);
    }

    /* ── Find our payment record ── */
    let paymentRecord = null;

    if (paymentRecordId && isValidId(paymentRecordId)) {
      paymentRecord = await Payment.findById(paymentRecordId).session(session);
    }

    if (!paymentRecord) {
      /* Try to find by Razorpay order ID */
      paymentRecord = await Payment.findOne({
        razorpayOrderId,
        userId,
      }).session(session);
    }

    if (!paymentRecord) {
      await session.abortTransaction();
      return sendError(res, "Payment record not found", 404);
    }

    /* ── Idempotency check — already verified? ── */
    if (paymentRecord.status === "success") {
      const paymentItems = getPaymentCourseItems(paymentRecord);
      await session.abortTransaction();
      return sendOk(res, {
        courseId: String(paymentRecord.courseId),
        courseIds: paymentItems.map((item) => String(item.courseId)),
        courseCount: paymentItems.length || 1,
        alreadyVerified: true,
      }, "Payment already verified — access granted");
    }

    /* ── Update payment record ── */
    const purchaseDate = new Date();
    const expiryDate   = calcExpiryDate(purchaseDate);
    const paymentItems = getPaymentCourseItems(paymentRecord);

    paymentRecord.razorpayPaymentId = razorpayPaymentId;
    paymentRecord.razorpaySignature = razorpaySignature;
    paymentRecord.status            = "success";
    paymentRecord.purchaseDate      = purchaseDate;
    paymentRecord.expiryDate        = expiryDate;
    paymentRecord.isReconciled      = true;
    await paymentRecord.save({ session });

    /* ── Upsert Purchase record (access record) ── */
    await createPurchaseRecordsForItems({
      userId,
      userName: paymentRecord.snapshot.userName,
      userEmail: paymentRecord.snapshot.userEmail,
      items: paymentItems,
      paymentRecordId: paymentRecord._id,
      purchaseDate,
      expiryDate,
      paymentMethod: "razorpay",
      accessType: "purchased",
      razorpayPaymentId,
      razorpayOrderId,
      couponCode: paymentRecord.couponCode || null,
      session,
    });

    /* ── Add to user.purchasedCourses ── */
    /* ── Increment coupon used count ── */
    if (paymentRecord.couponId) {
      await Coupon.findByIdAndUpdate(
        paymentRecord.couponId,
        { $inc: { usedCount: 1 } },
        { session }
      );
    }

    /* ── Increment course student count ── */
    await session.commitTransaction();
    session.endSession();

    return sendOk(res, {
      courseId:    String(paymentRecord.courseId),
      courseIds:   paymentItems.map((item) => String(item.courseId)),
      courseCount: paymentItems.length || 1,
      courseName:  paymentRecord.snapshot.courseName,
      purchaseDate: purchaseDate.toISOString(),
      expiryDate:  expiryDate.toISOString(),
      amountPaid:  paymentRecord.finalAmount,
    }, "🎉 Payment verified! Course access granted.");

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ [Payment] verifyPayment Error:", error.message);
    return sendError(res, "Payment verification failed — please contact support");
  }
};

/* ═══════════════════════════════════════
   3. HANDLE PAYMENT FAILURE
   POST /api/payment/failed
═══════════════════════════════════════ */
export const handlePaymentFailure = async (req, res) => {
  try {
    const { paymentRecordId, razorpayOrderId } = req.body;

    if (paymentRecordId && isValidId(paymentRecordId)) {
      await Payment.findByIdAndUpdate(paymentRecordId, {
        $set:  { status: "failed" },
        $inc:  { attempts: 1 },
      });
    } else if (razorpayOrderId) {
      await Payment.findOneAndUpdate(
        { razorpayOrderId },
        { $set: { status: "failed" }, $inc: { attempts: 1 } }
      );
    }

    return sendOk(res, null, "Payment failure recorded");
  } catch (error) {
    console.error("❌ [Payment] handleFailure Error:", error.message);
    return sendError(res);
  }
};

/* ═══════════════════════════════════════
   4. RECOVERY / RECONCILIATION
   POST /api/payment/recover
   For the "payment succeeded but DB crashed" case
═══════════════════════════════════════ */
export const recoverPayment = async (req, res) => {
  try {
    const userId              = req.user?.id || req.user?._id;
    const { razorpayPaymentId } = req.body;

    if (!razorpayPaymentId) {
      return sendError(res, "razorpayPaymentId is required", 400);
    }

    /* Find our payment record */
    const paymentRecord = await Payment.findOne({ razorpayPaymentId });

    if (paymentRecord && paymentRecord.status === "success") {
      return sendOk(res, {
        courseId:  String(paymentRecord.courseId),
        alreadyRecovered: true,
      }, "Payment already recorded");
    }

    /* Verify with Razorpay directly */
    const rzPayment = await fetchRazorpayPayment(razorpayPaymentId);

    if (rzPayment.status !== "captured") {
      return sendError(res, `Payment not completed on Razorpay. Status: ${rzPayment.status}`, 400);
    }

    /* Find the pending record */
    const pendingRecord = await Payment.findOne({
      razorpayOrderId: rzPayment.order_id,
    });

    if (!pendingRecord) {
      return sendError(res, "Original payment record not found. Please contact support.", 404);
    }

    /* Re-run the success flow */
    const purchaseDate = new Date();
    const expiryDate   = calcExpiryDate(purchaseDate);

    await Payment.findByIdAndUpdate(pendingRecord._id, {
      $set: {
        razorpayPaymentId,
        status:        "success",
        purchaseDate,
        expiryDate,
        isReconciled:  true,
      },
    });

    await Purchase.findOneAndUpdate(
      buildPurchaseLookup(pendingRecord.userId, pendingRecord.courseId),
      {
        $set: {
          userId:     pendingRecord.userId,
          user:       pendingRecord.userId,
          courseId:   pendingRecord.courseId,
          course:     pendingRecord.courseId,
          paymentId:  pendingRecord._id,
          snapshot: {
            userName:   pendingRecord.snapshot.userName,
            userEmail:  pendingRecord.snapshot.userEmail,
            courseName: pendingRecord.snapshot.courseName,
            amountPaid: pendingRecord.finalAmount,
          },
          purchaseDate,
          purchasedAt: purchaseDate,
          expiryDate,
          expiresAt: expiryDate,
          accessType: "purchased",
          isActive:   true,
          status:     "completed",
          pricePaid:  pendingRecord.finalAmount,
          paymentMethod: "razorpay",
          razorpayPaymentId,
          razorpayOrderId: pendingRecord.razorpayOrderId,
          couponCode: pendingRecord.couponCode || null,
          discountAmount: pendingRecord.discountAmount || 0,
          courseDeleted: false,
        },
      },
      { upsert: true, new: true }
    );

    await User.findByIdAndUpdate(pendingRecord.userId, {
      $addToSet: {
        purchasedCourses: {
          courseId:   pendingRecord.courseId,
          accessType: "purchased",
          expiresAt:  expiryDate,
        },
      },
    });

    return sendOk(res, {
      courseId:   String(pendingRecord.courseId),
      courseName: pendingRecord.snapshot.courseName,
      expiryDate: expiryDate.toISOString(),
    }, "✅ Payment recovered and access restored");

  } catch (error) {
    console.error("❌ [Payment] recoverPayment Error:", error.message);
    return sendError(res, "Recovery failed — please contact support");
  }
};

/* ═══════════════════════════════════════
   5. CHECK PAYMENT STATUS
   GET /api/payment/status/:orderId
   For the "user refreshed" case
═══════════════════════════════════════ */
export const checkPaymentStatus = async (req, res) => {
  try {
    const userId  = req.user?.id || req.user?._id;
    const { orderId } = req.params;

    const payment = await Payment.findOne({
      razorpayOrderId: orderId,
      userId,
    }).lean();

    if (!payment) {
      return sendError(res, "Payment record not found", 404);
    }

    return sendOk(res, {
      status:          payment.status,
      courseId:        String(payment.courseId),
      paymentRecordId: String(payment._id),
      amountPaid:      payment.finalAmount,
      expiryDate:      payment.expiryDate,
    });

  } catch (error) {
    console.error("❌ [Payment] checkStatus Error:", error.message);
    return sendError(res);
  }
};

/* ═══════════════════════════════════════
   6. GET USER PAYMENT HISTORY
   GET /api/payment/my-history
═══════════════════════════════════════ */
export const getMyPaymentHistory = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { page = 1, limit = 10, status = "all" } = req.query;
    const normalizedPage = Math.max(1, Number(page) || 1);
    const normalizedLimit = Math.min(50, Math.max(1, Number(limit) || 10));
    const skip = (normalizedPage - 1) * normalizedLimit;
    const allowedStatuses = ["success", "failed", "refunded"];
    const normalizedStatus = String(status || "all").toLowerCase();

    if (normalizedStatus !== "all" && !allowedStatuses.includes(normalizedStatus)) {
      return sendError(res, "Invalid payment status filter", 400);
    }

    const userObjectId = asObjectId(userId);
    const visibleStatusFilter =
      normalizedStatus === "all" ? allowedStatuses : [normalizedStatus];
    const paymentFilter = {
      userId: userObjectId,
      status: { $in: visibleStatusFilter },
    };
    const summaryFilter = {
      userId: userObjectId,
      status: { $in: allowedStatuses },
    };

    const [payments, total, summaryRows] = await Promise.all([
      Payment.find(paymentFilter)
        .populate("courseId", "title thumbnail originalPrice finalPrice")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(normalizedLimit)
        .lean(),
      Payment.countDocuments(paymentFilter),
      Payment.aggregate([
        { $match: summaryFilter },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalSpent: {
              $sum: {
                $cond: [{ $eq: ["$status", "success"] }, "$finalAmount", 0],
              },
            },
          },
        },
      ]),
    ]);

    /* Annotate with access status */
    const enriched = payments.map((p) => ({
      ...p,
      isActive:
        p.status === "success" &&
        p.expiryDate &&
        new Date(p.expiryDate) > new Date(),
    }));

    const summary = summaryRows.reduce(
      (acc, row) => {
        acc[row._id] = row.count;
        acc.totalPurchases += row.count;
        acc.totalSpent += row.totalSpent || 0;
        return acc;
      },
      {
        success: 0,
        failed: 0,
        refunded: 0,
        totalPurchases: 0,
        totalSpent: 0,
      }
    );

    return sendOk(res, {
      payments: enriched,
      summary,
      pagination: {
        page:       normalizedPage,
        limit:      normalizedLimit,
        total,
        totalPages: Math.ceil(total / normalizedLimit),
      },
    });

  } catch (error) {
    console.error("❌ [Payment] getMyHistory Error:", error.message);
    return sendError(res);
  }
};

/* ═══════════════════════════════════════
   7. GET USER PURCHASES (ACTIVE ACCESS)
   GET /api/payment/my-courses
   Powers the student "My Courses" page
═══════════════════════════════════════ */
export const deleteFailedPayment = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { id } = req.params;

    if (!isValidId(id)) {
      return sendError(res, "Invalid payment ID", 400);
    }

    const payment = await Payment.findOne({
      _id: id,
      userId: asObjectId(userId),
    }).select("_id status");

    if (!payment) {
      return sendError(res, "Payment not found", 404);
    }

    if (payment.status !== "failed") {
      return sendError(res, "Only failed payment records can be deleted", 400);
    }

    await Payment.deleteOne({ _id: payment._id });

    return sendOk(res, { id }, "Failed payment deleted");
  } catch (error) {
    console.error("[Payment] deleteFailedPayment Error:", error.message);
    return sendError(res, "Failed to delete failed payment");
  }
};

export const getMyCourses = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;

    const [user, purchases] = await Promise.all([
      User.findById(userId)
        .select("role isInstructorActive isFreeAccess purchasedCourses")
        .lean(),
      Purchase.find(buildUserPurchaseLookup(userId))
        .populate({
          path:   "courseId",
          select: "title thumbnail description sections totalStudents finalPrice originalPrice isFree level assignedInstructors",
          match:  { isDeleted: false },
          populate: {
            path:   "assignedInstructors.instructor",
            select: "name email",
          },
        })
        .populate({
          path:   "course",
          select: "title thumbnail description sections totalStudents finalPrice originalPrice isFree level assignedInstructors",
          match:  { isDeleted: false },
          populate: {
            path:   "assignedInstructors.instructor",
            select: "name email",
          },
        })
        .sort({ purchaseDate: -1, purchasedAt: -1 })
        .lean(),
    ]);

    const now = new Date();
    const normalized = purchases
      .map((purchase) => normalizePurchaseAccess(purchase, now))
      .filter((purchase) => Boolean(purchase.courseId));

    const seenCourseIds = new Set(
      normalized.map((purchase) => String(purchase.courseId?._id || purchase.courseId))
    );

    if (user?.isFreeAccess) {
      const freeCourses = await Course.find({
        isDeleted: false,
        isPublished: true,
      })
        .select("title thumbnail description sections totalStudents finalPrice originalPrice isFree level assignedInstructors")
        .populate("assignedInstructors.instructor", "name email")
        .sort({ createdAt: -1 })
        .lean();

      for (const course of freeCourses) {
        const courseKey = String(course._id);
        if (seenCourseIds.has(courseKey)) continue;
        seenCourseIds.add(courseKey);
        normalized.push({
          _id: `free-${courseKey}`,
          courseId: withCourseRuntimeStats(course),
          course: withCourseRuntimeStats(course),
          accessType: "free",
          isActive: true,
          isExpired: false,
          expiryDate: null,
          expiresAt: null,
          daysRemaining: null,
          purchaseDate: null,
          purchasedAt: null,
        });
      }
    }

    if (user?.role === "instructor" && user?.isInstructorActive) {
      const teachingCourses = await Course.find({
        isDeleted: false,
        $or: [
          { createdBy: asObjectId(userId) },
          {
            assignedInstructors: {
              $elemMatch: {
                instructor: asObjectId(userId),
                isActive: true,
              },
            },
          },
        ],
      })
        .populate("assignedInstructors.instructor", "name email")
        .sort({ createdAt: -1 })
        .lean();

      for (const course of teachingCourses) {
        const courseKey = String(course._id);
        if (seenCourseIds.has(courseKey)) continue;
        seenCourseIds.add(courseKey);
        normalized.push({
          _id: `instructor-${courseKey}`,
          courseId: withCourseRuntimeStats(course),
          course: withCourseRuntimeStats(course),
          accessType: "instructor",
          isActive: true,
          isExpired: false,
          expiryDate: null,
          expiresAt: null,
          daysRemaining: null,
          purchaseDate: null,
          purchasedAt: null,
        });
      }
    }

    return sendOk(res, normalized);

  } catch (error) {
    console.error("❌ [Payment] getMyCourses Error:", error.message);
    return sendError(res);
  }
};

/* ═══════════════════════════════════════
   8. CHECK IF USER HAS COURSE ACCESS
   GET /api/payment/access/:courseId
═══════════════════════════════════════ */
export const checkCourseAccess = async (req, res) => {
  try {
    const userId   = req.user?.id || req.user?._id;
    const { courseId } = req.params;

    if (!isValidId(courseId)) {
      return sendError(res, "Invalid courseId", 400);
    }

    const [course, user] = await Promise.all([
      Course.findOne({ _id: courseId, isDeleted: false })
        .select("isFree isPublished createdBy assignedInstructors")
        .lean(),
      User.findById(userId)
        .select("role isInstructorActive isFreeAccess purchasedCourses")
        .lean(),
    ]);

    if (!course) return sendError(res, "Course not found", 404);

    if (course.isFree) {
      return sendOk(res, { hasAccess: true, reason: "free_course" });
    }

    if (user?.isFreeAccess) {
      return sendOk(res, { hasAccess: true, reason: "free_access" });
    }

    if (user?.role === "instructor" && user?.isInstructorActive) {
      const isCreator = String(course.createdBy || "") === String(userId);
      const isAssigned = course.assignedInstructors?.some(
        (assignment) =>
          String(assignment.instructor || "") === String(userId) &&
          assignment.isActive
      );

      if (isCreator || isAssigned) {
        return sendOk(res, {
          hasAccess: true,
          reason: "instructor_assignment",
          expiryDate: null,
          daysRemaining: null,
        });
      }
    }

    const userEmbeddedAccess = user?.purchasedCourses?.find(
      (purchase) =>
        String(purchase.courseId || "") === String(courseId) &&
        (!purchase.expiresAt || new Date(purchase.expiresAt) > new Date())
    );

    if (userEmbeddedAccess) {
      return sendOk(res, {
        hasAccess: true,
        reason: userEmbeddedAccess.accessType || "user_course_access",
        expiryDate: userEmbeddedAccess.expiresAt || null,
        daysRemaining: userEmbeddedAccess.expiresAt
          ? Math.max(
              0,
              Math.ceil(
                (new Date(userEmbeddedAccess.expiresAt) - new Date()) /
                  (1000 * 60 * 60 * 24)
              )
            )
          : null,
      });
    }

    const purchase = await Purchase.findOne({
      ...buildPurchaseLookup(userId, courseId),
      isActive: { $ne: false },
    }).lean();

    if (!purchase) {
      return sendOk(res, { hasAccess: false, reason: "not_purchased" });
    }

    const now     = new Date();
    const expiry  = purchase.expiryDate || purchase.expiresAt;
    const expired = expiry && new Date(expiry) <= now;

    if (expired) {
      /* Auto-update isActive */
      await Purchase.findByIdAndUpdate(purchase._id, { $set: { isActive: false } });
      return sendOk(res, { hasAccess: false, reason: "expired" });
    }

    return sendOk(res, {
      hasAccess:    true,
      reason:       "purchased",
      expiryDate:   expiry || null,
      daysRemaining: expiry
        ? Math.ceil((new Date(expiry) - now) / (1000 * 60 * 60 * 24))
        : null,
    });

  } catch (error) {
    console.error("❌ [Payment] checkAccess Error:", error.message);
    return sendError(res);
  }
};

/* ═══════════════════════════════════════
   9. ADMIN: GET ALL PAYMENTS
   GET /api/payment/admin/all
═══════════════════════════════════════ */
export const adminGetAllPayments = async (req, res) => {
  try {
    const {
      page   = 1,
      limit  = 20,
      status,
      search,
    } = req.query;

    const skip  = (Number(page) - 1) * Number(limit);
    const query = {};
    if (status && status !== "all") query.status = status;

    const [payments, total, revenue] = await Promise.all([
      Payment.find(query)
        .populate("userId",   "name email phone")
        .populate("courseId", "title finalPrice")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Payment.countDocuments(query),
      Payment.aggregate([
        { $match: { status: "success" } },
        { $group: { _id: null, total: { $sum: "$finalAmount" } } },
      ]),
    ]);

    const totalRevenue = revenue[0]?.total || 0;

    return sendOk(res, {
      payments,
      totalRevenue,
      pagination: {
        page:       Number(page),
        limit:      Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });

  } catch (error) {
    console.error("❌ [Payment] adminGetAll Error:", error.message);
    return sendError(res);
  }
};

/* ═══════════════════════════════════════
   10. VALIDATE COUPON (STANDALONE)
   POST /api/payment/validate-coupon
═══════════════════════════════════════ */
export const validateCoupon = async (req, res) => {
  try {
    const { code, courseId } = req.body;

    if (!code) return sendError(res, "Coupon code is required", 400);

    const coupon = await Coupon.findOne({
      code:     code.trim().toUpperCase(),
      isActive: true,
    }).lean();

    if (!coupon) return sendError(res, "Invalid coupon code", 404);
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      return sendError(res, "This coupon has expired", 400);
    }
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return sendError(res, "Coupon usage limit reached", 400);
    }

    let coursePrice = 0;
    if (courseId && isValidId(courseId)) {
      const course = await Course.findById(courseId).select("finalPrice originalPrice").lean();
      coursePrice  = course?.finalPrice || course?.originalPrice || 0;
    }

    const discountAmount = Math.round((coursePrice * coupon.discount) / 100);
    const finalPrice     = Math.max(0, coursePrice - discountAmount);

    return sendOk(res, {
      code:               coupon.code,
      discountPercentage: coupon.discount,
      originalPrice:      coursePrice,
      discountAmount,
      finalPrice,
      remaining:          coupon.usageLimit ? coupon.usageLimit - coupon.usedCount : "Unlimited",
    }, "Coupon applied ✅");

  } catch (error) {
    console.error("❌ [Payment] validateCoupon Error:", error.message);
    return sendError(res);
  }
};
