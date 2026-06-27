import mongoose from "mongoose";

const { Schema, model, models } = mongoose;
const ObjectId = Schema.Types.ObjectId;

const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
const DISCUSSION_TYPES = ["post", "poll", "link"];

const stringArrayField = {
  type: [
    {
      type: String,
      trim: true,
      maxlength: 40,
    },
  ],
  default: [],
};

const commentSchema = new Schema(
  {
    author: {
      type: ObjectId,
      ref: "User",
      required: true,
    },
    body: {
      type: String,
      required: [true, "Comment is required"],
      trim: true,
      maxlength: [1000, "Comment cannot exceed 1000 characters"],
    },
    tags: stringArrayField,
    emojis: stringArrayField,
  },
  { timestamps: true }
);

const pollOptionSchema = new Schema(
  {
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: [120, "Poll option cannot exceed 120 characters"],
    },
    votes: {
      type: [
        {
          type: ObjectId,
          ref: "User",
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

const linkItemSchema = new Schema(
  {
    platform: {
      type: String,
      default: "",
      trim: true,
      maxlength: [60, "Platform name cannot exceed 60 characters"],
    },
    label: {
      type: String,
      default: "",
      trim: true,
      maxlength: [120, "Link label cannot exceed 120 characters"],
    },
    url: {
      type: String,
      required: true,
      trim: true,
      maxlength: [500, "Link URL cannot exceed 500 characters"],
    },
  },
  { _id: false }
);

const attachmentSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["image", "file"],
      default: "image",
    },
    url: {
      type: String,
      required: true,
      trim: true,
      maxlength: [500, "Attachment URL cannot exceed 500 characters"],
    },
    name: {
      type: String,
      default: "",
      trim: true,
      maxlength: [160, "Attachment name cannot exceed 160 characters"],
    },
    mimeType: {
      type: String,
      default: "",
      trim: true,
      maxlength: [120, "Attachment MIME type cannot exceed 120 characters"],
    },
    size: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

const discussionSchema = new Schema(
  {
    type: {
      type: String,
      enum: DISCUSSION_TYPES,
      default: "post",
      index: true,
    },
    author: {
      type: ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    course: {
      type: ObjectId,
      ref: "Course",
      default: null,
      index: true,
    },
    courseName: {
      type: String,
      default: "",
      trim: true,
      maxlength: [160, "Course name cannot exceed 160 characters"],
    },
    title: {
      type: String,
      default: "",
      trim: true,
      maxlength: [180, "Discussion title cannot exceed 180 characters"],
    },
    content: {
      type: String,
      default: "",
      trim: true,
      maxlength: [2000, "Discussion content cannot exceed 2000 characters"],
    },
    tags: stringArrayField,
    emojis: stringArrayField,
    linkUrl: {
      type: String,
      default: "",
      trim: true,
      maxlength: [500, "Link URL cannot exceed 500 characters"],
    },
    linkLabel: {
      type: String,
      default: "",
      trim: true,
      maxlength: [120, "Link label cannot exceed 120 characters"],
    },
    links: {
      type: [linkItemSchema],
      default: [],
      validate: {
        validator(value) {
          return !Array.isArray(value) || value.length <= 5;
        },
        message: "A discussion can include up to 5 links",
      },
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
      validate: {
        validator(value) {
          return !Array.isArray(value) || value.length <= 4;
        },
        message: "A discussion can include up to 4 attachments",
      },
    },
    poll: {
      question: {
        type: String,
        default: "",
        trim: true,
        maxlength: [240, "Poll question cannot exceed 240 characters"],
      },
      options: {
        type: [pollOptionSchema],
        default: [],
      },
    },
    comments: {
      type: [commentSchema],
      default: [],
    },
    likes: {
      type: [
        {
          type: ObjectId,
          ref: "User",
        },
      ],
      default: [],
    },
    shareCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isPinned: {
      type: Boolean,
      default: false,
      index: true,
    },
    pinnedAt: {
      type: Date,
      default: null,
    },
    pinnedBy: {
      type: ObjectId,
      ref: "User",
      default: null,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + TEN_DAYS_MS),
    },
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

discussionSchema.virtual("commentCount").get(function () {
  return this.comments?.length || 0;
});

discussionSchema.virtual("likeCount").get(function () {
  return this.likes?.length || 0;
});

discussionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
discussionSchema.index({ isPinned: -1, createdAt: -1 });
discussionSchema.index({ tags: 1, createdAt: -1 });

discussionSchema.pre("validate", function () {
  if (
    this.type === "post" &&
    !this.title?.trim() &&
    !this.content?.trim() &&
    (!Array.isArray(this.links) || this.links.length === 0) &&
    (!Array.isArray(this.attachments) || this.attachments.length === 0)
  ) {
    this.invalidate("content", "Discussion title or content is required");
  }

  if (this.type === "poll") {
    if (!this.poll?.question?.trim()) {
      this.invalidate("poll.question", "Poll question is required");
    }
    if (!Array.isArray(this.poll?.options) || this.poll.options.length < 2) {
      this.invalidate("poll.options", "Poll needs at least two options");
    }
  }

  if (
    this.type === "link" &&
    !this.linkUrl?.trim() &&
    (!Array.isArray(this.links) || this.links.length === 0)
  ) {
    this.invalidate("links", "At least one link is required");
  }
});

const Discussion = models.Discussion || model("Discussion", discussionSchema);

export { TEN_DAYS_MS };
export default Discussion;
