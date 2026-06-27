import mongoose from "mongoose";
import Progress from "../models/progress.model.js";
import Course from "../../course/models/course.model.js";

const sendError = (res, message = "Something went wrong", code = 500) =>
  res.status(code).json({ success: false, message });

const clampProgress = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
};

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const getCourseVideoIds = (course) =>
  (course.sections || []).flatMap((section) =>
    (section.videos || []).map((video) => video._id.toString())
  );

export const saveProgress = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const { courseId, videoId, progress, watchedTime, duration } = req.body;

    if (!userId) return sendError(res, "Unauthorized", 401);
    if (!courseId || !videoId) {
      return sendError(res, "courseId and videoId are required", 400);
    }
    if (!isValidId(courseId)) return sendError(res, "Invalid courseId", 400);

    const course = await Course.findOne({ _id: courseId, isDeleted: false })
      .select("sections._id sections.videos._id")
      .lean();

    if (!course) return sendError(res, "Course not found", 404);

    const validVideo = getCourseVideoIds(course).includes(String(videoId));
    if (!validVideo) return sendError(res, "Video not found in this course", 404);

    const numericWatchedTime = Number(watchedTime) || 0;
    const numericDuration = Number(duration) || 0;
    const calculatedProgress =
      numericWatchedTime > 0 && numericDuration > 0
        ? (numericWatchedTime / numericDuration) * 100
        : progress;

    const existingProgress = await Progress.findOne({
      user: userId,
      course: courseId,
      video: String(videoId),
    }).lean();

    const incomingProgress = clampProgress(calculatedProgress);
    const highestProgress = Math.max(incomingProgress, Number(existingProgress?.progress) || 0);
    const completed = Boolean(existingProgress?.completed) || highestProgress >= 90;
    const finalProgress = completed ? 100 : highestProgress;

    const data = await Progress.findOneAndUpdate(
      {
        user: userId,
        course: courseId,
        video: String(videoId),
      },
      {
        $set: {
          progress: finalProgress,
          completed,
          watchedTime: Math.max(
            0,
            numericWatchedTime,
            Number(existingProgress?.watchedTime) || 0
          ),
          duration: Math.max(
            0,
            numericDuration,
            Number(existingProgress?.duration) || 0
          ),
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.json({
      success: true,
      message: "Progress saved",
      progress: data,
    });
  } catch (err) {
    console.error("[Progress] saveProgress error:", err.message);
    return sendError(res, "Progress save failed");
  }
};

export const getCourseProgress = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const { courseId } = req.params;

    if (!userId) return sendError(res, "Unauthorized", 401);
    if (!isValidId(courseId)) return sendError(res, "Invalid courseId", 400);

    const [course, progress] = await Promise.all([
      Course.findOne({ _id: courseId, isDeleted: false })
        .select("sections._id sections.videos._id")
        .lean(),
      Progress.find({ user: userId, course: courseId }).sort({ updatedAt: -1 }).lean(),
    ]);

    if (!course) return sendError(res, "Course not found", 404);

    const courseVideoIds = getCourseVideoIds(course);
    const videoSet = new Set(courseVideoIds);
    const courseProgress = progress.filter((item) => videoSet.has(String(item.video)));
    const completedVideos = courseProgress.filter((item) => item.completed).length;
    const percentage = courseVideoIds.length
      ? Math.round((completedVideos / courseVideoIds.length) * 100)
      : 0;
    const progressByVideo = courseProgress.reduce((acc, item) => {
      acc[item.video] = item;
      return acc;
    }, {});

    return res.json({
      success: true,
      data: courseProgress,
      progressByVideo,
      totalVideos: courseVideoIds.length,
      completedVideos,
      percentage,
      lastVideo: courseProgress[0]?.video || null,
    });
  } catch (err) {
    console.error("[Progress] getCourseProgress error:", err.message);
    return sendError(res, "Progress fetch failed");
  }
};
