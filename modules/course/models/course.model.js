/**
 * Course Model
 * Path: modules/course/models/course.model.js
 *
 * This schema supports:
 * - Admin and instructor-created courses
 * - SINGLE and MULTIPLE instructor assignment modes
 * - Section-based video curriculum
 * - Direct S3 uploads with stored s3Key for reliable deletion
 * - Soft delete through isDeleted
 */

import mongoose from "mongoose";

const { Schema, model, models } = mongoose;
const ObjectId = Schema.Types.ObjectId;

const COURSE_STATUSES = [
  "draft",
  "pending",
  "approved",
  "rejected",
  "published",
  "archived",
];

const PERMISSION_TYPES = ["SINGLE", "MULTIPLE"];
const COURSE_LEVELS = ["Beginner", "Intermediate", "Advanced", "Professional", "All Levels"];
const VIDEO_STATUSES = ["pending", "processing", "approved", "rejected"];

const buildCourseId = () =>
  `CRS-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const idToString = (value) => {
  if (!value) return null;
  if (value._id) return value._id.toString();
  return value.toString();
};

const sameId = (left, right) =>
  Boolean(left && right && idToString(left) === idToString(right));

const findSectionById = (sections, sectionId) => {
  if (!sections || !sectionId) return null;
  if (typeof sections.id === "function") return sections.id(sectionId);
  return sections.find((section) => sameId(section._id, sectionId)) || null;
};

const stringArrayField = {
  type: [
    {
      type: String,
      trim: true,
    },
  ],
  default: [],
};

const videoSchema = new Schema(
  {
    contentId: {
      type: ObjectId,
      ref: "Video",
      default: null,
    },
    title: {
      type: String,
      required: [true, "Video title is required"],
      trim: true,
      maxlength: [200, "Video title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    videoUrl: {
      type: String,
      default: null,
      trim: true,
    },
    hlsUrl: {
      type: String,
      default: null,
      trim: true,
    },
    s3Key: {
      type: String,
      default: null,
      trim: true,
    },
    originalFileName: {
      type: String,
      default: "",
      trim: true,
    },
    mimeType: {
      type: String,
      default: "",
      trim: true,
    },
    fileSize: {
      type: Number,
      default: 0,
      min: 0,
    },
    duration: {
      type: Number,
      default: 0,
      min: 0,
    },
    isFreePreview: {
      type: Boolean,
      default: false,
    },
    uploadStatus: {
      type: String,
      enum: VIDEO_STATUSES,
      default: "pending",
    },
    uploadedBy: {
      type: ObjectId,
      ref: "User",
      default: null,
    },
    order: {
      type: Number,
      default: 0,
      min: 0,
    },
    thumbnail: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { timestamps: true }
);

const contentResourceSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, "Resource title is required"],
      trim: true,
      maxlength: [200, "Resource title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    category: {
      type: String,
      enum: ["pdf", "ppt", "assignment", "case-study", "document", "project", "other", ""],
      default: "",
      trim: true,
    },
    fileUrl: {
      type: String,
      default: null,
      trim: true,
    },
    s3Key: {
      type: String,
      default: null,
      trim: true,
    },
    originalFileName: {
      type: String,
      default: "",
      trim: true,
    },
    mimeType: {
      type: String,
      default: "",
      trim: true,
    },
    fileSize: {
      type: Number,
      default: 0,
      min: 0,
    },
    duration: {
      type: Number,
      default: 0,
      min: 0,
    },
    uploadStatus: {
      type: String,
      enum: VIDEO_STATUSES,
      default: "approved",
    },
    uploadedBy: {
      type: ObjectId,
      ref: "User",
      default: null,
    },
    order: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

const sectionSchema = new Schema(
  {
    contentId: {
      type: ObjectId,
      ref: "Video",
      default: null,
    },
    title: {
      type: String,
      required: [true, "Section title is required"],
      trim: true,
      maxlength: [200, "Section title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    assignedInstructor: {
      type: ObjectId,
      ref: "User",
      default: null,
    },
    order: {
      type: Number,
      default: 0,
      min: 0,
    },
    videos: {
      type: [videoSchema],
      default: [],
    },
    studyMaterials: {
      type: [contentResourceSchema],
      default: [],
    },
    projects: {
      type: [contentResourceSchema],
      default: [],
    },
    virtualInternships: {
      type: [contentResourceSchema],
      default: [],
    },
    interviews: {
      type: [contentResourceSchema],
      default: [],
    },
    projectCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

const assignedInstructorSchema = new Schema(
  {
    instructor: {
      type: ObjectId,
      ref: "User",
      required: true,
    },
    moduleName: {
      type: String,
      default: null,
      trim: true,
    },
    sectionId: {
      type: ObjectId,
      default: null,
    },
    contentId: {
      type: ObjectId,
      ref: "Video",
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    assignedAt: {
      type: Date,
      default: Date.now,
    },
    assignedBy: {
      type: ObjectId,
      ref: "User",
      default: null,
    },
  },
  { _id: false }
);

const courseRatingSchema = new Schema(
  {
    user: {
      type: ObjectId,
      ref: "User",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const courseSchema = new Schema(
  {
    courseId: {
      type: String,
      unique: true,
      trim: true,
      default: buildCourseId,
    },
    title: {
      type: String,
      required: [true, "Course title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    subtitle: {
      type: String,
      default: "",
      trim: true,
      maxlength: [240, "Subtitle cannot exceed 240 characters"],
    },
    description: {
      type: String,
      required: [true, "Course description is required"],
      trim: true,
    },
    thumbnail: {
      type: String,
      default: null,
      trim: true,
    },
    roadmap: {
      type: String,
      default: null,
      trim: true,
    },
    brochure: {
      type: String,
      default: null,
      trim: true,
    },
    originalPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    discountPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    finalPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    isFree: {
      type: Boolean,
      default: false,
    },
    isLocked: {
      type: Boolean,
      default: true,
    },
    accessDurationYears: {
      type: Number,
      default: 2,
      min: 1,
      max: 10,
    },
    permissionType: {
      type: String,
      enum: PERMISSION_TYPES,
      default: "SINGLE",
    },
    status: {
      type: String,
      enum: COURSE_STATUSES,
      default: "draft",
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    level: {
      type: String,
      enum: COURSE_LEVELS,
      default: "All Levels",
    },
    assignedInstructors: {
      type: [assignedInstructorSchema],
      default: [],
    },
    sections: {
      type: [sectionSchema],
      default: [],
    },
    totalStudents: {
      type: Number,
      default: 0,
      min: 0,
    },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    totalReviews: {
      type: Number,
      default: 0,
      min: 0,
    },
    ratings: {
      type: [courseRatingSchema],
      default: [],
    },
    createdBy: {
      type: ObjectId,
      ref: "User",
      default: null,
    },
    language: {
      type: String,
      default: "English",
      trim: true,
    },
    tags: stringArrayField,
    contentHighlights: stringArrayField,
    materialIncludes: stringArrayField,
    requirements: stringArrayField,
    outcomes: stringArrayField,
    audience: stringArrayField,
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

courseSchema.virtual("totalVideos").get(function () {
  return (
    this.sections?.reduce(
      (total, section) => total + (section.videos?.length || 0),
      0
    ) || 0
  );
});

courseSchema.virtual("totalDuration").get(function () {
  return (
    this.sections?.reduce(
      (courseTotal, section) =>
        courseTotal +
        (section.videos?.reduce(
          (sectionTotal, video) => sectionTotal + (video.duration || 0),
          0
        ) || 0),
      0
    ) || 0
  );
});

courseSchema.virtual("totalProjects").get(function () {
  return (
    this.sections?.reduce(
      (total, section) =>
        total + ((section.projects?.length || 0) || section.projectCount || 0),
      0
    ) || 0
  );
});

courseSchema.virtual("totalStudyMaterials").get(function () {
  return (
    this.sections?.reduce(
      (total, section) => total + (section.studyMaterials?.length || 0),
      0
    ) || 0
  );
});

courseSchema.virtual("totalVirtualInternships").get(function () {
  return (
    this.sections?.reduce(
      (total, section) => total + (section.virtualInternships?.length || 0),
      0
    ) || 0
  );
});

courseSchema.virtual("totalInterviews").get(function () {
  return (
    this.sections?.reduce(
      (total, section) => total + (section.interviews?.length || 0),
      0
    ) || 0
  );
});

courseSchema.virtual("activeInstructorsCount").get(function () {
  return (
    this.assignedInstructors?.filter((assignment) => assignment.isActive)
      .length || 0
  );
});

courseSchema.pre("validate", function () {
  if (this.courseId) this.courseId = this.courseId.trim();
  if (this.permissionType) {
    this.permissionType = String(this.permissionType).trim().toUpperCase();
  }
  this.accessDurationYears = 2;
  if (this.isFree) this.finalPrice = 0;
});

courseSchema.index({ title: "text", description: "text" });
courseSchema.index({ tags: 1 });
courseSchema.index({ status: 1, isDeleted: 1 });
courseSchema.index({ isPublished: 1, isDeleted: 1 });
courseSchema.index({ createdBy: 1, isDeleted: 1, createdAt: -1 });
courseSchema.index({
  "assignedInstructors.instructor": 1,
  isDeleted: 1,
  status: 1,
});

courseSchema.methods.canInstructorUpload = function (instructorId, sectionId) {
  const instructor = idToString(instructorId);
  const targetSection = sectionId ? idToString(sectionId) : null;

  if (!instructor) {
    return { allowed: false, reason: "Instructor ID is required" };
  }

  if (sameId(this.createdBy, instructor)) {
    return { allowed: true };
  }

  const activeAssignments = (this.assignedInstructors || []).filter(
    (assignment) => sameId(assignment.instructor, instructor) && assignment.isActive
  );

  if (activeAssignments.length === 0) {
    return { allowed: false, reason: "Not assigned to this course" };
  }

  if (this.permissionType === "SINGLE") {
    return { allowed: true };
  }

  if (!targetSection) {
    return {
      allowed: false,
      reason: "Section ID is required for this course",
    };
  }

  const section = findSectionById(this.sections, targetSection);
  if (!section) {
    return { allowed: false, reason: "Section not found" };
  }

  const sectionAssignment =
    activeAssignments.find((assignment) =>
      sameId(assignment.sectionId, targetSection)
    ) || activeAssignments.find((assignment) => !assignment.sectionId);

  if (!sectionAssignment) {
    return {
      allowed: false,
      reason: "You are not assigned to this section",
    };
  }

  if (
    sectionAssignment.sectionId &&
    !sameId(sectionAssignment.sectionId, targetSection)
  ) {
    return {
      allowed: false,
      reason: `You are only allowed to upload to section: ${
        sectionAssignment.moduleName || "your assigned module"
      }`,
    };
  }

  if (
    !sectionAssignment.sectionId &&
    section.assignedInstructor &&
    !sameId(section.assignedInstructor, instructor)
  ) {
    return {
      allowed: false,
      reason: "You are not assigned to this section",
    };
  }

  return { allowed: true };
};

const Course = models.Course || model("Course", courseSchema);

export default Course;
