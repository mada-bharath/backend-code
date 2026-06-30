import mongoose from "mongoose";

export const POLICY_TYPES = ["terms", "privacy", "refund"];

export const POLICY_PATH_TO_TYPE = {
  "/terms-and-conditions": "terms",
  "/privacy-policy": "privacy",
  "/refund-and-return-policy": "refund",
};

const footerLinkSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    href: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
  },
  { _id: false }
);

const policySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    content: {
      type: String,
      default: "",
      maxlength: 50000,
    },
    version: {
      type: String,
      default: "1.0",
      trim: true,
      maxlength: 30,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

export const defaultSiteSettings = {
  singletonKey: "site-settings",
  brandName: "Bharath Vidya",
  footerDescription:
    "Bharath Vidya provides practical online courses and learning support for students, beginners, and working professionals.",
  emails: [],
  phones: [],
  resources: [
    { label: "Courses", href: "/courses" },
    { label: "My Courses", href: "/my-courses" },
    { label: "Discussion", href: "/discussion" },
    { label: "Wishlist", href: "/wishlist" },
    { label: "Level Up", href: "/levelup" },
  ],
  supportLinks: [
    { label: "Contact Us", href: "/contact" },
    { label: "Terms and Conditions", href: "/terms-and-conditions" },
    { label: "Refund and Return Policy", href: "/refund-and-return-policy" },
    { label: "Privacy Policy", href: "/privacy-policy" },
  ],
  policies: {
    terms: {
      title: "Terms and Conditions",
      content: "Terms and Conditions will be updated by the Bharath Vidya admin.",
      version: "1.0",
    },
    privacy: {
      title: "Privacy Policy",
      content: "Privacy Policy will be updated by the Bharath Vidya admin.",
      version: "1.0",
    },
    refund: {
      title: "Refund and Return Policy",
      content: "Refund and Return Policy will be updated by the Bharath Vidya admin.",
      version: "1.0",
    },
  },
};

const siteSettingsSchema = new mongoose.Schema(
  {
    singletonKey: {
      type: String,
      default: "site-settings",
      unique: true,
      immutable: true,
    },
    brandName: {
      type: String,
      default: defaultSiteSettings.brandName,
      trim: true,
      maxlength: 100,
    },
    footerDescription: {
      type: String,
      default: defaultSiteSettings.footerDescription,
      trim: true,
      maxlength: 1000,
    },
    emails: [
      {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: 160,
      },
    ],
    phones: [
      {
        type: String,
        trim: true,
        maxlength: 40,
      },
    ],
    resources: {
      type: [footerLinkSchema],
      default: defaultSiteSettings.resources,
    },
    supportLinks: {
      type: [footerLinkSchema],
      default: defaultSiteSettings.supportLinks,
    },
    policies: {
      terms: {
        type: policySchema,
        default: defaultSiteSettings.policies.terms,
      },
      privacy: {
        type: policySchema,
        default: defaultSiteSettings.policies.privacy,
      },
      refund: {
        type: policySchema,
        default: defaultSiteSettings.policies.refund,
      },
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

const SiteSettings = mongoose.model("SiteSettings", siteSettingsSchema);

export const getSiteSettingsDocument = async () =>
  SiteSettings.findOneAndUpdate(
    { singletonKey: "site-settings" },
    { $setOnInsert: defaultSiteSettings },
    {
      returnDocument: "after",
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    }
  );

export default SiteSettings;
