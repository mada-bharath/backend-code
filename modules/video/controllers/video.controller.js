import Course from "../../course/models/course.model.js";
import Purchase from "../../purchase/models/purchase.model.js";
import Video from "../models/video.model.js";

/**
 * =========================================================
 * 🎥 VIDEO CONTROLLER (FINAL PRODUCTION 🔥)
 * =========================================================
 *
 * ✅ Secure video access (free vs paid)
 * ✅ Upload system
 * ✅ Status control
 * ✅ Video management
 * ✅ Analytics tracking
 */

/* =========================================================
   🎥 GET VIDEO BY ID (EXISTING - NO CHANGE)
========================================================= */
export const getVideoById = async (req, res) => {
  try {
    const { courseId, sectionId, videoId } = req.params;
    const userId = req.user?._id;

    if (!courseId || !sectionId || !videoId) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameters",
      });
    }

    const course = await Course.findById(courseId);

    if (!course || course.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    const section = course.sections.id(sectionId);
    if (!section) {
      return res.status(404).json({
        success: false,
        message: "Section not found",
      });
    }

    const video = section.videos.id(videoId);
    if (!video) {
      return res.status(404).json({
        success: false,
        message: "Video not found",
      });
    }

    // FREE VIDEO
    if (video.isPreview) {
      return res.json({ success: true, data: video });
    }

    // ADMIN
    if (req.user?.role === "admin") {
      return res.json({ success: true, data: video });
    }

    // INSTRUCTOR
    const isInstructor =
      course.instructor?.toString() === userId?.toString() ||
      course.instructors?.some(
        (id) => id.toString() === userId?.toString()
      ) ||
      course.assignedInstructors?.some(
        (id) => id.toString() === userId?.toString()
      );

    if (isInstructor) {
      return res.json({ success: true, data: video });
    }

    // PURCHASE CHECK
    const purchase = await Purchase.findOne({
      user: userId,
      course: courseId,
      status: "completed",
    });

    if (!purchase) {
      return res.status(403).json({
        success: false,
        message: "Purchase required",
      });
    }

    return res.json({ success: true, data: video });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* =========================================================
   📚 GET COURSE VIDEOS (EXISTING - NO CHANGE)
========================================================= */
export const getCourseVideos = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user?._id;

    const course = await Course.findById(courseId);

    let userPurchased = false;

    if (req.user?.role !== "admin") {
      const purchase = await Purchase.findOne({
        user: userId,
        course: courseId,
        status: "completed",
      });

      userPurchased = !!purchase;
    }

    const sections = course.sections.map((section) => ({
      ...section.toObject(),
      videos: section.videos.map((video) => {
        if (video.isPreview) return video;
        if (req.user?.role === "admin") return video;

        const isInstructor =
          course.instructor?.toString() === userId?.toString();

        if (isInstructor) return video;
        if (userPurchased) return video;

        return {
          ...video.toObject(),
          videoUrl: null,
        };
      }),
    }));

    res.json({ success: true, data: sections });

  } catch (error) {
    res.status(500).json({ success: false });
  }
};

/* =========================================================
   📤 UPLOAD VIDEO (NEW 🔥)
========================================================= */
export const uploadVideo = async (req, res) => {
  try {
    const {
      courseId,
      sectionId,
      title,
      videoUrl,
    } = req.body;

    const video = await Video.create({
      courseId,
      sectionId,
      title,
      videoUrl,
      uploadedBy: req.user._id,
      status: "processing",
    });

    res.json({
      success: true,
      message: "Video uploaded",
      data: video,
    });

  } catch (error) {
    res.status(500).json({ success: false });
  }
};

/* =========================================================
   🔄 UPDATE VIDEO STATUS (ADMIN)
========================================================= */
export const updateVideoStatus = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { status } = req.body;

    const video = await Video.findByIdAndUpdate(
      videoId,
      { status },
      { new: true }
    );

    res.json({ success: true, data: video });

  } catch (error) {
    res.status(500).json({ success: false });
  }
};

/* =========================================================
   ❌ DELETE VIDEO
========================================================= */
export const deleteVideo = async (req, res) => {
  try {
    const { videoId } = req.params;

    await Video.findByIdAndDelete(videoId);

    res.json({
      success: true,
      message: "Video deleted",
    });

  } catch (error) {
    res.status(500).json({ success: false });
  }
};

/* =========================================================
   ✏️ UPDATE VIDEO DETAILS
========================================================= */
export const updateVideoDetails = async (req, res) => {
  try {
    const { videoId } = req.params;

    const video = await Video.findByIdAndUpdate(
      videoId,
      req.body,
      { new: true }
    );

    res.json({ success: true, data: video });

  } catch (error) {
    res.status(500).json({ success: false });
  }
};

/* =========================================================
   📊 INCREMENT VIEWS
========================================================= */
export const incrementViews = async (req, res) => {
  try {
    const { videoId } = req.params;

    await Video.findByIdAndUpdate(videoId, {
      $inc: { views: 1 },
    });

    res.json({ success: true });

  } catch (error) {
    res.status(500).json({ success: false });
  }
};