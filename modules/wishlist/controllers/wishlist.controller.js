import mongoose from "mongoose";
import Wishlist, { buildShareSlug } from "../models/wishlist.model.js";
import Course from "../../course/models/course.model.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const sendError = (res, message = "Something went wrong", code = 500) =>
  res.status(code).json({ success: false, message });

const sendOk = (res, data, message = "OK", code = 200, extra = {}) =>
  res.status(code).json({ success: true, message, data, ...extra });

const normalizeText = (value) => String(value || "").trim();

const normalizeStringList = (value, maxItems = 8) => {
  if (!value) return [];
  const list = Array.isArray(value)
    ? value
    : String(value)
        .split(",")
        .map((item) => item.trim());

  return [...new Set(list.map((item) => String(item).trim()).filter(Boolean))]
    .slice(0, maxItems);
};

const getCoursePrice = (course = {}) => {
  if (course.isFree) return 0;
  return Number(course.finalPrice ?? course.discountPrice ?? course.price ?? 0);
};

const getOriginalPrice = (course = {}) =>
  Number(course.originalPrice ?? course.price ?? getCoursePrice(course));

const hasDiscount = (course = {}) => {
  const originalPrice = getOriginalPrice(course);
  const finalPrice = getCoursePrice(course);
  return !course.isFree && originalPrice > finalPrice;
};

const normalizeCourseTags = (course = {}) =>
  Array.isArray(course.tags) ? course.tags.map((tag) => String(tag).toLowerCase()) : [];

const buildInstructorSummary = (course = {}) => {
  const assignments = Array.isArray(course.assignedInstructors)
    ? course.assignedInstructors.filter((assignment) => assignment?.instructor)
    : [];

  if (assignments.length === 0) {
    return course.createdBy?.name || course.createdBy?.email || "Instructor";
  }

  return assignments
    .map((assignment) => {
      const instructor = assignment.instructor;
      const name = instructor?.name || instructor?.email || "Instructor";
      return assignment.moduleName ? `${assignment.moduleName}: ${name}` : name;
    })
    .join(", ");
};

const buildNudges = (course = {}) => {
  const nudges = [];
  const originalPrice = getOriginalPrice(course);
  const finalPrice = getCoursePrice(course);

  if (hasDiscount(course)) {
    nudges.push({
      type: "price_drop",
      label: "Price dropped",
      detail: `Save Rs ${Math.max(originalPrice - finalPrice, 0)}`,
    });
  }

  if (Number(course.totalStudents) > 0) {
    nudges.push({
      type: "social_proof",
      label: `${course.totalStudents}+ students enrolled`,
      detail: "Based on current course enrollment",
    });
  }

  if (Number(course.averageRating) >= 4.5) {
    nudges.push({
      type: "rating",
      label: "Top rated",
      detail: `${Number(course.averageRating).toFixed(1)} average rating`,
    });
  }

  return nudges;
};

const mapWishlistItem = (item) => {
  const course = item.course || {};
  return {
    _id: item._id,
    course,
    courseId: course._id || item.course,
    note: item.note || "",
    personalTags: item.personalTags || [],
    visibility: item.visibility,
    publicSlug: item.publicSlug,
    notifyOnPriceDrop: item.notifyOnPriceDrop,
    notifyOnCourseUpdate: item.notifyOnCourseUpdate,
    addedAt: item.addedAt,
    instructorName: buildInstructorSummary(course),
    originalPrice: getOriginalPrice(course),
    finalPrice: getCoursePrice(course),
    hasDiscount: hasDiscount(course),
    nudges: buildNudges(course),
  };
};

const populateWishlistQuery = (query) =>
  query.populate({
    path: "course",
    match: { isDeleted: false },
    populate: [
      { path: "assignedInstructors.instructor", select: "name email" },
      { path: "createdBy", select: "name email" },
    ],
  });

const sortWishlistItems = (items, sort = "recent") => {
  const sorted = [...items];

  switch (sort) {
    case "price-low":
    case "price_asc":
      return sorted.sort((a, b) => a.finalPrice - b.finalPrice);
    case "price-high":
    case "price_desc":
      return sorted.sort((a, b) => b.finalPrice - a.finalPrice);
    case "popularity":
      return sorted.sort(
        (a, b) => Number(b.course?.totalStudents || 0) - Number(a.course?.totalStudents || 0)
      );
    case "rating":
      return sorted.sort(
        (a, b) => Number(b.course?.averageRating || 0) - Number(a.course?.averageRating || 0)
      );
    default:
      return sorted.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
  }
};

const filterWishlistItems = (items, { category, minPrice, maxPrice }) => {
  const cleanCategory = normalizeText(category).toLowerCase();
  const min = minPrice !== undefined && minPrice !== "" ? Number(minPrice) : null;
  const max = maxPrice !== undefined && maxPrice !== "" ? Number(maxPrice) : null;

  return items.filter((item) => {
    const course = item.course || {};
    const price = item.finalPrice;

    if (cleanCategory) {
      const tags = normalizeCourseTags(course);
      const categoryText = String(course.category || "").toLowerCase();
      if (!tags.includes(cleanCategory) && categoryText !== cleanCategory) return false;
    }

    if (Number.isFinite(min) && price < min) return false;
    if (Number.isFinite(max) && price > max) return false;

    return true;
  });
};

const getExistingWishlistSettings = async (userId) => {
  const existing = await Wishlist.findOne({ user: userId, publicSlug: { $exists: true, $ne: "" } })
    .select("publicSlug visibility")
    .lean();
  return {
    publicSlug: existing?.publicSlug || buildShareSlug(),
    visibility: existing?.visibility || "private",
  };
};

export const getWishlist = async (req, res) => {
  try {
    const { sort = "recent", category, minPrice, maxPrice } = req.query;

    const rawItems = await populateWishlistQuery(
      Wishlist.find({ user: req.user._id }).sort({ addedAt: -1 })
    ).lean();

    const mappedItems = rawItems
      .filter((item) => item.course)
      .map(mapWishlistItem);

    const filteredItems = filterWishlistItems(mappedItems, {
      category,
      minPrice,
      maxPrice,
    });

    const items = sortWishlistItems(filteredItems, sort);
    const settings = mappedItems[0]
      ? {
          visibility: mappedItems[0].visibility,
          publicSlug: mappedItems[0].publicSlug,
        }
      : {
          visibility: "private",
          publicSlug: null,
        };

    return sendOk(res, { items, total: items.length, settings }, "Wishlist fetched");
  } catch (error) {
    console.error("[Wishlist] getWishlist:", error.message);
    return sendError(res, "Failed to fetch wishlist");
  }
};

export const addToWishlist = async (req, res) => {
  try {
    const courseId = req.params.courseId || req.body.courseId;
    if (!isValidId(courseId)) return sendError(res, "Invalid course ID", 400);

    const course = await Course.findOne({
      _id: courseId,
      isDeleted: false,
      isPublished: true,
    }).select("_id");

    if (!course) return sendError(res, "Course not found", 404);

    const settings = await getExistingWishlistSettings(req.user._id);
    const item = await Wishlist.findOneAndUpdate(
      { user: req.user._id, course: courseId },
      {
        $setOnInsert: {
          user: req.user._id,
          course: courseId,
          addedAt: new Date(),
          publicSlug: settings.publicSlug,
          visibility: settings.visibility,
        },
        $set: {
          note: normalizeText(req.body.note),
          personalTags: normalizeStringList(req.body.personalTags),
          notifyOnPriceDrop:
            req.body.notifyOnPriceDrop === undefined
              ? true
              : req.body.notifyOnPriceDrop === true || req.body.notifyOnPriceDrop === "true",
          notifyOnCourseUpdate:
            req.body.notifyOnCourseUpdate === undefined
              ? true
              : req.body.notifyOnCourseUpdate === true || req.body.notifyOnCourseUpdate === "true",
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    const populated = await populateWishlistQuery(
      Wishlist.findById(item._id)
    ).lean();

    return sendOk(res, mapWishlistItem(populated), "Course saved to wishlist", 201);
  } catch (error) {
    if (error.code === 11000) {
      return sendError(res, "Course is already in wishlist", 409);
    }
    console.error("[Wishlist] addToWishlist:", error.message);
    return sendError(res, error.message || "Failed to save course");
  }
};

export const removeFromWishlist = async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!isValidId(courseId)) return sendError(res, "Invalid course ID", 400);

    const removed = await Wishlist.findOneAndDelete({
      user: req.user._id,
      course: courseId,
    });

    if (!removed) return sendError(res, "Course was not in wishlist", 404);
    return sendOk(res, { courseId }, "Course removed from wishlist");
  } catch (error) {
    console.error("[Wishlist] removeFromWishlist:", error.message);
    return sendError(res, "Failed to remove course");
  }
};

export const clearWishlist = async (req, res) => {
  try {
    const result = await Wishlist.deleteMany({ user: req.user._id });
    return sendOk(
      res,
      { deletedCount: result.deletedCount || 0 },
      "Wishlist cleared"
    );
  } catch (error) {
    console.error("[Wishlist] clearWishlist:", error.message);
    return sendError(res, "Failed to clear wishlist");
  }
};

export const checkWishlist = async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!isValidId(courseId)) return sendError(res, "Invalid course ID", 400);

    const item = await Wishlist.findOne({ user: req.user._id, course: courseId })
      .select("_id addedAt")
      .lean();

    return sendOk(res, { exists: Boolean(item), item }, "Wishlist status fetched");
  } catch (error) {
    console.error("[Wishlist] checkWishlist:", error.message);
    return sendError(res, "Failed to check wishlist");
  }
};

export const updateWishlistItem = async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!isValidId(courseId)) return sendError(res, "Invalid course ID", 400);

    const update = {};
    if (req.body.note !== undefined) update.note = normalizeText(req.body.note);
    if (req.body.personalTags !== undefined) {
      update.personalTags = normalizeStringList(req.body.personalTags);
    }
    if (req.body.notifyOnPriceDrop !== undefined) {
      update.notifyOnPriceDrop =
        req.body.notifyOnPriceDrop === true || req.body.notifyOnPriceDrop === "true";
    }
    if (req.body.notifyOnCourseUpdate !== undefined) {
      update.notifyOnCourseUpdate =
        req.body.notifyOnCourseUpdate === true ||
        req.body.notifyOnCourseUpdate === "true";
    }

    const item = await Wishlist.findOneAndUpdate(
      { user: req.user._id, course: courseId },
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!item) return sendError(res, "Course was not in wishlist", 404);

    const populated = await populateWishlistQuery(
      Wishlist.findById(item._id)
    ).lean();

    return sendOk(res, mapWishlistItem(populated), "Wishlist item updated");
  } catch (error) {
    console.error("[Wishlist] updateWishlistItem:", error.message);
    return sendError(res, error.message || "Failed to update wishlist item");
  }
};

export const updateWishlistSettings = async (req, res) => {
  try {
    const visibility = req.body.visibility === "public" ? "public" : "private";
    const { publicSlug } = await getExistingWishlistSettings(req.user._id);

    await Wishlist.updateMany(
      { user: req.user._id },
      { $set: { visibility, publicSlug } }
    );

    return sendOk(
      res,
      { visibility, publicSlug },
      visibility === "public" ? "Wishlist is public" : "Wishlist is private"
    );
  } catch (error) {
    console.error("[Wishlist] updateWishlistSettings:", error.message);
    return sendError(res, "Failed to update wishlist settings");
  }
};

export const getPublicWishlist = async (req, res) => {
  try {
    const { slug } = req.params;
    const rawItems = await populateWishlistQuery(
      Wishlist.find({ publicSlug: slug, visibility: "public" }).sort({ addedAt: -1 })
    ).lean();

    const items = rawItems
      .filter((item) => item.course)
      .map(mapWishlistItem);

    return sendOk(res, { items, total: items.length }, "Public wishlist fetched");
  } catch (error) {
    console.error("[Wishlist] getPublicWishlist:", error.message);
    return sendError(res, "Failed to fetch public wishlist");
  }
};

export const bulkAddWishlistToCart = async (req, res) => {
  try {
    const rawItems = await populateWishlistQuery(
      Wishlist.find({ user: req.user._id }).sort({ addedAt: -1 })
    ).lean();

    const items = rawItems
      .filter((item) => item.course)
      .map(mapWishlistItem);

    return sendOk(
      res,
      {
        items,
        courseIds: items.map((item) => item.courseId),
        total: items.length,
      },
      "Wishlist courses are ready for cart"
    );
  } catch (error) {
    console.error("[Wishlist] bulkAddWishlistToCart:", error.message);
    return sendError(res, "Failed to prepare wishlist courses");
  }
};
