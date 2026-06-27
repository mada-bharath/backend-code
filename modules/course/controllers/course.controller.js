/**
 * =========================================================
 * ðŸŽ“ COURSE CONTROLLER (FINAL PRODUCTION ðŸ”¥)
 * =========================================================
 * Path: backend/modules/course/controllers/course.controller.js
 *
 * FIXES:
 * âœ… FIX 1: Added assignInstructor export (was missing â€” caused crash)
 * âœ… FIX 2: createCourse handles brochure, level, language fields
 * âœ… FIX 3: createCourse handles SINGLE (instructorId) + MULTIPLE
 *           (subjects JSON array with instructorEmail lookup by email)
 * âœ… FIX 4: updateCourse handles file replacements + price recalculation
 * âœ… FIX 5: After course creation, assignedCourses updated on instructor
 *           user doc so admin panel shows subjects correctly
 * âœ… FIX 6: All exports match course.routes.js imports exactly
 * =========================================================
 */

import mongoose from "mongoose";
import User     from "../../user/models/user.js";
import Course   from "../models/course.model.js";
import Purchase from "../../purchase/models/purchase.model.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const sendError = (res, message = "Something went wrong", code = 500) =>
  res.status(code).json({ success: false, message });

const escapeRegExp = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseBoundedNumber = (value, fallback, { min = 0, max = Infinity } = {}) => {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

const normalizeUploadPath = (filePath) => {
  if (!filePath) return null;
  const normalized = String(filePath).replace(/\\/g, "/");
  const uploadsIndex = normalized.lastIndexOf("/uploads/");
  return uploadsIndex >= 0 ? normalized.slice(uploadsIndex) : normalized;
};

const getFileUrl = (file) => file?.location || normalizeUploadPath(file?.path);

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

const buildPurchaseLookup = (userId, courseId) => ({
  $or: [
    {
      userId: new mongoose.Types.ObjectId(userId),
      courseId: new mongoose.Types.ObjectId(courseId),
    },
    {
      user: new mongoose.Types.ObjectId(userId),
      course: new mongoose.Types.ObjectId(courseId),
    },
  ],
});

const hasActivePurchase = (purchase) => {
  if (!purchase) return false;
  if (purchase.isActive === false) return false;
  if (purchase.status && !["completed", "success", "paid"].includes(purchase.status)) {
    return false;
  }

  const expiry = purchase.expiryDate || purchase.expiresAt;
  return !expiry || new Date(expiry) > new Date();
};

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
  if (!course) return course;
  const plainCourse =
    typeof course.toObject === "function" ? course.toObject() : course;
  const stats = getCourseRuntimeStats(plainCourse);

  return {
    ...plainCourse,
    totalDuration: stats.totalDuration,
    totalDurationSeconds: stats.totalDuration,
    totalHours: Number((stats.totalDuration / 3600).toFixed(2)),
    totalVideos: stats.totalVideos,
  };
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ðŸ“š CREATE COURSE
   POST /api/admin/courses  OR  POST /api/courses
   FormData:
     title, description, courseId, price, discount,
     isFree, isLocked, permissionType, level, language,
     instructorId        â€” SINGLE mode
     subjects            â€” MULTIPLE mode (JSON string array)
     thumbnail, roadmap, brochure  â€” files
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export const createCourse = async (req, res) => {
  try {
    const {
      title, subtitle = "", description, courseId,
      price, discount, finalPrice, isFree,
      permissionType = "SINGLE",
      isLocked       = "true",
      level          = "All Levels",
      language       = "English",
      accessDurationYears = 2,
      totalStudents,
      averageRating,
      totalReviews,
      instructorId,
      subjects,
    } = req.body;

    /* Validation */
    if (!title?.trim() || !description?.trim()) {
      return sendError(res, "Title and description are required", 400);
    }
    if (!req.user?._id) return sendError(res, "Unauthorized", 401);

    /* Pricing */
    const parsedPrice    = Number(price)    || 0;
    const parsedDiscount = Math.min(Number(discount) || 0, 100);
    const isFreeBool     = isFree === "true" || isFree === true;
    const computedFinal  = isFreeBool
      ? 0
      : Number(finalPrice) ||
        Math.max(parsedPrice - (parsedPrice * parsedDiscount) / 100, 0);
    const detailLists = {};

    for (const field of COURSE_DETAIL_LIST_FIELDS) {
      const parsed = parseStringList(req.body[field], field);
      if (parsed.error) return sendError(res, parsed.error, 400);
      if (!parsed.skip) detailLists[field] = filterLegacyRequirements(field, parsed.value);
    }

    /* File URLs â€” S3 (location) or local (path) */
    const thumbnailUrl = getFileUrl(req.files?.thumbnail?.[0]);
    const roadmapUrl   = getFileUrl(req.files?.roadmap?.[0]);
    const brochureUrl  = getFileUrl(req.files?.brochure?.[0]);

    /* Build assignedInstructors array */
    let assignedInstructors = [];
    let sections = [];
    const normalizedType    = (permissionType || "SINGLE").toUpperCase();

    if (normalizedType === "SINGLE" && instructorId) {
      if (!isValidId(instructorId)) {
        return sendError(res, "Invalid instructorId", 400);
      }
      const inst = await User.findOne({ _id: instructorId, role: "instructor" }).lean();
      if (!inst) return sendError(res, "Instructor not found", 404);
      if (!inst.isInstructorActive) {
        return sendError(res, "Instructor is inactive â€” activate first", 400);
      }

      const sectionId = new mongoose.Types.ObjectId();
      sections.push({
        _id: sectionId,
        title: "Full Course",
        description: `Instructor-led content for ${title.trim()}`,
        assignedInstructor: new mongoose.Types.ObjectId(instructorId),
        order: 0,
        videos: [],
      });

      assignedInstructors.push({
        instructor: new mongoose.Types.ObjectId(instructorId),
        moduleName: null,
        sectionId,
        isActive:   true,
        assignedAt: new Date(),
        assignedBy: req.user._id,
      });
    }

    const rawAssignments = subjects || req.body.assignments;

    if (normalizedType === "MULTIPLE" && rawAssignments) {
      let parsedSubjects = [];
      try {
        parsedSubjects = typeof rawAssignments === "string"
          ? JSON.parse(rawAssignments)
          : rawAssignments;
      } catch {
        return sendError(res, "Invalid subjects format â€” must be JSON array", 400);
      }

      for (const s of parsedSubjects) {
        const subjectName = String(s.subjectName || s.moduleName || s.title || "").trim();
        const instructorEmail = String(s.instructorEmail || s.email || "").trim();
        if (!instructorEmail || !subjectName) continue;

        const inst = await User.findOne({
          email: instructorEmail.toLowerCase(),
          role:  "instructor",
        }).lean();

        if (!inst) {
          return sendError(res,
            `Instructor ${instructorEmail} not found or not an instructor`, 400);
        }
        if (!inst.isInstructorActive) {
          return sendError(res,
            `Instructor ${instructorEmail} is inactive â€” activate first`, 400);
        }

        const sectionId = new mongoose.Types.ObjectId();
        sections.push({
          _id: sectionId,
          title: subjectName,
          description: `Instructor-led module for ${title.trim()}`,
          assignedInstructor: new mongoose.Types.ObjectId(inst._id),
          order: sections.length,
          videos: [],
        });

        assignedInstructors.push({
          instructor: new mongoose.Types.ObjectId(inst._id),
          moduleName: subjectName,
          sectionId,
          isActive:   true,
          assignedAt: new Date(),
          assignedBy: req.user._id,
        });
      }
    }

    /* Create */
    const course = await Course.create({
      title:              title.trim(),
      subtitle:           String(subtitle || "").trim(),
      description:        description.trim(),
      courseId:           courseId || `CRS-${Date.now()}`,
      originalPrice:      parsedPrice,
      discountPercentage: parsedDiscount,
      finalPrice:         computedFinal,
      isFree:             isFreeBool,
      permissionType:     normalizedType,
      isLocked:           isLocked === "true" || isLocked === true,
      accessDurationYears: 2,
      level,
      language,
      totalStudents:      parseBoundedNumber(totalStudents, 0, { min: 0 }),
      averageRating:      parseBoundedNumber(averageRating, 0, {
        min: 0,
        max: 5,
      }),
      totalReviews:       parseBoundedNumber(totalReviews, 0, { min: 0 }),
      thumbnail:          thumbnailUrl,
      roadmap:            roadmapUrl,
      brochure:           brochureUrl,
      ...detailLists,
      assignedInstructors,
      sections,
      createdBy:          req.user._id,
      status:             "approved",
      isPublished:        true,
    });

    /* Update assignedCourses on each instructor user doc
       â†’ fixes "No subjects assigned" in admin instructor panel */
    for (const a of assignedInstructors) {
      await User.findByIdAndUpdate(
        a.instructor,
        {
          $addToSet: {
            assignedCourses: course._id,
            subjects: a.moduleName || course.title,
          },
        }
      );
    }

    const populated = await Course.findById(course._id)
      .populate("assignedInstructors.instructor", "name email isInstructorActive")
      .lean();

    return res.status(201).json({
      success: true,
      message: "Course created successfully",
      data:    withCourseRuntimeStats(populated),
    });

  } catch (error) {
    console.error("âŒ createCourse Error:", error.message);
    return sendError(res, error.message || "Failed to create course");
  }
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   âœï¸ UPDATE COURSE
   PUT /api/admin/courses/admin/update/:id
   Handles text fields + optional file replacements
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export const updateCourse = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return sendError(res, "Invalid course ID", 400);

    const course = await Course.findOne({ _id: id, isDeleted: false });
    if (!course) return sendError(res, "Course not found", 404);

    const {
      title, subtitle, description, level, language, accessDurationYears,
      originalPrice, discountPercentage, isFree, isLocked,
      totalStudents, averageRating, totalReviews,
    } = req.body;

    const update = {};

    if (title?.trim())       update.title       = title.trim();
    if (subtitle !== undefined) update.subtitle = String(subtitle || "").trim();
    if (description?.trim()) update.description = description.trim();
    if (level)               update.level       = level;
    if (language)            update.language    = language;
    if (accessDurationYears !== undefined) {
      update.accessDurationYears = 2;
    }

    if (isLocked !== undefined) {
      update.isLocked = isLocked === "true" || isLocked === true;
    }

    if (totalStudents !== undefined) {
      update.totalStudents = parseBoundedNumber(totalStudents, 0, { min: 0 });
    }
    if (averageRating !== undefined) {
      update.averageRating = parseBoundedNumber(averageRating, 0, {
        min: 0,
        max: 5,
      });
    }
    if (totalReviews !== undefined) {
      update.totalReviews = parseBoundedNumber(totalReviews, 0, { min: 0 });
    }

    for (const field of COURSE_DETAIL_LIST_FIELDS) {
      const parsed = parseStringList(req.body[field], field);
      if (parsed.error) return sendError(res, parsed.error, 400);
      if (!parsed.skip) update[field] = filterLegacyRequirements(field, parsed.value);
    }

    /* Recalculate pricing if any price field changed */
    const newPrice    = originalPrice      !== undefined ? Number(originalPrice)      : course.originalPrice;
    const newDiscount = discountPercentage  !== undefined
      ? Math.min(Number(discountPercentage), 100)
      : course.discountPercentage;
    const newIsFree   = isFree !== undefined
      ? (isFree === "true" || isFree === true)
      : course.isFree;

    if (originalPrice !== undefined || discountPercentage !== undefined || isFree !== undefined) {
      update.originalPrice      = newPrice;
      update.discountPercentage = newDiscount;
      update.isFree             = newIsFree;
      update.finalPrice         = newIsFree
        ? 0
        : Math.max(newPrice - (newPrice * newDiscount) / 100, 0);
    }

    /* File replacements â€” only update if new file provided */
    if (req.files?.thumbnail?.[0]) {
      update.thumbnail = getFileUrl(req.files.thumbnail[0]);
    }
    if (req.files?.roadmap?.[0]) {
      update.roadmap = getFileUrl(req.files.roadmap[0]);
    }
    if (req.files?.brochure?.[0]) {
      update.brochure = getFileUrl(req.files.brochure[0]);
    }

    const updated = await Course.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true }
    ).populate("assignedInstructors.instructor", "name email isInstructorActive");

    return res.json({
      success: true,
      message: "Course updated successfully",
      data:    withCourseRuntimeStats(updated),
    });

  } catch (error) {
    console.error("âŒ updateCourse Error:", error.message);
    return sendError(res, "Failed to update course");
  }
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   â­ RATE COURSE
   POST /api/courses/:id/rating
   Body: { rating: 1..5 }
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export const rateCourse = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const { id } = req.params;
    const rating = Number(req.body.rating);

    if (!userId) return sendError(res, "Unauthorized", 401);
    if (!isValidId(id)) return sendError(res, "Invalid course ID", 400);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return sendError(res, "Rating must be between 1 and 5", 400);
    }

    const purchase = await Purchase.findOne(buildPurchaseLookup(userId, id)).lean();
    if (!hasActivePurchase(purchase)) {
      return sendError(res, "Purchase this course before rating it", 403);
    }

    const course = await Course.findOne({ _id: id, isDeleted: false });
    if (!course) return sendError(res, "Course not found", 404);

    const ratings = Array.isArray(course.ratings) ? course.ratings : [];
    const userKey = String(userId);
    const existingRating = ratings.find(
      (item) => String(item.user) === userKey
    );
    const currentReviews = Math.max(Number(course.totalReviews) || 0, ratings.length);
    const currentAverage = Number(course.averageRating) || 0;

    let nextReviews = currentReviews;
    let nextAverage = currentAverage;

    if (existingRating) {
      nextAverage =
        nextReviews > 0
          ? (currentAverage * nextReviews - Number(existingRating.rating || 0) + rating) /
            nextReviews
          : rating;
      existingRating.rating = rating;
      existingRating.updatedAt = new Date();
    } else {
      nextReviews = currentReviews + 1;
      nextAverage =
        nextReviews > 0
          ? (currentAverage * currentReviews + rating) / nextReviews
          : rating;
      ratings.push({
        user: userId,
        rating,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    course.ratings = ratings;
    course.totalReviews = nextReviews;
    course.averageRating = Math.max(0, Math.min(5, Number(nextAverage.toFixed(2))));
    await course.save();

    return res.json({
      success: true,
      message: "Rating saved successfully",
      data: {
        courseId: String(course._id),
        averageRating: course.averageRating,
        totalReviews: course.totalReviews,
        userRating: rating,
      },
    });
  } catch (error) {
    console.error("âŒ rateCourse Error:", error.message);
    return sendError(res, "Failed to save rating");
  }
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ðŸ‘‘ ASSIGN INSTRUCTOR TO COURSE
   PUT /api/courses/admin/assign/:courseId
   Body: { instructorId }
   âœ… This export was missing â€” now added back
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export const assignInstructor = async (req, res) => {
  try {
    const { courseId }    = req.params;
    const { instructorId, moduleName } = req.body;

    if (!isValidId(courseId))    return sendError(res, "Invalid course ID", 400);
    if (!isValidId(instructorId)) return sendError(res, "Invalid instructor ID", 400);

    const [course, instructor] = await Promise.all([
      Course.findOne({ _id: courseId, isDeleted: false }),
      User.findOne({ _id: instructorId, role: "instructor" }).lean(),
    ]);

    if (!course)      return sendError(res, "Course not found", 404);
    if (!instructor)  return sendError(res, "Instructor not found", 404);
    if (!instructor.isInstructorActive) {
      return sendError(res, "Instructor is inactive â€” activate first", 400);
    }

    const alreadyAssigned = course.assignedInstructors?.some(
      (a) => a.instructor?.toString() === instructorId
    );

    if (alreadyAssigned) {
      /* Reactivate existing assignment */
      await Course.updateOne(
        { _id: courseId, "assignedInstructors.instructor": new mongoose.Types.ObjectId(instructorId) },
        {
          $set: {
            "assignedInstructors.$.isActive":   true,
            "assignedInstructors.$.moduleName": moduleName || null,
            "assignedInstructors.$.assignedBy": req.user?._id,
            "assignedInstructors.$.assignedAt": new Date(),
          },
        }
      );
    } else {
      await Course.updateOne(
        { _id: courseId },
        {
          $push: {
            assignedInstructors: {
              instructor: new mongoose.Types.ObjectId(instructorId),
              moduleName: moduleName || null,
              isActive:   true,
              assignedAt: new Date(),
              assignedBy: req.user?._id,
            },
          },
        }
      );
    }

    /* Track on instructor user doc */
    await User.findByIdAndUpdate(instructorId, {
      $addToSet: {
        assignedCourses: new mongoose.Types.ObjectId(courseId),
        subjects:        moduleName || course.title,
      },
    });

    const updated = await Course.findById(courseId)
      .populate("assignedInstructors.instructor", "name email isInstructorActive")
      .lean();

    return res.json({
      success: true,
      message: "Instructor assigned successfully",
      data:    withCourseRuntimeStats(updated),
    });

  } catch (error) {
    console.error("âŒ assignInstructor Error:", error.message);
    return sendError(res, "Failed to assign instructor");
  }
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ðŸŒ GET COURSES (PUBLIC)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export const getCourses = async (req, res) => {
  try {
    const {
      search = "",
      scope = "course",
      type = "all",
      level,
      language,
      tag,
      page = 1,
      limit = 12,
    } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const normalizedType = String(type).trim().toLowerCase();
    const normalizedScope = String(scope || "course").trim().toLowerCase();
    const levelFromType = {
      beginner: "Beginner",
      intermediate: "Intermediate",
      advanced: "Advanced",
      professional: "Professional",
      "all-levels": "All Levels",
    };

    const query = { isDeleted: false, isPublished: true };

    if (search) {
      const searchRegex = { $regex: search, $options: "i" };
      const searchFieldsByScope = {
        course: ["title", "subtitle", "description", "tags"],
        section: ["sections.title", "sections.moduleName"],
        chapter: [
          "sections.videos.title",
          "sections.projects.title",
          "sections.virtualInternships.title",
          "sections.interviews.title",
        ],
      };
      const fields = searchFieldsByScope[normalizedScope] || searchFieldsByScope.course;
      query.$or = fields.map((field) => ({ [field]: searchRegex }));
    }
    if (normalizedType === "free") query.finalPrice = 0;
    if (normalizedType === "paid") query.finalPrice = { $gt: 0 };
    if (level && level !== "all") {
      query.level = level;
    } else if (levelFromType[normalizedType]) {
      query.level = levelFromType[normalizedType];
    }
    if (language && String(language).toLowerCase() !== "all") {
      query.language = {
        $regex: `^${escapeRegExp(String(language).trim())}$`,
        $options: "i",
      };
    }
    if (tag && !["all", "allcourses", "all-courses"].includes(String(tag).toLowerCase())) {
      query.tags = {
        $elemMatch: {
          $regex: `^${escapeRegExp(String(tag).trim())}$`,
          $options: "i",
        },
      };
    }

    const [courses, total] = await Promise.all([
      Course.find(query)
        .populate("assignedInstructors.instructor", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Course.countDocuments(query),
    ]);

    return res.json({
      success: true,
      data:    courses.map(withCourseRuntimeStats),
      pagination: {
        total,
        page:       Number(page),
        limit:      Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("âŒ getCourses Error:", error.message);
    return sendError(res, "Failed to fetch courses");
  }
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ðŸ“š GET ALL COURSES (ADMIN)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export const getCourseLanguages = async (_req, res) => {
  try {
    const languages = await Course.distinct("language", {
      isDeleted: false,
      isPublished: true,
    });

    const cleanLanguages = languages
      .map((language) => String(language || "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    return res.json({
      success: true,
      data: cleanLanguages,
    });
  } catch (error) {
    console.error("getCourseLanguages Error:", error.message);
    return sendError(res, "Failed to fetch course languages");
  }
};

export const getCourseTags = async (_req, res) => {
  try {
    const tags = await Course.distinct("tags", {
      isDeleted: false,
      isPublished: true,
    });

    const cleanTags = tags
      .map((tag) => String(tag || "").trim())
      .filter(Boolean)
      .reduce((unique, tag) => {
        const key = tag.toLowerCase();
        if (!unique.lookup.has(key)) {
          unique.lookup.add(key);
          unique.items.push(tag);
        }
        return unique;
      }, { lookup: new Set(), items: [] })
      .items
      .sort((a, b) => a.localeCompare(b));

    return res.json({
      success: true,
      data: cleanTags,
    });
  } catch (error) {
    console.error("getCourseTags Error:", error.message);
    return sendError(res, "Failed to fetch course tags");
  }
};

export const getAllCourses = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 10, status, type } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const query = { isDeleted: false };
    if (status && status !== "all") query.status = status;
    if (type   === "free") query.finalPrice = 0;
    if (type   === "paid") query.finalPrice = { $gt: 0 };
    if (search) {
      query.$or = [
        { title:       { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const [courses, total] = await Promise.all([
      Course.find(query)
        .populate("assignedInstructors.instructor", "name email isInstructorActive")
        .populate("createdBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Course.countDocuments(query),
    ]);

    return res.json({
      success:    true,
      data:       courses.map(withCourseRuntimeStats),
      total,
      page:       Number(page),
      totalPages: Math.ceil(total / Number(limit)),
    });
  } catch (error) {
    console.error("âŒ getAllCourses Error:", error.message);
    return sendError(res, "Failed to fetch courses");
  }
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ðŸ” GET COURSE BY ID
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export const getCourseById = async (req, res) => {
  try {
    const id = req.params.id || req.params.courseId;
    if (!isValidId(id)) return sendError(res, "Invalid course ID", 400);

    const course = await Course.findOne({ _id: id, isDeleted: false })
      .populate("assignedInstructors.instructor", "name email bio avatar isInstructorActive")
      .populate("sections.assignedInstructor", "name email")
      .populate("createdBy", "name email");

    if (!course) return sendError(res, "Course not found", 404);

    return res.json({ success: true, data: withCourseRuntimeStats(course) });
  } catch (error) {
    console.error("âŒ getCourseById Error:", error.message);
    return sendError(res, "Failed to fetch course");
  }
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ðŸ—‘ï¸ DELETE COURSE (SOFT DELETE)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export const deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return sendError(res, "Invalid course ID", 400);

    const course = await Course.findByIdAndUpdate(
      id,
      { $set: { isDeleted: true, isPublished: false } },
      { new: true }
    );

    if (!course) return sendError(res, "Course not found", 404);
    return res.json({ success: true, message: "Course deleted successfully" });
  } catch (error) {
    console.error("âŒ deleteCourse Error:", error.message);
    return sendError(res, "Failed to delete course");
  }
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   âœ… UPDATE COURSE STATUS
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export const updateCourseStatus = async (req, res) => {
  try {
    const { id }     = req.params;
    const { status } = req.body;

    const allowed = ["draft", "pending", "approved", "rejected", "published", "archived"];
    if (!allowed.includes(status)) {
      return sendError(res, `Status must be one of: ${allowed.join(", ")}`, 400);
    }
    if (!isValidId(id)) return sendError(res, "Invalid course ID", 400);

    const course = await Course.findByIdAndUpdate(
      id,
      {
        $set: {
          status,
          isPublished: status === "approved" || status === "published",
        },
      },
      { new: true }
    );

    if (!course) return sendError(res, "Course not found", 404);
    return res.json({ success: true, message: `Course ${status}`, data: course });
  } catch (error) {
    console.error("âŒ updateCourseStatus Error:", error.message);
    return sendError(res, "Failed to update course status");
  }
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   âž• ADD SECTION
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export const addSection = async (req, res) => {
  try {
    const { courseId }           = req.params;
    const { title, description } = req.body;

    if (!isValidId(courseId)) return sendError(res, "Invalid courseId", 400);
    if (!title?.trim())       return sendError(res, "Section title required", 400);

    const course = await Course.findOne({ _id: courseId, isDeleted: false });
    if (!course) return sendError(res, "Course not found", 404);

    course.sections.push({
      _id:         new mongoose.Types.ObjectId(),
      title:       title.trim(),
      description: description?.trim() || "",
      videos:      [],
      order:       course.sections.length,
    });

    await course.save();
    return res.status(201).json({
      success: true,
      message: "Section added",
      data: withCourseRuntimeStats(course),
    });
  } catch (error) {
    console.error("âŒ addSection Error:", error.message);
    return sendError(res, "Failed to add section");
  }
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ðŸŽ¬ ADD VIDEO
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export const addVideo = async (req, res) => {
  try {
    const { courseId, sectionId } = req.params;
    const {
      title,
      description,
      duration,
      isFreePreview,
      fileName,
      fileType,
      fileSize,
      s3Key,
    } = req.body;

    if (!isValidId(courseId) || !isValidId(sectionId)) {
      return sendError(res, "Invalid courseId or sectionId", 400);
    }
    if (!title?.trim()) return sendError(res, "Video title required", 400);

    const course  = await Course.findOne({ _id: courseId, isDeleted: false });
    const section = course?.sections.id(sectionId);
    if (!section) return sendError(res, "Section not found", 404);

    const videoUrl = req.file?.location || req.file?.path || req.body.videoUrl || null;

    section.videos.push({
      title:         title.trim(),
      description:   description?.trim() || "",
      videoUrl,
      s3Key:          s3Key || null,
      originalFileName: fileName || "",
      mimeType:      fileType || "",
      fileSize:      parseBoundedNumber(fileSize, 0, { min: 0 }),
      duration:      parseBoundedNumber(duration, 0, { min: 0 }),
      isFreePreview: isFreePreview === "true" || isFreePreview === true,
      uploadedBy:    req.user?._id || null,
      uploadStatus:  "pending",
      order:         section.videos.length,
    });

    await course.save();
    return res.status(201).json({
      success: true,
      message: "Video added",
      data: withCourseRuntimeStats(course),
    });
  } catch (error) {
    console.error("âŒ addVideo Error:", error.message);
    return sendError(res, "Failed to add video");
  }
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ðŸ—‘ï¸ DELETE VIDEO
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export const deleteVideo = async (req, res) => {
  try {
    const { courseId, sectionId, videoId } = req.params;

    if (!isValidId(courseId) || !isValidId(sectionId) || !isValidId(videoId)) {
      return sendError(res, "Invalid IDs", 400);
    }

    const course  = await Course.findOne({ _id: courseId, isDeleted: false });
    const section = course?.sections.id(sectionId);
    if (!section) return sendError(res, "Section not found", 404);

    section.videos = section.videos.filter((v) => v._id.toString() !== videoId);
    await course.save();

    return res.json({ success: true, message: "Video deleted" });
  } catch (error) {
    console.error("âŒ deleteVideo Error:", error.message);
    return sendError(res, "Failed to delete video");
  }
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ðŸ“¤ SUBMIT FOR APPROVAL
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export const submitForApproval = async (req, res) => {
  try {
    const id = req.params.id || req.params.courseId;
    if (!isValidId(id)) return sendError(res, "Invalid course ID", 400);

    const course = await Course.findOne({ _id: id, isDeleted: false });
    if (!course) return sendError(res, "Course not found", 404);

    if (course.status !== "draft") {
      return sendError(res, `Cannot submit â€” status is '${course.status}'`, 400);
    }

    await Course.findByIdAndUpdate(id, { $set: { status: "pending" } });
    return res.json({ success: true, message: "Course submitted for review" });
  } catch (error) {
    console.error("âŒ submitForApproval Error:", error.message);
    return sendError(res, "Failed to submit course");
  }
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ðŸŽ“ GET INSTRUCTOR COURSES
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export const getInstructorCourses = async (req, res) => {
  try {
    const userId = req.user?._id;
    const oid    = new mongoose.Types.ObjectId(userId);

    const courses = await Course.find({
      isDeleted: false,
      $or: [
        { createdBy: oid },
        {
          assignedInstructors: {
            $elemMatch: { instructor: oid, isActive: true },
          },
        },
      ],
    })
      .populate("assignedInstructors.instructor", "name email")
      .lean();

    return res.json({ success: true, data: courses });
  } catch (error) {
    console.error("âŒ getInstructorCourses Error:", error.message);
    return sendError(res, "Failed to fetch courses");
  }
};

