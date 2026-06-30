import { getSiteSettingsDocument, POLICY_TYPES } from "../models/siteSettings.model.js";

const sendError = (res, message = "Something went wrong", code = 500) =>
  res.status(code).json({ success: false, message });

const normalizeText = (value = "") => String(value || "").trim();

const normalizeStringList = (value, maxItems = 12) => {
  const list = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/\r?\n|,/)
        .map((item) => item.trim());

  return [...new Set(list.map((item) => normalizeText(item)).filter(Boolean))]
    .slice(0, maxItems);
};

const normalizePolicyType = (value) => {
  const type = normalizeText(value).toLowerCase();
  return POLICY_TYPES.includes(type) ? type : "";
};

const normalizePolicy = (type, input = {}, existing = {}) => ({
  title:
    normalizeText(input.title) ||
    existing.title ||
    (type === "terms"
      ? "Terms and Conditions"
      : type === "privacy"
        ? "Privacy Policy"
        : "Refund and Return Policy"),
  content: normalizeText(input.content ?? existing.content),
  version: normalizeText(input.version ?? existing.version) || "1.0",
  updatedAt: new Date(),
});

const toPolicyPayload = (type, policy = {}) => ({
  type,
  title: policy.title || "",
  content: policy.content || "",
  version: policy.version || "1.0",
  updatedAt: policy.updatedAt || null,
});

const toPublicPayload = (settings) => ({
  brandName: settings.brandName,
  footerDescription: settings.footerDescription,
  emails: settings.emails || [],
  phones: settings.phones || [],
  resources: settings.resources || [],
  supportLinks: settings.supportLinks || [],
  policies: {
    terms: toPolicyPayload("terms", settings.policies?.terms),
    privacy: toPolicyPayload("privacy", settings.policies?.privacy),
    refund: toPolicyPayload("refund", settings.policies?.refund),
  },
  updatedAt: settings.updatedAt,
});

export const getPublicSiteSettings = async (req, res) => {
  try {
    const settings = await getSiteSettingsDocument();
    return res.json({
      success: true,
      data: toPublicPayload(settings),
    });
  } catch (error) {
    console.error("[SiteSettings] getPublicSiteSettings:", error.message);
    return sendError(res, "Failed to fetch site settings");
  }
};

export const getPublicPolicy = async (req, res) => {
  try {
    const type = normalizePolicyType(req.params.type);
    if (!type) return sendError(res, "Invalid policy type", 400);

    const settings = await getSiteSettingsDocument();
    return res.json({
      success: true,
      data: toPolicyPayload(type, settings.policies?.[type]),
    });
  } catch (error) {
    console.error("[SiteSettings] getPublicPolicy:", error.message);
    return sendError(res, "Failed to fetch policy");
  }
};

export const getAdminSiteSettings = async (req, res) => {
  try {
    const settings = await getSiteSettingsDocument();
    return res.json({
      success: true,
      data: toPublicPayload(settings),
    });
  } catch (error) {
    console.error("[SiteSettings] getAdminSiteSettings:", error.message);
    return sendError(res, "Failed to fetch site settings");
  }
};

export const updateAdminSiteSettings = async (req, res) => {
  try {
    const existing = await getSiteSettingsDocument();
    const body = req.body || {};

    const update = {
      brandName: normalizeText(body.brandName) || existing.brandName,
      footerDescription:
        normalizeText(body.footerDescription) || existing.footerDescription,
      emails: normalizeStringList(body.emails),
      phones: normalizeStringList(body.phones),
      updatedBy: req.user?._id || null,
      "policies.terms": normalizePolicy(
        "terms",
        body.policies?.terms,
        existing.policies?.terms
      ),
      "policies.privacy": normalizePolicy(
        "privacy",
        body.policies?.privacy,
        existing.policies?.privacy
      ),
      "policies.refund": normalizePolicy(
        "refund",
        body.policies?.refund,
        existing.policies?.refund
      ),
    };

    existing.set(update);
    await existing.save();

    return res.json({
      success: true,
      message: "Site settings updated",
      data: toPublicPayload(existing),
    });
  } catch (error) {
    console.error("[SiteSettings] updateAdminSiteSettings:", error.message);
    if (error.name === "ValidationError") {
      return sendError(res, error.message, 400);
    }
    return sendError(res, "Failed to update site settings");
  }
};
