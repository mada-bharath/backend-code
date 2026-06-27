import mongoose from "mongoose";

const { Schema, model, models } = mongoose;
const ObjectId = Schema.Types.ObjectId;

const WISHLIST_VISIBILITY = ["private", "public"];

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

const buildShareSlug = () =>
  `wl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const wishlistSchema = new Schema(
  {
    user: {
      type: ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    course: {
      type: ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    note: {
      type: String,
      default: "",
      trim: true,
      maxlength: [500, "Note cannot exceed 500 characters"],
    },
    personalTags: stringArrayField,
    visibility: {
      type: String,
      enum: WISHLIST_VISIBILITY,
      default: "private",
      index: true,
    },
    publicSlug: {
      type: String,
      default: buildShareSlug,
      index: true,
    },
    notifyOnPriceDrop: {
      type: Boolean,
      default: true,
    },
    notifyOnCourseUpdate: {
      type: Boolean,
      default: true,
    },
    addedAt: {
      type: Date,
      default: Date.now,
      index: true,
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

wishlistSchema.index({ user: 1, course: 1 }, { unique: true });
wishlistSchema.index({ publicSlug: 1, visibility: 1, addedAt: -1 });

const Wishlist = models.Wishlist || model("Wishlist", wishlistSchema);

export { WISHLIST_VISIBILITY, buildShareSlug };
export default Wishlist;
