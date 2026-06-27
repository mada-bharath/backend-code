import Notification from "../models/notification.model.js";

/* =========================================================
   📡 SEND NOTIFICATION TO ALL USERS
========================================================= */
export const sendNotificationToAllUsers = async (
  users,
  title,
  message,
  type = "admin"
) => {
  try {
    if (!users || users.length === 0) {
      throw new Error("No users provided");
    }

    if (!title || !message) {
      throw new Error("Title and message are required");
    }

    const now = new Date();

    const notifications = users.map((user) => ({
      user: user._id,
      title: title.trim(),
      message: message.trim(),
      type,
      isRead: false,
      createdAt: now,
      updatedAt: now,
    }));

    // 🔥 BULK INSERT (FAST)
    await Notification.insertMany(notifications);

    return {
      success: true,
      total: notifications.length,
    };

  } catch (err) {
    console.error("❌ SEND NOTIFICATION ERROR:", err);
    throw err;
  }
};

/* =========================================================
   📋 GET USER NOTIFICATIONS (PAGINATED)
========================================================= */
export const getUserNotificationsService = async (
  userId,
  page = 1,
  limit = 10
) => {
  try {
    const skip = (page - 1) * limit;

    const notifications = await Notification.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Notification.countDocuments({ user: userId });

    return {
      data: notifications,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };

  } catch (err) {
    console.error("❌ GET NOTIFICATIONS ERROR:", err);
    throw err;
  }
};

/* =========================================================
   🔢 GET UNREAD COUNT
========================================================= */
export const getUnreadCountService = async (userId) => {
  try {
    const count = await Notification.countDocuments({
      user: userId,
      isRead: false,
    });

    return count;

  } catch (err) {
    console.error("❌ UNREAD COUNT ERROR:", err);
    throw err;
  }
};

/* =========================================================
   ✅ MARK SINGLE AS READ
========================================================= */
export const markAsReadService = async (notificationId) => {
  try {
    const updated = await Notification.findByIdAndUpdate(
      notificationId,
      { isRead: true },
      { new: true }
    );

    if (!updated) {
      throw new Error("Notification not found");
    }

    return updated;

  } catch (err) {
    console.error("❌ MARK AS READ ERROR:", err);
    throw err;
  }
};

/* =========================================================
   ✅ MARK ALL AS READ (USER)
========================================================= */
export const markAllAsReadService = async (userId) => {
  try {
    await Notification.updateMany(
      { user: userId, isRead: false },
      { isRead: true }
    );

    return {
      success: true,
      message: "All notifications marked as read",
    };

  } catch (err) {
    console.error("❌ MARK ALL READ ERROR:", err);
    throw err;
  }
};

/* =========================================================
   ❌ DELETE NOTIFICATION
========================================================= */
export const deleteNotificationService = async (notificationId) => {
  try {
    const deleted = await Notification.findByIdAndDelete(notificationId);

    if (!deleted) {
      throw new Error("Notification not found");
    }

    return {
      success: true,
      message: "Notification deleted",
    };

  } catch (err) {
    console.error("❌ DELETE NOTIFICATION ERROR:", err);
    throw err;
  }
};