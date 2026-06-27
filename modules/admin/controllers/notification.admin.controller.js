/**
 * =========================================================
 * 🔔 NOTIFICATION ADMIN CONTROLLER (FINAL PRODUCTION 🔥)
 * =========================================================
 * Path: backend/modules/admin/controllers/notification.admin.controller.js
 * =========================================================
 */

import User         from "../../user/models/user.js";
import Notification from "../../notification/models/notification.model.js";

/* ── Socket.IO helpers ──────────────────────────────────────
   Imported from core/socket.js — NOT from core/server.js.
   Importing from server.js caused a circular dependency:
     app.js → notification.admin.controller → server.js → app.js
──────────────────────────────────────────────────────────── */
import { emitToAll } from "../../../core/socket.js";

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

/* ═══════════════════════════════════════
   📡 SEND BROADCAST NOTIFICATION
   POST /api/notifications/send-all
   POST /api/admin/notification
   POST /api/admin/notify-all
═══════════════════════════════════════ */
export const sendNotificationToAll = async (req, res) => {
  try {
    const {
      title   = "Admin Notification",
      message,
      target  = "all",
      type    = "admin",
    } = req.body;

    /* ── Validation ── */
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

    /* ── Build user filter ── */
    let userFilter = {};
    if (normalizedTarget === "USERS")       userFilter = { role: "student"    };
    if (normalizedTarget === "INSTRUCTORS") userFilter = { role: "instructor" };

    const users = await User.find(userFilter).select("_id").lean();

    if (!users.length) {
      return sendError(res, "No users found matching the target audience", 404);
    }

    const allowedTypes = ["info", "warning", "success", "admin", "system", "course", "promotion"];
    const safeType     = allowedTypes.includes(type) ? type : "admin";

    /* ── Bulk insert ── */
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
      console.warn("⚠️ [NotificationAdmin] Socket emit failed:", socketErr.message);
    }

    console.log(`✅ [NotificationAdmin] Broadcast "${title}" → ${users.length} users (${normalizedTarget})`);

    return res.status(201).json({
      success:     true,
      message:     "Notification broadcast successful",
      deliveredTo: users.length,
      target:      normalizedTarget,
      type:        safeType,
    });

  } catch (error) {
    console.error("❌ [NotificationAdmin] sendNotificationToAll Error:", error.message);
    return sendError(res, "Failed to send notifications");
  }
};