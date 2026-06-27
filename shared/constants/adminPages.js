export const ADMIN_PAGE_KEYS = {
  DASHBOARD: "dashboard",
  USERS: "users",
  FREE_USERS: "free-users",
  ADMIN_ACCESS: "admin-access",
  INSTRUCTORS: "instructors",
  CREATE_COURSE: "create-course",
  COURSES: "courses",
  DISCUSSION: "discussion",
  COUPONS: "coupons",
  NOTIFICATIONS: "notifications",
};

export const ADMIN_PAGE_PERMISSIONS = [
  {
    key: ADMIN_PAGE_KEYS.DASHBOARD,
    label: "Dashboard",
    path: "/admin/dashboard",
    description: "Stats and course approvals",
  },
  {
    key: ADMIN_PAGE_KEYS.USERS,
    label: "Users",
    path: "/admin/users",
    description: "User roles and student access",
  },
  {
    key: ADMIN_PAGE_KEYS.FREE_USERS,
    label: "Free Users",
    path: "/admin/free-users",
    description: "Complimentary access users",
  },
  {
    key: ADMIN_PAGE_KEYS.ADMIN_ACCESS,
    label: "Admin Access",
    path: "/admin/admin-access",
    description: "Admin page permissions",
  },
  {
    key: ADMIN_PAGE_KEYS.INSTRUCTORS,
    label: "Instructors",
    path: "/admin/instructors",
    description: "Instructor approvals and assignments",
  },
  {
    key: ADMIN_PAGE_KEYS.CREATE_COURSE,
    label: "Create Course",
    path: "/admin/create-course",
    description: "Add new courses",
  },
  {
    key: ADMIN_PAGE_KEYS.COURSES,
    label: "Edit Courses",
    path: "/admin/courses",
    description: "Edit and manage courses",
  },
  {
    key: ADMIN_PAGE_KEYS.DISCUSSION,
    label: "Discussion",
    path: "/admin/discussion",
    description: "Community discussion page",
  },
  {
    key: ADMIN_PAGE_KEYS.COUPONS,
    label: "Coupons",
    path: "/admin/coupons",
    description: "Coupon management",
  },
  {
    key: ADMIN_PAGE_KEYS.NOTIFICATIONS,
    label: "Notifications",
    path: "/admin/notifications",
    description: "Broadcast notifications",
  },
];

export const ADMIN_PERMISSION_KEYS = ADMIN_PAGE_PERMISSIONS.map((page) => page.key);
export const ADMIN_PERMISSION_KEY_SET = new Set(ADMIN_PERMISSION_KEYS);

export const normalizeAdminPages = (pages = []) => {
  if (!Array.isArray(pages)) return [];

  return [
    ...new Set(
      pages
        .map((page) => String(page || "").trim())
        .filter((page) => ADMIN_PERMISSION_KEY_SET.has(page))
    ),
  ];
};

export const isLegacyFullAdmin = (user) =>
  user?.role === "admin" && user?.adminAccess?.managed !== true;

export const hasAdminPageAccess = (user, pageKey) => {
  if (!user || user.role !== "admin") return false;
  if (!ADMIN_PERMISSION_KEY_SET.has(pageKey)) return false;

  const access = user.adminAccess || {};

  if (access.managed !== true) return true;
  if (access.fullAccess === true) return true;

  return Array.isArray(access.pages) && access.pages.includes(pageKey);
};

export const hasAnyAdminPageAccess = (user, pageKeys = []) =>
  pageKeys.some((pageKey) => hasAdminPageAccess(user, pageKey));

export const getEffectiveAdminAccess = (user) => {
  if (!user || user.role !== "admin") {
    return {
      managed: false,
      fullAccess: false,
      pages: [],
    };
  }

  const access = user.adminAccess || {};
  const fullAccess = access.managed !== true || access.fullAccess === true;

  return {
    managed: access.managed === true,
    fullAccess,
    pages: fullAccess
      ? ADMIN_PERMISSION_KEYS
      : normalizeAdminPages(access.pages || []),
    grantedBy: access.grantedBy || null,
    grantedAt: access.grantedAt || null,
    updatedAt: access.updatedAt || null,
  };
};
