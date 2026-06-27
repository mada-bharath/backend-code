import mongoose from "mongoose";

/**
 * =========================================================
 * 🔔 NOTIFICATION MODEL (FINAL PRODUCTION 🔥)
 * =========================================================
 * ✅ User-specific + Broadcast notifications
 * ✅ Supports admin, system, course alerts
 * ✅ Public notifications for non-logged users
 * ✅ Scalable for real-time + push + email
 * =========================================================
 */

const notificationSchema = new mongoose.Schema(
  {
    /* =========================================================
       👤 RECEIVER (OPTIONAL → NULL = BROADCAST)
    ========================================================= */
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, // null means broadcast
      index: true,
    },

    /* =========================================================
       🏷 TITLE
    ========================================================= */
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
    },

    /* =========================================================
       💬 MESSAGE
    ========================================================= */
    message: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
    },

    /* =========================================================
       🔖 TYPE
    ========================================================= */
    type: {
      type: String,
      enum: ["info", "warning", "success", "system", "course", "promotion", "admin"],
      default: "admin",
    },

    /* =========================================================
       🎯 TARGET AUDIENCE
    ========================================================= */
    target: {
      type: String,
      enum: ["ALL", "USERS", "INSTRUCTORS"],
      default: "ALL",
    },

    /* =========================================================
       🌍 PUBLIC VISIBILITY
    ========================================================= */
    isPublic: {
      type: Boolean,
      default: true, // visible to non-logged users
    },

    /* =========================================================
       👁 READ STATUS (ONLY FOR USER-SPECIFIC)
    ========================================================= */
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },

    /* =========================================================
       👨‍💼 CREATED BY ADMIN
    ========================================================= */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    /* =========================================================
       🔗 OPTIONAL LINK (FUTURE USE)
    ========================================================= */
    link: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

/* =========================================================
   ⚡ INDEXES (PERFORMANCE)
========================================================= */

// user notifications (fast fetch)
notificationSchema.index({ user: 1, createdAt: -1 });

// unread notifications
notificationSchema.index({ user: 1, isRead: 1 });

// broadcast filtering
notificationSchema.index({ target: 1, createdAt: -1 });

/* =========================================================
   🧠 INSTANCE METHOD
========================================================= */
notificationSchema.methods.markAsRead = function () {
  this.isRead = true;
  return this.save();
};

/* =========================================================
   🚀 EXPORT
========================================================= */
const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
