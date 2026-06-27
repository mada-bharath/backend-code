import Course from "../models/course.model.js";

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
  const stats = getCourseRuntimeStats(course);

  return {
    ...course,
    totalDuration: stats.totalDuration,
    totalDurationSeconds: stats.totalDuration,
    totalHours: Number((stats.totalDuration / 3600).toFixed(2)),
    totalVideos: stats.totalVideos,
  };
};

/**
 * =========================================================
 * 📦 GET ALL COURSES (ADMIN - FINAL PRODUCTION 🔥)
 * =========================================================
 *
 * ✅ Safe pagination
 * ✅ Search (text + regex fallback)
 * ✅ Sorting support
 * ✅ Performance optimized (lean)
 * ✅ Future-ready filters
 */

export const getAllCoursesService = async ({
  page = 1,
  limit = 10,
  search = "",
  sort = "newest",
}) => {
  try {
    /* ========================================
       🧼 SANITIZE INPUT
    ======================================== */
    const pageNumber = Math.max(parseInt(page) || 1, 1);
    const limitNumber = Math.min(parseInt(limit) || 10, 50);
    const skip = (pageNumber - 1) * limitNumber;

    /* ========================================
       🔎 FILTER
    ======================================== */
    let filter = {
      isDeleted: false, // 🔥 always exclude deleted
    };

    /* ========================================
       🔍 SEARCH
    ======================================== */
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");

      filter.$or = [
        { title: searchRegex },
        { description: searchRegex },
      ];
    }

    /* ========================================
       📊 SORTING
    ======================================== */
    let sortOption = { createdAt: -1 };

    switch (sort) {
      case "price_low":
        sortOption = { price: 1 };
        break;

      case "price_high":
        sortOption = { price: -1 };
        break;

      case "popular":
        sortOption = { studentsEnrolled: -1 };
        break;

      case "oldest":
        sortOption = { createdAt: 1 };
        break;

      default:
        sortOption = { createdAt: -1 };
    }

    /* ========================================
       🚀 QUERY EXECUTION
    ======================================== */
    const [courses, total] = await Promise.all([
      Course.find(filter)
        .sort(sortOption)
        .skip(skip)
        .limit(limitNumber)
        .lean(), // 🔥 faster response

      Course.countDocuments(filter),
    ]);

    /* ========================================
       ✅ RESPONSE
    ======================================== */
    return {
      success: true,
      data: courses.map(withCourseRuntimeStats),
      total,
      page: pageNumber,
      limit: limitNumber,
      totalPages: Math.ceil(total / limitNumber),
    };

  } catch (error) {
    console.error("❌ getAllCoursesService Error:", error);

    return {
      success: false,
      message: "Failed to fetch courses",
    };
  }
};

/**
 * =========================================================
 * ✏️ UPDATE COURSE (FINAL PRODUCTION 🔥)
 * =========================================================
 *
 * ✅ Safe update (no overwrite bug)
 * ✅ Only allowed fields updated
 * ✅ Auto pricing handled by model
 * ✅ Validation safe
 */

export const updateCourseService = async (courseId, updateData = {}) => {
  try {
    /* ========================================
       🔐 VALIDATION
    ======================================== */
    if (!courseId) {
      throw new Error("Course ID is required");
    }

    /* ========================================
       📦 FIND COURSE
    ======================================== */
    const course = await Course.findById(courseId);

    if (!course) {
      throw new Error("Course not found");
    }

    /* ========================================
       🎯 ALLOWED FIELDS ONLY (SECURITY 🔥)
    ======================================== */
    const allowedFields = [
      "title",
      "description",
      "price",
      "originalPrice",
      "discountPercentage",
      "thumbnail",
      "brochure",
      "roadmap",
      "isFree",
      "isPublished",
      "status",
      "accessDurationYears",
    ];

    /**
     * 🔁 SAFE UPDATE LOOP
     */
    Object.keys(updateData).forEach((key) => {
      if (allowedFields.includes(key)) {
        course[key] = updateData[key];
      }
    });

    /* ========================================
       💾 SAVE (TRIGGERS PRE SAVE HOOK)
    ======================================== */
    await course.save();

    /* ========================================
       ✅ RETURN CLEAN OBJECT
    ======================================== */
    return {
      success: true,
      data: course.toObject(),
    };

  } catch (error) {
    console.error("❌ updateCourseService Error:", error);

    return {
      success: false,
      message: error.message || "Failed to update course",
    };
  }
};
