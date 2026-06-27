import mongoose from "mongoose";
import Discussion, { TEN_DAYS_MS } from "../models/discussion.model.js";
import Course from "../../course/models/course.model.js";
import User from "../../user/models/user.js";

const MAX_ADMIN_LINKS = 5;
const MAX_ATTACHMENTS = 4;

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const sendError = (res, message = "Something went wrong", code = 500) =>
  res.status(code).json({ success: false, message });

const sendOk = (res, data, message = "OK", code = 200, extra = {}) =>
  res.status(code).json({ success: true, message, data, ...extra });

const activeDiscussionQuery = () => ({ expiresAt: { $gt: new Date() } });

const cleanupExpiredDiscussions = () =>
  Discussion.deleteMany({ expiresAt: { $lte: new Date() } });

const parseArrayInput = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item !== "string") return item;
      const trimmed = item.trim();
      if (!trimmed.startsWith("[")) return item;
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : item;
      } catch {
        return item;
      }
    });
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall back to comma separated text below.
    }
    return trimmed.split(",").map((item) => item.trim());
  }
  return [];
};

const normalizeStringList = (value, maxItems = 8) => {
  const list = parseArrayInput(value);

  return [...new Set(list.map((item) => String(item).trim()).filter(Boolean))]
    .slice(0, maxItems);
};

const normalizeEmojiList = (value) => normalizeStringList(value, 40);

const normalizeText = (value) => String(value || "").trim();

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeUploadPath = (filePath) => {
  if (!filePath) return "";
  const normalized = String(filePath).replace(/\\/g, "/");
  const uploadsIndex = normalized.lastIndexOf("/uploads/");
  return uploadsIndex >= 0 ? normalized.slice(uploadsIndex) : normalized;
};

const getFileUrl = (file) => file?.location || normalizeUploadPath(file?.path);

const normalizeAdminLinks = ({ links, linkUrl, linkLabel }) => {
  const rawLinks = parseArrayInput(links);
  const normalized = rawLinks
    .map((link) => ({
      platform: normalizeText(link?.platform),
      label: normalizeText(link?.label || link?.linkLabel),
      url: normalizeText(link?.url || link?.linkUrl),
    }))
    .filter((link) => link.url)
    .slice(0, MAX_ADMIN_LINKS);

  if (!normalized.length && normalizeText(linkUrl)) {
    normalized.push({
      platform: "",
      label: normalizeText(linkLabel),
      url: normalizeText(linkUrl),
    });
  }

  for (const link of normalized) {
    try {
      new URL(link.url);
    } catch {
      return { error: "Please enter valid URLs for all links" };
    }
  }

  return { links: normalized };
};

const normalizeAttachmentInput = (value) => {
  const rawAttachments = parseArrayInput(value);
  return rawAttachments
    .map((item) => {
      if (typeof item === "string") {
        return {
          type: "image",
          url: normalizeText(item),
          name: "",
          mimeType: "",
          size: 0,
        };
      }

      return {
        type: item?.type === "file" ? "file" : "image",
        url: normalizeText(item?.url || item?.imageUrl),
        name: normalizeText(item?.name || item?.label),
        mimeType: normalizeText(item?.mimeType || item?.mimetype),
        size: Number(item?.size) || 0,
      };
    })
    .filter((attachment) => attachment.url);
};

const normalizeAttachments = ({ files, attachments, imageUrls }) => {
  const uploaded = (Array.isArray(files) ? files : [])
    .map((file) => ({
      type: "image",
      url: getFileUrl(file),
      name: normalizeText(file.originalname),
      mimeType: normalizeText(file.mimetype),
      size: Number(file.size) || 0,
    }))
    .filter((attachment) => attachment.url);

  const fromBody = [
    ...normalizeAttachmentInput(attachments),
    ...normalizeStringList(imageUrls, MAX_ATTACHMENTS).map((url) => ({
      type: "image",
      url,
      name: "",
      mimeType: "",
      size: 0,
    })),
  ];

  const normalized = [...uploaded, ...fromBody].slice(0, MAX_ATTACHMENTS);

  for (const attachment of normalized) {
    if (/^(https?:)?\/\//i.test(attachment.url)) {
      try {
        new URL(
          attachment.url.startsWith("//")
            ? `https:${attachment.url}`
            : attachment.url
        );
      } catch {
        return { error: "Please enter valid image URLs" };
      }
    }
  }

  return { attachments: normalized };
};

const parsePositiveInt = (value, fallback, max) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
};

const buildCourseFields = async ({ courseId, courseName }) => {
  const fields = {
    course: null,
    courseName: normalizeText(courseName),
  };

  if (!courseId) return fields;
  if (!isValidId(courseId)) {
    return { error: "Invalid course ID" };
  }

  const course = await Course.findOne({ _id: courseId, isDeleted: false })
    .select("title")
    .lean();

  if (!course) return { error: "Course not found" };

  fields.course = course._id;
  fields.courseName = fields.courseName || course.title;
  return fields;
};

const populateDiscussionQuery = (query) =>
  query
    .populate("author", "name email role avatar")
    .populate("course", "title thumbnail language level")
    .populate("comments.author", "name email role avatar")
    .populate("pinnedBy", "name email role");

const getLiveMentors = async () => {
  const mentors = await User.find({
    role: "instructor",
    isInstructorActive: true,
    isBlocked: { $ne: true },
  })
    .select("name email avatar role subjects updatedAt")
    .sort({ updatedAt: -1 })
    .limit(6)
    .lean();

  const activeAfter = Date.now() - 15 * 60 * 1000;
  return mentors.map((mentor) => ({
    ...mentor,
    isOnline: new Date(mentor.updatedAt).getTime() >= activeAfter,
    liveStatus: new Date(mentor.updatedAt).getTime() >= activeAfter ? "live" : "recent",
  }));
};

const normalizeDiscussionResponse = (post, userId) => {
  const likes = Array.isArray(post?.likes) ? post.likes : [];
  const comments = Array.isArray(post?.comments) ? post.comments : [];
  const attachments = Array.isArray(post?.attachments) ? post.attachments : [];
  const currentUserId = String(userId || "");

  return {
    ...post,
    likeCount: likes.length,
    replyCount: comments.length,
    attachmentCount: attachments.length,
    likedByMe: likes.some((like) => String(like?._id || like) === currentUserId),
  };
};

export const getDiscussionPosts = async (req, res) => {
  try {
    await cleanupExpiredDiscussions();

    const {
      courseId,
      courseName,
      tag,
      search = "",
      page = 1,
      limit = 20,
    } = req.query;

    const query = activeDiscussionQuery();

    if (courseId) {
      if (!isValidId(courseId)) return sendError(res, "Invalid course ID", 400);
      query.course = courseId;
    }

    if (courseName) {
      query.courseName = { $regex: normalizeText(courseName), $options: "i" };
    }

    if (tag) {
      query.tags = { $regex: `^${escapeRegex(normalizeText(tag))}$`, $options: "i" };
    }

    if (search) {
      const safeSearch = escapeRegex(normalizeText(search));
      query.$or = [
        { title: { $regex: safeSearch, $options: "i" } },
        { content: { $regex: safeSearch, $options: "i" } },
        { courseName: { $regex: safeSearch, $options: "i" } },
        { linkUrl: { $regex: safeSearch, $options: "i" } },
        { linkLabel: { $regex: safeSearch, $options: "i" } },
        { "links.platform": { $regex: safeSearch, $options: "i" } },
        { "links.label": { $regex: safeSearch, $options: "i" } },
        { "links.url": { $regex: safeSearch, $options: "i" } },
        { "poll.question": { $regex: safeSearch, $options: "i" } },
      ];
    }

    const currentPage = parsePositiveInt(page, 1, 1000);
    const pageLimit = parsePositiveInt(limit, 20, 50);
    const skip = (currentPage - 1) * pageLimit;

    const [posts, total, liveMentors] = await Promise.all([
      populateDiscussionQuery(
        Discussion.find(query)
          .sort({ isPinned: -1, createdAt: -1 })
          .skip(skip)
          .limit(pageLimit)
      ).lean({ virtuals: true }),
      Discussion.countDocuments(query),
      getLiveMentors(),
    ]);

    const normalizedPosts = posts.map((post) =>
      normalizeDiscussionResponse(post, req.user?._id)
    );

    return sendOk(res, normalizedPosts, "Discussions fetched", 200, {
      pagination: {
        total,
        page: currentPage,
        limit: pageLimit,
        totalPages: Math.ceil(total / pageLimit),
      },
      liveMentors,
      retentionDays: TEN_DAYS_MS / (24 * 60 * 60 * 1000),
    });
  } catch (error) {
    console.error("[Discussion] getDiscussionPosts:", error.message);
    return sendError(res, "Failed to fetch discussions");
  }
};

export const createDiscussionPost = async (req, res) => {
  try {
    const {
      courseId,
      courseName,
      title,
      content,
      tags,
      emojis,
      links,
      linkUrl,
      linkLabel,
      attachments,
      imageUrls,
    } = req.body;
    const cleanTitle = normalizeText(title);
    const cleanContent = normalizeText(content);
    const normalizedLinks = normalizeAdminLinks({ links, linkUrl, linkLabel });
    const normalizedAttachments = normalizeAttachments({
      files: req.files,
      attachments,
      imageUrls,
    });

    if (normalizedLinks.error) {
      return sendError(res, normalizedLinks.error, 400);
    }

    if (normalizedAttachments.error) {
      return sendError(res, normalizedAttachments.error, 400);
    }

    if (
      !cleanTitle &&
      !cleanContent &&
      !normalizedLinks.links.length &&
      !normalizedAttachments.attachments.length
    ) {
      return sendError(res, "Discussion title or content is required", 400);
    }

    const courseFields = await buildCourseFields({ courseId, courseName });
    if (courseFields.error) return sendError(res, courseFields.error, 400);
    const primaryLink = normalizedLinks.links[0];

    const post = await Discussion.create({
      type: "post",
      author: req.user._id,
      ...courseFields,
      title: cleanTitle,
      content: cleanContent,
      tags: normalizeStringList(tags),
      emojis: normalizeEmojiList(emojis),
      linkUrl: primaryLink?.url || "",
      linkLabel: primaryLink?.label || primaryLink?.platform || primaryLink?.url || "",
      links: normalizedLinks.links,
      attachments: normalizedAttachments.attachments,
    });

    const populated = await populateDiscussionQuery(
      Discussion.findById(post._id)
    ).lean({ virtuals: true });

    return sendOk(
      res,
      normalizeDiscussionResponse(populated, req.user?._id),
      "Discussion posted",
      201
    );
  } catch (error) {
    console.error("[Discussion] createDiscussionPost:", error.message);
    return sendError(res, error.message || "Failed to create discussion");
  }
};

export const createPoll = async (req, res) => {
  try {
    const { courseId, courseName, title, question, options, content, tags, emojis } = req.body;
    const cleanQuestion = normalizeText(question);
    const cleanOptions = normalizeStringList(options, 8);

    if (!cleanQuestion) return sendError(res, "Poll question is required", 400);
    if (cleanOptions.length < 2) {
      return sendError(res, "Poll needs at least two options", 400);
    }

    const courseFields = await buildCourseFields({ courseId, courseName });
    if (courseFields.error) return sendError(res, courseFields.error, 400);

    const post = await Discussion.create({
      type: "poll",
      author: req.user._id,
      ...courseFields,
      title: normalizeText(title),
      content: normalizeText(content),
      tags: normalizeStringList(tags),
      emojis: normalizeEmojiList(emojis),
      poll: {
        question: cleanQuestion,
        options: cleanOptions.map((text) => ({ text })),
      },
      isPinned: req.body.isPinned === true || req.body.isPinned === "true",
      pinnedAt: req.body.isPinned ? new Date() : null,
      pinnedBy: req.body.isPinned ? req.user._id : null,
    });

    const populated = await populateDiscussionQuery(
      Discussion.findById(post._id)
    ).lean({ virtuals: true });

    return sendOk(
      res,
      normalizeDiscussionResponse(populated, req.user?._id),
      "Poll created",
      201
    );
  } catch (error) {
    console.error("[Discussion] createPoll:", error.message);
    return sendError(res, error.message || "Failed to create poll");
  }
};

export const shareDiscussionLink = async (req, res) => {
  try {
    const {
      courseId,
      courseName,
      title,
      linkUrl,
      linkLabel,
      links,
      content,
      tags,
      emojis,
      attachments,
      imageUrls,
    } = req.body;
    const normalizedLinks = normalizeAdminLinks({ links, linkUrl, linkLabel });
    const normalizedAttachments = normalizeAttachments({
      files: req.files,
      attachments,
      imageUrls,
    });

    if (normalizedLinks.error) {
      return sendError(res, normalizedLinks.error, 400);
    }
    if (normalizedAttachments.error) {
      return sendError(res, normalizedAttachments.error, 400);
    }
    if (!normalizedLinks.links.length) {
      return sendError(res, "Add at least one link", 400);
    }

    const courseFields = await buildCourseFields({ courseId, courseName });
    if (courseFields.error) return sendError(res, courseFields.error, 400);
    const primaryLink = normalizedLinks.links[0];

    const post = await Discussion.create({
      type: "link",
      author: req.user._id,
      ...courseFields,
      title: normalizeText(title),
      content: normalizeText(content),
      tags: normalizeStringList(tags),
      emojis: normalizeEmojiList(emojis),
      linkUrl: primaryLink.url,
      linkLabel: primaryLink.label || primaryLink.platform || primaryLink.url,
      links: normalizedLinks.links,
      attachments: normalizedAttachments.attachments,
      isPinned: req.body.isPinned === true || req.body.isPinned === "true",
      pinnedAt: req.body.isPinned ? new Date() : null,
      pinnedBy: req.body.isPinned ? req.user._id : null,
    });

    const populated = await populateDiscussionQuery(
      Discussion.findById(post._id)
    ).lean({ virtuals: true });

    return sendOk(
      res,
      normalizeDiscussionResponse(populated, req.user?._id),
      "Link shared",
      201
    );
  } catch (error) {
    console.error("[Discussion] shareDiscussionLink:", error.message);
    return sendError(res, error.message || "Failed to share link");
  }
};

export const addDiscussionComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { body, content, tags, emojis } = req.body;
    const cleanBody = normalizeText(body || content);

    if (!isValidId(id)) return sendError(res, "Invalid discussion ID", 400);
    if (!cleanBody) return sendError(res, "Comment is required", 400);

    const post = await Discussion.findOne({ _id: id, ...activeDiscussionQuery() });
    if (!post) return sendError(res, "Discussion not found or expired", 404);

    post.comments.push({
      author: req.user._id,
      body: cleanBody,
      tags: normalizeStringList(tags),
      emojis: normalizeEmojiList(emojis),
    });
    await post.save();

    const populated = await populateDiscussionQuery(
      Discussion.findById(post._id)
    ).lean({ virtuals: true });

    return sendOk(
      res,
      normalizeDiscussionResponse(populated, req.user?._id),
      "Comment added",
      201
    );
  } catch (error) {
    console.error("[Discussion] addDiscussionComment:", error.message);
    return sendError(res, error.message || "Failed to add comment");
  }
};

export const votePoll = async (req, res) => {
  try {
    const { id } = req.params;
    const { optionId } = req.body;

    if (!isValidId(id)) return sendError(res, "Invalid discussion ID", 400);
    if (!isValidId(optionId)) return sendError(res, "Invalid option ID", 400);

    const post = await Discussion.findOne({
      _id: id,
      type: "poll",
      ...activeDiscussionQuery(),
    });
    if (!post) return sendError(res, "Poll not found or expired", 404);

    const selectedOption = post.poll.options.id(optionId);
    if (!selectedOption) return sendError(res, "Poll option not found", 404);

    const voterId = req.user._id.toString();
    post.poll.options.forEach((option) => {
      option.votes = option.votes.filter((vote) => vote.toString() !== voterId);
    });
    selectedOption.votes.push(req.user._id);

    await post.save();

    const populated = await populateDiscussionQuery(
      Discussion.findById(post._id)
    ).lean({ virtuals: true });

    return sendOk(
      res,
      normalizeDiscussionResponse(populated, req.user?._id),
      "Vote saved"
    );
  } catch (error) {
    console.error("[Discussion] votePoll:", error.message);
    return sendError(res, error.message || "Failed to vote");
  }
};

export const pinDiscussion = async (req, res) => {
  try {
    const { id } = req.params;
    const isPinned = req.body.isPinned !== false && req.body.isPinned !== "false";

    if (!isValidId(id)) return sendError(res, "Invalid discussion ID", 400);

    const post = await Discussion.findOneAndUpdate(
      { _id: id, ...activeDiscussionQuery() },
      {
        $set: {
          isPinned,
          pinnedAt: isPinned ? new Date() : null,
          pinnedBy: isPinned ? req.user._id : null,
        },
      },
      { new: true, runValidators: true }
    );

    if (!post) return sendError(res, "Discussion not found or expired", 404);

    const populated = await populateDiscussionQuery(
      Discussion.findById(post._id)
    ).lean({ virtuals: true });

    return sendOk(
      res,
      normalizeDiscussionResponse(populated, req.user?._id),
      isPinned ? "Discussion pinned" : "Discussion unpinned"
    );
  } catch (error) {
    console.error("[Discussion] pinDiscussion:", error.message);
    return sendError(res, "Failed to update pin");
  }
};

export const toggleDiscussionLike = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return sendError(res, "Invalid discussion ID", 400);

    const post = await Discussion.findOne({ _id: id, ...activeDiscussionQuery() });
    if (!post) return sendError(res, "Discussion not found or expired", 404);

    const userId = req.user._id.toString();
    const alreadyLiked = post.likes.some((like) => like.toString() === userId);

    if (alreadyLiked) {
      post.likes.pull(req.user._id);
    } else {
      post.likes.addToSet(req.user._id);
    }

    await post.save();

    const populated = await populateDiscussionQuery(
      Discussion.findById(post._id)
    ).lean({ virtuals: true });

    return sendOk(
      res,
      normalizeDiscussionResponse(populated, req.user?._id),
      alreadyLiked ? "Like removed" : "Post liked"
    );
  } catch (error) {
    console.error("[Discussion] toggleDiscussionLike:", error.message);
    return sendError(res, "Failed to update like");
  }
};

export const recordDiscussionShare = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return sendError(res, "Invalid discussion ID", 400);

    const post = await Discussion.findOneAndUpdate(
      { _id: id, ...activeDiscussionQuery() },
      { $inc: { shareCount: 1 } },
      { new: true, runValidators: true }
    );

    if (!post) return sendError(res, "Discussion not found or expired", 404);

    const populated = await populateDiscussionQuery(
      Discussion.findById(post._id)
    ).lean({ virtuals: true });

    return sendOk(
      res,
      normalizeDiscussionResponse(populated, req.user?._id),
      "Share counted"
    );
  } catch (error) {
    console.error("[Discussion] recordDiscussionShare:", error.message);
    return sendError(res, "Failed to record share");
  }
};

export const deleteDiscussion = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return sendError(res, "Invalid discussion ID", 400);

    const post = await Discussion.findOne({ _id: id });
    if (!post) return sendError(res, "Discussion not found", 404);

    const isOwner = post.author?.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return sendError(res, "Only the owner or admin can delete this discussion", 403);
    }

    await Discussion.deleteOne({ _id: id });
    return sendOk(res, { id }, "Discussion deleted");
  } catch (error) {
    console.error("[Discussion] deleteDiscussion:", error.message);
    return sendError(res, "Failed to delete discussion");
  }
};
