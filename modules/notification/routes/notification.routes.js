/**
 * =========================================================
 * 🔔 NOTIFICATION ROUTES (FINAL ENTERPRISE PRODUCTION 🔥)
 * =========================================================
 * Path: backend/modules/notification/routes/notification.routes.js
 *
 * MERGED FROM:
 * ✅ Your VS Code version → router.put() for markAsRead + markAllAsRead,
 *                           /notify-all endpoint, cleaner structure
 * ✅ Previous version     → router.patch() for markAsRead + markAllAsRead,
 *                           /send-all endpoint, allowRoles guard
 *
 * RESULT:
 * ✅ BOTH PUT and PATCH registered for markAsRead + markAllAsRead
 *    so either frontend call works (backward compatible)
 * ✅ BOTH /send-all and /notify-all endpoints registered
 * ✅ All static routes BEFORE dynamic /:id routes
 *
 * Base URL: /api/notifications
 *
 * ⚠️  ROUTE ORDER IS CRITICAL:
 *   /my           BEFORE  /:id  (prevent "my" treated as notification id)
 *   /unread-count BEFORE  /:id
 *   /read-all     BEFORE  /:id
 *   /send-all     BEFORE  /:id
 *   /notify-all   BEFORE  /:id
 * =========================================================
 */

import express from "express";

const router = express.Router();

import { protect }    from "../../../shared/middleware/auth.middleware.js";
import { allowRoles } from "../../../shared/middleware/role.middleware.js";

import {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  sendNotificationToAll,
} from "../controllers/notification.controller.js";

/* ─────────────────────────────────────────
   🔐 ALL NOTIFICATION ROUTES REQUIRE LOGIN
───────────────────────────────────────── */
router.use(protect);

/* ═══════════════════════════════════════
   STATIC ROUTES — must come BEFORE /:id
   If /:id is first, Express treats
   "my", "unread-count", "read-all",
   "send-all", "notify-all" as IDs.
═══════════════════════════════════════ */

/**
 * 📋 GET MY NOTIFICATIONS (PAGINATED)
 * GET /api/notifications/my?page=1&limit=10
 * Called by: NotificationList.jsx, Notifications.jsx audit log
 */
router.get("/my", getMyNotifications);

/**
 * 🔢 GET UNREAD COUNT (BELL BADGE)
 * GET /api/notifications/unread-count
 * Called by: Navbar bell icon (polls every 60s via RTK Query)
 */
router.get("/unread-count", getUnreadCount);

/**
 * ✅ MARK ALL AS READ
 * PATCH /api/notifications/read-all  ← previous frontend version
 * PUT   /api/notifications/read-all  ← your VS Code frontend version
 * Both registered so either works.
 */
router.patch("/read-all", markAllAsRead);
router.put("/read-all",   markAllAsRead);

/**
 * 📡 SEND BROADCAST (ADMIN ONLY)
 * POST /api/notifications/send-all   ← previous version
 * POST /api/notifications/notify-all ← your VS Code version
 * Both registered so either frontend call works.
 */
router.post(
  "/send-all",
  allowRoles("admin"),
  sendNotificationToAll
);
router.post(
  "/notify-all",
  allowRoles("admin"),
  sendNotificationToAll
);

/* ═══════════════════════════════════════
   DYNAMIC /:id ROUTES — must come AFTER static routes
═══════════════════════════════════════ */

/**
 * ✅ MARK SINGLE NOTIFICATION AS READ
 * PATCH /api/notifications/:id/read  ← previous frontend version
 * PUT   /api/notifications/:id/read  ← your VS Code frontend version
 * Both registered so either works.
 */
router.patch("/:id/read", markAsRead);
router.put("/:id/read",   markAsRead);

/**
 * ❌ DELETE NOTIFICATION
 * DELETE /api/notifications/:id
 * Admin can delete any; user can only delete own.
 */
router.delete("/:id", deleteNotification);

/**
 * 📋 GET MY NOTIFICATIONS (root path)
 * GET /api/notifications
 * Alias for /my — some frontend versions call root path.
 */
router.get("/", getMyNotifications);

export default router;