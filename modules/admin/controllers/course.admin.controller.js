/**
 * =========================================================
 * 📚 ADMIN → COURSE CONTROLLER (FINAL PRODUCTION 🔥)
 * =========================================================
 * Path: backend/modules/admin/controllers/course.admin.controller.js
 *
 * Named exports (ALL must match admin.routes.js imports):
 * ✅ createCourse
 * ✅ getAllCourses
 * ✅ getCourseById
 * ✅ updateCourse
 * ✅ deleteCourse          (soft delete → isDeleted: true)
 * ✅ updateCourseStatus
 * =========================================================
 */

import mongoose from "mongoose";
import Course   from "../../course/models/course.model.js";
import User     from "../../user/models/user.js";

/* ─────────────────────────────────────────
   🧠 HELPERS
───────────────────────────────────────── */
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const sendError = (res, message = "Something went wrong", code = 500) =>
  res.status(code).json({ success: false, message });

const sendOk = (res, data, message = "Success", code = 200) =>
  res.status(code).json({ success: true, message, data });

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseBoolean = (value) => value === true || value === "true";

const parseBoundedNumber = (value, fallback, { min = 0, max = Infinity } = {}) => {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

const normalizePermissionType = (value = "SINGLE") => {
  const type = String(value).trim().toUpperCase();
  return ["SINGLE", "MULTIPLE"].includes(type) ? type : null;
};

const normalizeUploadPath = (filePath) => {
  if (!filePath) return null;
  const normalized = String(filePath).replace(/\\/g, "/");
  const uploadsIndex = normalized.lastIndexOf("/uploads/");
  return uploadsIndex >= 0 ? normalized.slice(uploadsIndex) : normalized;
};

const getFileUrl = (file) => file?.location || normalizeUploadPath(file?.path);

const parseJsonArray = (value, fieldName) => {
  if (value === undefined || value === null || value === "") return [];
  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return { error: `${fieldName} must be a valid JSON array` };
    }
  }

  return { error: `${fieldName} must be an array` };
};

const resolveActiveInstructor = async ({ instructorId, email }) => {
  const normalizedEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";

  const query = { role: "instructor" };

  if (instructorId) {
    if (!isValidObjectId(instructorId)) {
      return { error: "Invalid instructorId format" };
    }
    query._id = instructorId;
  } else if (normalizedEmail) {
    query.email = normalizedEmail;
  } else {
    return { error: "Instructor ID or email is required" };
  }

  const instructor = await User.findOne(query).select("-password").lean();
  if (!instructor) return { error: "Instructor not found" };

  if (!instructor.isInstructorActive) {
    return {
      error: `Instructor ${instructor.email} is inactive. Activate them first.`,
    };
  }

  return { instructor };
};

const buildCourseAssignments = async ({
  permissionType,
  body,
  assignedBy,
  courseTitle,
}) => {
  if (permissionType === "SINGLE") {
    const resolved = await resolveActiveInstructor({
      instructorId: body.instructorId,
      email: body.instructorEmail || body.email,
    });

    if (resolved.error) return { error: resolved.error };

    const sectionId = new mongoose.Types.ObjectId();

    return {
      assignments: [
        {
          instructor: resolved.instructor._id,
          moduleName: null,
          sectionId,
          isActive: true,
          assignedAt: new Date(),
          assignedBy,
        },
      ],
      sections: [
        {
          _id: sectionId,
          title: "Full Course",
          description: `Instructor-led content for ${courseTitle}`,
          assignedInstructor: resolved.instructor._id,
          order: 0,
          videos: [],
        },
      ],
    };
  }

  const rawAssignments =
    body.assignments ?? body.subjects ?? body.assignedInstructors;
  const parsedAssignments = parseJsonArray(rawAssignments, "assignments");

  if (parsedAssignments.error) return { error: parsedAssignments.error };
  if (parsedAssignments.length === 0) {
    return { error: "Add at least one subject assignment for multiple courses" };
  }

  const assignments = [];
  const sections = [];

  for (const [index, item] of parsedAssignments.entries()) {
    const moduleName = String(
      item.moduleName || item.subjectName || item.title || ""
    ).trim();

    if (!moduleName) {
      return { error: `Subject title is required for row ${index + 1}` };
    }

    const resolved = await resolveActiveInstructor({
      instructorId: item.instructorId,
      email: item.instructorEmail || item.email,
    });

    if (resolved.error) {
      return { error: `${moduleName}: ${resolved.error}` };
    }

    const sectionId = new mongoose.Types.ObjectId();
    sections.push({
      _id: sectionId,
      title: moduleName,
      description: `Instructor-led module for ${courseTitle}`,
      assignedInstructor: resolved.instructor._id,
      order: index,
      videos: [],
    });

    assignments.push({
      instructor: resolved.instructor._id,
      moduleName,
      sectionId,
      isActive: true,
      assignedAt: new Date(),
      assignedBy,
    });
  }

  return { assignments, sections };
};

const normalizeOptionalUrl = (value) => {
  if (value === undefined) return undefined;
  const trimmed = String(value).trim();
  return trimmed || null;
};

const parseStringList = (value, fieldName) => {
  if (value === undefined) return { skip: true, value: undefined };
  if (Array.isArray(value)) {
    return {
      skip: false,
      value: value.map((item) => String(item).trim()).filter(Boolean),
    };
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return { skip: false, value: [] };

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return {
          skip: false,
          value: parsed.map((item) => String(item).trim()).filter(Boolean),
        };
      }
    } catch {
      /* Comma-separated fallback below. */
    }

    return {
      skip: false,
      value: trimmed.split(",").map((item) => item.trim()).filter(Boolean),
    };
  }

  return {
    skip: false,
    error: `${fieldName} must be an array, JSON array, or comma-separated string`,
  };
};

const COURSE_DETAIL_LIST_FIELDS = [
  "tags",
  "contentHighlights",
  "materialIncludes",
  "requirements",
  "outcomes",
  "audience",
];

const LEGACY_REMOVED_REQUIREMENTS = new Set([
  "basic understanding of programming language(java/scala/python).",
  "basic understanding of sql.",
  "basic understanding of linux.",
]);

const filterLegacyRequirements = (field, items) =>
  field === "requirements"
    ? items.filter((item) => !LEGACY_REMOVED_REQUIREMENTS.has(item.toLowerCase()))
    : items;

/* ═══════════════════════════════════════
   ➕ CREATE COURSE
═══════════════════════════════════════ */
/**
 * @route  POST /api/admin/courses
 * @access Admin only
 * @body   FormData (multipart) — thumbnail?, roadmap?, + text fields
 */
export const createCourse = async (req, res) => {
  try {
    const {
      title,
      subtitle = "",
      description,
      courseId,
      price,
      originalPrice: originalPriceInput,
      discount,
      discountPercentage,
      finalPrice,
      isFree          = false,
      isLocked        = true,
      permissionType  = "SINGLE",
      level           = "All Levels",
      language        = "English",
      accessDurationYears = 2,
      totalStudents,
      averageRating,
      totalReviews,
    } = req.body;

    /* ── Required field validation ── */
    if (!title?.trim())       return sendError(res, "Course title is required", 400);
    if (!description?.trim()) return sendError(res, "Course description is required", 400);

    const normalizedPermissionType = normalizePermissionType(permissionType);
    if (!normalizedPermissionType) {
      return sendError(res, "permissionType must be SINGLE or MULTIPLE", 400);
    }

    const parsedIsFree = isFree === true || isFree === "true";
    const originalPrice = Number(originalPriceInput ?? price) || 0;

    if (!parsedIsFree) {
      if (isNaN(originalPrice) || originalPrice <= 0) {
        return sendError(res, "Please set a valid price for paid courses", 400);
      }
    }

    const parsedDiscount = Math.min(
      Math.max(Number(discountPercentage ?? discount) || 0, 0),
      100
    );
    const computedFinal  = parsedIsFree
      ? 0
      : finalPrice !== undefined
        ? Number(finalPrice)
        : Math.max(0, originalPrice - (originalPrice * parsedDiscount) / 100);
    const parsedAverageRating = parseBoundedNumber(averageRating, 0, {
      min: 0,
      max: 5,
    });
    const parsedTotalReviews = parseBoundedNumber(totalReviews, 0, { min: 0 });
    const parsedTotalStudents = parseBoundedNumber(totalStudents, 0, { min: 0 });
    const detailLists = {};

    for (const field of COURSE_DETAIL_LIST_FIELDS) {
      const parsed = parseStringList(req.body[field], field);
      if (parsed.error) return sendError(res, parsed.error, 400);
      if (!parsed.skip) detailLists[field] = filterLegacyRequirements(field, parsed.value);
    }

    /* ── File handling (multer → S3 or local) ── */
    const thumbnailUrl =
      getFileUrl(req.files?.thumbnail?.[0]) || req.body.thumbnailUrl || null;

    const roadmapUrl =
      getFileUrl(req.files?.roadmap?.[0]) || req.body.roadmapUrl || null;

    const brochureUrl =
      getFileUrl(req.files?.brochure?.[0]) || req.body.brochureUrl || null;

    /* ── Build course ID ── */
    const generatedCourseId = courseId?.trim() || `CRS-${Date.now()}`;
    const actorId = req.user?._id || req.user?.id || null;
    const assignmentBuild = await buildCourseAssignments({
      permissionType: normalizedPermissionType,
      body: req.body,
      assignedBy: actorId,
      courseTitle: title.trim(),
    });

    if (assignmentBuild.error) {
      return sendError(res, assignmentBuild.error, 400);
    }

    /* ── Create ── */
    const course = await Course.create({
      title:              title.trim(),
      subtitle:           String(subtitle || "").trim(),
      description:        description.trim(),
      courseId:           generatedCourseId,
      originalPrice,
      discountPercentage: parsedDiscount,
      finalPrice:         computedFinal,
      isFree:             parsedIsFree,
      isLocked:           isLocked === true || isLocked === "true",
      accessDurationYears: 2,
      permissionType:      normalizedPermissionType,
      level,
      language,
      thumbnail:          thumbnailUrl,
      roadmap:            roadmapUrl,
      brochure:           brochureUrl,
      totalStudents:      parsedTotalStudents,
      averageRating:      parsedAverageRating,
      totalReviews:       parsedTotalReviews,
      ...detailLists,
      status:             "approved",
      isDeleted:          false,
      isPublished:        true,
      createdBy:          actorId,
      sections:           assignmentBuild.sections,
      assignedInstructors: assignmentBuild.assignments,
    });

    await Promise.all(
      assignmentBuild.assignments.map((assignment) =>
        User.findByIdAndUpdate(assignment.instructor, {
          $addToSet: {
            assignedCourses: course._id,
            subjects: assignment.moduleName || course.title,
          },
        })
      )
    );

    const populatedCourse = await Course.findById(course._id)
      .populate(
        "assignedInstructors.instructor",
        "name email isInstructorActive subjects permissionExpiry avatar bio"
      )
      .populate("sections.assignedInstructor", "name email")
      .lean();

    return sendOk(res, populatedCourse, "Course created successfully", 201);

  } catch (err) {
    console.error("❌ [CourseAdmin] createCourse:", err.message);

    if (err.code === 11000) {
      /* Duplicate courseId */
      const field = Object.keys(err.keyPattern || {})[0] || "field";
      return sendError(res, `Duplicate value for ${field}. Please generate a new Course ID.`, 400);
    }

    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((e) => e.message).join(", ");
      return sendError(res, messages, 400);
    }

    return sendError(res, err.message || "Failed to create course");
  }
};

/* ═══════════════════════════════════════
   📚 GET ALL COURSES (PAGINATED)
═══════════════════════════════════════ */
/**
 * @route  GET /api/admin/courses
 * @query  ?page=1&limit=10&search=python&status=approved
 * @access Admin only
 */
export const getAllCourses = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);
    const skip  = (page - 1) * limit;

    const { search, status } = req.query;

    /* ── Build query ── */
    const query = { isDeleted: false };
    if (status) query.status = status;
    if (search) {
      const safeSearch = escapeRegex(search);
      query.$or = [
        { title:       { $regex: safeSearch, $options: "i" } },
        { description: { $regex: safeSearch, $options: "i" } },
        { courseId:    { $regex: safeSearch, $options: "i" } },
        { tags:        { $regex: safeSearch, $options: "i" } },
      ];
    }

    const [courses, total] = await Promise.all([
      Course.find(query)
        .populate("assignedInstructors.instructor", "name email isInstructorActive subjects")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Course.countDocuments(query),
    ]);

    return res.json({
      success: true,
      data: courses,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("❌ [CourseAdmin] getAllCourses:", err.message);
    return sendError(res, "Failed to fetch courses");
  }
};

/* ═══════════════════════════════════════
   🔍 GET SINGLE COURSE BY ID
═══════════════════════════════════════ */
/**
 * @route  GET /api/admin/courses/:id
 * @access Admin only
 */
export const getCourseById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) return sendError(res, "Invalid course ID format", 400);

    const course = await Course.findOne({ _id: id, isDeleted: false })
      .populate("assignedInstructors.instructor", "name email isInstructorActive subjects permissionExpiry");

    if (!course) return sendError(res, "Course not found", 404);

    return res.json({ success: true, data: course });
  } catch (err) {
    console.error("❌ [CourseAdmin] getCourseById:", err.message);
    return sendError(res);
  }
};

/* ═══════════════════════════════════════
   ✏️ UPDATE COURSE
═══════════════════════════════════════ */
/**
 * @route  PUT /api/admin/courses/:id
 * @access Admin only
 */
export const updateCourse = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) return sendError(res, "Invalid course ID format", 400);

    const existing = await Course.findOne({ _id: id, isDeleted: false }).lean();
    if (!existing) return sendError(res, "Course not found", 404);

    const updates = {};
    const setTrimmedString = (field) => {
      if (req.body[field] === undefined) return;
      const value = String(req.body[field]).trim();
      if (value) updates[field] = value;
    };

    setTrimmedString("title");
    if (req.body.subtitle !== undefined) {
      updates.subtitle = String(req.body.subtitle || "").trim();
    }
    setTrimmedString("description");
    setTrimmedString("level");
    setTrimmedString("language");

    if (req.body.accessDurationYears !== undefined) {
      updates.accessDurationYears = 2;
    }

    if (req.body.permissionType !== undefined) {
      const permissionType = String(req.body.permissionType).trim().toUpperCase();
      if (!["SINGLE", "MULTIPLE"].includes(permissionType)) {
        return sendError(res, "permissionType must be SINGLE or MULTIPLE", 400);
      }
      updates.permissionType = permissionType;
    }

    if (req.body.isLocked !== undefined) {
      updates.isLocked = parseBoolean(req.body.isLocked);
    }

    if (req.body.totalStudents !== undefined) {
      updates.totalStudents = parseBoundedNumber(req.body.totalStudents, 0, {
        min: 0,
      });
    }

    if (req.body.averageRating !== undefined) {
      updates.averageRating = parseBoundedNumber(req.body.averageRating, 0, {
        min: 0,
        max: 5,
      });
    }

    if (req.body.totalReviews !== undefined) {
      updates.totalReviews = parseBoundedNumber(req.body.totalReviews, 0, {
        min: 0,
      });
    }

    for (const field of COURSE_DETAIL_LIST_FIELDS) {
      const parsed = parseStringList(req.body[field], field);
      if (parsed.error) return sendError(res, parsed.error, 400);
      if (!parsed.skip) updates[field] = filterLegacyRequirements(field, parsed.value);
    }

    /* File updates. URL body fields are supported for API-only updates. */
    if (req.files?.thumbnail?.[0]) {
      updates.thumbnail = getFileUrl(req.files.thumbnail[0]);
    } else if (req.body.thumbnailUrl !== undefined) {
      updates.thumbnail = normalizeOptionalUrl(req.body.thumbnailUrl);
    }

    if (req.files?.roadmap?.[0]) {
      updates.roadmap = getFileUrl(req.files.roadmap[0]);
    } else if (req.body.roadmapUrl !== undefined) {
      updates.roadmap = normalizeOptionalUrl(req.body.roadmapUrl);
    }

    if (req.files?.brochure?.[0]) {
      updates.brochure = getFileUrl(req.files.brochure[0]);
    } else if (req.body.brochureUrl !== undefined) {
      updates.brochure = normalizeOptionalUrl(req.body.brochureUrl);
    }

    const priceInput = req.body.originalPrice ?? req.body.price;
    const discountInput = req.body.discountPercentage ?? req.body.discount;
    const finalPriceInput = req.body.finalPrice;
    const pricingChanged =
      priceInput !== undefined ||
      discountInput !== undefined ||
      finalPriceInput !== undefined ||
      req.body.isFree !== undefined;

    if (pricingChanged) {
      const isFree = req.body.isFree !== undefined
        ? parseBoolean(req.body.isFree)
        : existing.isFree;

      let originalPrice = Number(existing.originalPrice) || 0;
      let discountPercentage = Number(existing.discountPercentage) || 0;

      if (priceInput !== undefined) {
        originalPrice = Number(priceInput);
        if (Number.isNaN(originalPrice) || originalPrice < 0) {
          return sendError(res, "Price must be a valid non-negative number", 400);
        }
      }

      if (discountInput !== undefined) {
        discountPercentage = Number(discountInput);
        if (
          Number.isNaN(discountPercentage) ||
          discountPercentage < 0 ||
          discountPercentage > 100
        ) {
          return sendError(res, "Discount must be a number between 0 and 100", 400);
        }
      }

      updates.isFree = isFree;
      updates.originalPrice = originalPrice;
      updates.discountPercentage = discountPercentage;

      if (isFree) {
        updates.finalPrice = 0;
      } else if (finalPriceInput !== undefined) {
        const parsedFinalPrice = Number(finalPriceInput);
        if (Number.isNaN(parsedFinalPrice) || parsedFinalPrice < 0) {
          return sendError(res, "Final price must be a valid non-negative number", 400);
        }
        updates.finalPrice = parsedFinalPrice;
      } else {
        updates.finalPrice = Math.max(
          0,
          originalPrice - (originalPrice * discountPercentage) / 100
        );
      }
    }

    if (Object.keys(updates).length === 0) {
      return sendError(res, "No valid course fields provided for update", 400);
    }

    const updatedCourse = await Course.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: updates },
      { new: true, runValidators: true }
    ).populate("assignedInstructors.instructor", "name email");

    if (!updatedCourse) return sendError(res, "Course not found", 404);

    return res.json({
      success: true,
      message: "Course updated successfully",
      data:    updatedCourse,
    });
  } catch (err) {
    console.error("❌ [CourseAdmin] updateCourse:", err.message);
    return sendError(res);
  }
};

/* ═══════════════════════════════════════
   ❌ DELETE COURSE (SOFT)
═══════════════════════════════════════ */
/**
 * @route  DELETE /api/admin/courses/:id
 * @access Admin only
 */
export const deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) return sendError(res, "Invalid course ID format", 400);

    const course = await Course.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: { isDeleted: true, isPublished: false } },
      { new: true }
    );

    if (!course) return sendError(res, "Course not found", 404);

    return res.json({ success: true, message: "Course deleted successfully" });
  } catch (err) {
    console.error("❌ [CourseAdmin] deleteCourse:", err.message);
    return sendError(res);
  }
};

/* ═══════════════════════════════════════
   🔄 UPDATE COURSE STATUS
═══════════════════════════════════════ */
/**
 * @route  PUT /api/admin/courses/:id/status
 * @body   { status: 'approved' | 'rejected' | ... }
 * @access Admin only
 */
export const updateCourseStatus = async (req, res) => {
  try {
    const { id }     = req.params;
    const { status } = req.body;

    const allowedStatuses = ["approved", "rejected", "pending", "draft", "published", "archived"];

    if (!status || !allowedStatuses.includes(status)) {
      return sendError(res, `Status must be one of: ${allowedStatuses.join(", ")}`, 400);
    }

    if (!isValidObjectId(id)) return sendError(res, "Invalid course ID format", 400);

    const course = await Course.findOneAndUpdate(
      { _id: id, isDeleted: false },
      {
        $set: {
          status,
          isPublished: status === "approved" || status === "published",
        },
      },
      { new: true }
    );

    if (!course) return sendError(res, "Course not found", 404);

    return res.json({
      success: true,
      message: `Course status updated to '${status}'`,
      data:    course,
    });
  } catch (err) {
    console.error("❌ [CourseAdmin] updateCourseStatus:", err.message);
    return sendError(res);
  }
};

