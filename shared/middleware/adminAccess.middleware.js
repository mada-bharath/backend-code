import {
  ADMIN_PERMISSION_KEY_SET,
  hasAdminPageAccess,
  hasAnyAdminPageAccess,
} from "../constants/adminPages.js";

const deny = (res, message = "Admin page access denied") =>
  res.status(403).json({ success: false, message });

export const requireAdminPage = (pageKey) => (req, res, next) => {
  if (!ADMIN_PERMISSION_KEY_SET.has(pageKey)) {
    return deny(res, "Invalid admin page permission");
  }

  if (!req.user || req.user.role !== "admin") {
    return deny(res, "Admin access required");
  }

  if (!hasAdminPageAccess(req.user, pageKey)) {
    return deny(res, "You do not have access to this admin page");
  }

  return next();
};

export const requireAnyAdminPage = (pageKeys = []) => (req, res, next) => {
  const validKeys = pageKeys.filter((pageKey) => ADMIN_PERMISSION_KEY_SET.has(pageKey));

  if (validKeys.length === 0) {
    return deny(res, "Invalid admin page permission");
  }

  if (!req.user || req.user.role !== "admin") {
    return deny(res, "Admin access required");
  }

  if (!hasAnyAdminPageAccess(req.user, validKeys)) {
    return deny(res, "You do not have access to this admin page");
  }

  return next();
};
