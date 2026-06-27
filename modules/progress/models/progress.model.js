import mongoose from "mongoose";

const progressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    video: {
      type: String,
      required: true,
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    completed: {
      type: Boolean,
      default: false,
      index: true,
    },
    watchedTime: {
      type: Number,
      default: 0,
      min: 0,
    },
    duration: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

progressSchema.index({ user: 1, course: 1, video: 1 }, { unique: true });
progressSchema.index({ user: 1, course: 1, updatedAt: -1 });

const Progress = mongoose.models.Progress || mongoose.model("Progress", progressSchema);

export default Progress;
