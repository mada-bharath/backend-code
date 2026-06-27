/**
 * =========================================================
 * 🔔 NOTIFICATION CONTROLLER (FINAL ENTERPRISE PRODUCTION 🔥)
 * =========================================================
 * Path: backend/modules/notification/controllers/notification.controller.js
 * =========================================================
 */

import Notification from "../models/notification.model.js";
import User         from "../../user/models/user.js";
import { logger }   from "../../../infrastructure/logging/logger.js";

/* ── Socket.IO helpers ──────────────────────────────────────
   Imported from core/socket.js — NOT from core/server.js.
   Importing from server.js caused a circular dependency:
     app.js → notification.controller → server.js → app.js
   core/socket.js is a standalone module with no imports from
   app.js or server.js, so the circle is broken.
──────────────────────────────────────────────────────────── */
import { emitToUser, emitToAll } from "../../../core/socket.js";

/* ─────────────────────────────────────────
   🧠 HELPERS
───────────────────────────────────────── */
const sendError = (res, message = "Something went wrong", code = 500) =>
  res.status(code).json({ success: false, message });

const normalizeTarget = (raw = "all") => {
  const map = {
    all:         "ALL",
    students:    "USERS",
    users:       "USERS",
    instructors: "INSTRUCTORS",
    ALL:         "ALL",
    USERS:       "USERS",
    INSTRUCTORS: "INSTRUCTORS",
  };
  return map[raw] || "ALL";
};

const ALLOWED_TYPES = [
  "info", "warning", "success", "admin",
  "system", "course", "promotion",
];

/* ═══════════════════════════════════════
   📡 SEND BROADCAST NOTIFICATION (ADMIN)
   POST /api/notifications/send-all
═══════════════════════════════════════ */
export const sendNotificationToAll = async (req, res) => {
  try {
    const {
      title   = "Admin Notification",
      message,
      target  = "all",
      type    = "admin",
    } = req.body;

    if (!message || !message.trim()) {
      return sendError(res, "Message is required", 400);
    }
    if (message.trim().length < 5) {
      return sendError(res, "Message must be at least 5 characters", 400);
    }
    if (!title || !title.trim() || title.trim().length < 3) {
      return sendError(res, "Title must be at least 3 characters", 400);
    }

    const normalizedTarget = normalizeTarget(target);

    let userFilter = {};
    if (normalizedTarget === "USERS")       userFilter = { role: "student"    };
    if (normalizedTarget === "INSTRUCTORS") userFilter = { role: "instructor" };

    const users = await User.find(userFilter).select("_id").lean();

    if (!users.length) {
      return sendError(res, "No users found matching the target audience", 404);
    }

    const safeType = ALLOWED_TYPES.includes(type) ? type : "admin";

    const notificationDocs = users.map((u) => ({
      user:      u._id,
      title:     title.trim(),
      message:   message.trim(),
      type:      safeType,
      target:    normalizedTarget,
      isRead:    false,
      isPublic:  true,
      createdBy: req.user?.id || null,
    }));

    await Notification.insertMany(notificationDocs, { ordered: false });

    /* ── Real-time broadcast via core/socket.js ── */
    try {
      emitToAll("new_notification", {
        title:     title.trim(),
        message:   message.trim(),
        type:      safeType,
        target:    normalizedTarget,
        createdAt: new Date().toISOString(),
      });
    } catch (socketErr) {
      logger.warn(`⚠️ [Notification] Socket emit failed: ${socketErr.message}`);
    }

    logger.info(`✅ [Notification] Broadcast "${title}" → ${users.length} users [${normalizedTarget}]`);

    return res.status(201).json({
      success:     true,
      message:     "Notification broadcast successful",
      deliveredTo: users.length,
      target:      normalizedTarget,
      type:        safeType,
    });

  } catch (error) {
    logger.error(`❌ [Notification] sendNotificationToAll Error: ${error.message}`);
    return sendError(res, "Failed to send notifications");
  }
};

/* ═══════════════════════════════════════
   📋 GET MY NOTIFICATIONS (PAGINATED)
   GET /api/notifications/my?page=1&limit=10
═══════════════════════════════════════ */
export const getMyNotifications = async (req, res) => {
  try {
    const userId          = req.user?._id;
    const page            = Math.max(1, parseInt(req.query.page)  || 1);
    const limit           = Math.min(50, parseInt(req.query.limit) || 10);
    const skip            = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      Notification.find({ user: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments({ user: userId }),
    ]);

    return res.json({
      success: true,
      data:    notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error(`❌ [Notification] getMyNotifications: ${error.message}`);
    return sendError(res, "Failed to fetch notifications");
  }
};

/* ═══════════════════════════════════════
   🔢 GET UNREAD COUNT (BELL BADGE)
   GET /api/notifications/unread-count
═══════════════════════════════════════ */
export const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      user:   req.user?._id,
      isRead: false,
    });

    return res.json({ success: true, count });
  } catch (error) {
    logger.error(`❌ [Notification] getUnreadCount: ${error.message}`);
    return sendError(res, "Failed to fetch unread count");
  }
};

/* ═══════════════════════════════════════
   ✅ MARK SINGLE NOTIFICATION AS READ
   PATCH /api/notifications/:id/read
═══════════════════════════════════════ */
export const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user?._id },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return sendError(res, "Notification not found", 404);
    }

    return res.json({ success: true, data: notification });
  } catch (error) {
    logger.error(`❌ [Notification] markAsRead: ${error.message}`);
    return sendError(res, "Failed to mark as read");
  }
};

/* ═══════════════════════════════════════
   ✅ MARK ALL NOTIFICATIONS AS READ
   PATCH /api/notifications/read-all
═══════════════════════════════════════ */
export const markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user?._id, isRead: false },
      { isRead: true }
    );

    return res.json({ success: true, message: "All notifications marked as read" });
  } catch (error) {
    logger.error(`❌ [Notification] markAllAsRead: ${error.message}`);
    return sendError(res, "Failed to mark all as read");
  }
};

/* ═══════════════════════════════════════
   🗑️ DELETE NOTIFICATION
   DELETE /api/notifications/:id
═══════════════════════════════════════ */
export const deleteNotification = async (req, res) => {
  try {
    const userId   = req.user?._id;
    const userRole = req.user?.role;

    /* Admin can delete any notification; user can only delete their own */
    const filter = userRole === "admin"
      ? { _id: req.params.id }
      : { _id: req.params.id, user: userId };

    const notification = await Notification.findOneAndDelete(filter);

    if (!notification) {
      return sendError(res, "Notification not found or not authorized", 404);
    }

    return res.json({ success: true, message: "Notification deleted" });
  } catch (error) {
    logger.error(`❌ [Notification] deleteNotification: ${error.message}`);
    return sendError(res, "Failed to delete notification");
  }
};