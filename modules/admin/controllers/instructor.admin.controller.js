/**
 * Admin -> Instructor Controller
 * Path: modules/admin/controllers/instructor.admin.controller.js
 *
 * Production rules used in this file:
 * - User document writes use update queries, not document.save(), so the User
 *   password pre-save hook is never triggered by admin status/role changes.
 * - Every handler catches errors and responds directly. No next(error) usage.
 * - Existing route export names are preserved for backward compatibility.
 * - Course assignment accepts both instructorId and instructorEmail.
 */

import mongoose from "mongoose";
import User from "../../user/models/user.js";
import Course from "../../course/models/course.model.js";

const { ObjectId } = mongoose.Types;

const isValidObjectId = (id) => Boolean(id) && ObjectId.isValid(id);

const toObjectId = (id) => (id instanceof ObjectId ? id : new ObjectId(id));

const sendError = (res, message = "Something went wrong", code = 500) =>
  res.status(code).json({ success: false, message });

const sendOk = (res, data, message = "Success", code = 200) =>
  res.status(code).json({ success: true, message, data });

const normalizeEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

const normalizeText = (value) =>
  typeof value === "string" ? value.trim() : "";

const normalizePermissionType = (value = "SINGLE") => {
  const type = String(value).trim().toUpperCase();
  return ["SINGLE", "MULTIPLE"].includes(type) ? type : null;
};

const isValidDays = (days) => {
  const parsed = Number(days);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 365;
};

const parseDays = (days) => Number(days);

const getActorId = (req) => req.user?._id || req.user?.id || null;

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const sanitizeUser = (user) => {
  if (!user) return user;
  const data = typeof user.toObject === "function" ? user.toObject() : { ...user };
  delete data.password;
  return data;
};

const buildExpiryFromDays = (days, baseDate = new Date()) => {
  const expiry = new Date(baseDate);
  expiry.setDate(expiry.getDate() + parseDays(days));
  return expiry;
};

const parseFutureExpiry = (permissionExpiry) => {
  const expiry = new Date(permissionExpiry);
  if (Number.isNaN(expiry.getTime())) {
    return { error: "Invalid expiry date format" };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);

  if (expiry <= today) {
    return { error: "Expiry must be a future date" };
  }

  return { expiry };
};

export const getAllInstructors = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 10)
    );
    const skip = (page - 1) * limit;
    const { status, search } = req.query;

    const query = { role: "instructor" };

    if (status === "active") query.isInstructorActive = true;
    if (status === "inactive") query.isInstructorActive = false;

    const searchText = normalizeText(search);
    if (searchText) {
      const safeSearch = escapeRegex(searchText);
      query.$or = [
        { name: { $regex: safeSearch, $options: "i" } },
        { email: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const [instructors, total, activeCount, inactiveCount] = await Promise.all([
      User.find(query)
        .select("-password")
        .sort({ isInstructorActive: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
      User.countDocuments({ role: "instructor", isInstructorActive: true }),
      User.countDocuments({ role: "instructor", isInstructorActive: false }),
    ]);

    return res.json({
      success: true,
      data: instructors,
      summary: {
        total: activeCount + inactiveCount,
        activeCount,
        inactiveCount,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[InstructorAdmin] getAllInstructors Error:", error.message);
    return sendError(res, "Failed to fetch instructors");
  }
};

export const getInstructors = async (req, res) => {
  try {
    const instructors = await User.find({ role: "instructor" })
      .select("-password")
      .sort({ createdAt: -1 })
      .lean();

    return sendOk(res, instructors);
  } catch (error) {
    console.error("[InstructorAdmin] getInstructors Error:", error.message);
    return sendError(res, "Failed to fetch instructors");
  }
};

export const inviteInstructor = async (req, res) => {
  try {
    const {
      email,
      phone,
      permissionType = "SINGLE",
      permissionExpiry,
    } = req.body;

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return sendError(res, "Email is required", 400);

    const normalizedType = normalizePermissionType(permissionType);
    if (!normalizedType) {
      return sendError(res, "permissionType must be SINGLE or MULTIPLE", 400);
    }

    let expiryDate = null;
    if (permissionExpiry) {
      expiryDate = new Date(permissionExpiry);
      if (Number.isNaN(expiryDate.getTime())) {
        return sendError(res, "Invalid expiry date format", 400);
      }
    }

    const existingUser = await User.findOne({ email: normalizedEmail });

    if (!existingUser) {
      const newUser = await User.create({
        email: normalizedEmail,
        phone: normalizeText(phone),
        role: "instructor",
        name: normalizedEmail.split("@")[0],
        password: "TemporaryPassword@123",
        status: "pending",
        isInstructorActive: false,
        approvedByAdmin: false,
        permissionType: normalizedType,
        permissionExpiry: expiryDate,
        isPreApproved: true,
      });

      return res.status(201).json({
        success: true,
        message: "New instructor pre-approved. Access granted on signup.",
        data: sanitizeUser(newUser),
      });
    }

    if (existingUser.role === "admin") {
      return sendError(res, "Cannot invite an admin as instructor", 400);
    }

    const alreadyInstructor = existingUser.role === "instructor";
    const updateData = {
      role: "instructor",
      phone: normalizeText(phone) || existingUser.phone || "",
      permissionType: normalizedType,
      status: alreadyInstructor ? "approved" : "pending",
      isInstructorActive: alreadyInstructor,
      approvedByAdmin: alreadyInstructor,
      isExpired: false,
    };

    if (expiryDate) updateData.permissionExpiry = expiryDate;

    const updated = await User.findByIdAndUpdate(
      existingUser._id,
      { $set: updateData },
      { new: true, runValidators: true, select: "-password" }
    );

    return res.status(200).json({
      success: true,
      message: alreadyInstructor
        ? "Instructor re-activated successfully."
        : "User promoted to instructor (pending approval)",
      data: updated,
    });
  } catch (error) {
    console.error("[InstructorAdmin] inviteInstructor Error:", error.message);
    return sendError(res);
  }
};

export const updateInstructorStatus = async (req, res) => {
  try {
    const instructorId = req.params.instructorId || req.params.id;
    const { status } = req.body;

    const allowed = ["approved", "rejected", "pending", "suspended"];
    if (!status || !allowed.includes(status)) {
      return sendError(res, `Status must be one of: ${allowed.join(", ")}`, 400);
    }

    if (!isValidObjectId(instructorId)) {
      return sendError(res, "Invalid instructor ID", 400);
    }

    const existing = await User.findById(instructorId).lean();
    if (!existing || existing.role !== "instructor") {
      return sendError(res, "Instructor not found", 404);
    }

    const isApproved = status === "approved";
    const updateData = {
      status,
      isInstructorActive: isApproved,
      approvedByAdmin: isApproved,
      isExpired: isApproved ? false : existing.isExpired,
    };

    if (isApproved && !existing.permissionExpiry) {
      const expiry = new Date();
      expiry.setFullYear(expiry.getFullYear() + 2);
      updateData.permissionExpiry = expiry;
    }

    const updated = await User.findByIdAndUpdate(
      instructorId,
      { $set: updateData },
      { new: true, runValidators: true, select: "-password" }
    );

    return sendOk(res, updated, `Instructor ${status} successfully`);
  } catch (error) {
    console.error("[InstructorAdmin] updateInstructorStatus Error:", error.message);
    return sendError(res);
  }
};

export const grantInstructor = async (req, res) => {
  try {
    const instructorId = req.params.instructorId || req.params.id;

    if (!isValidObjectId(instructorId)) {
      return sendError(res, "Invalid instructor ID", 400);
    }

    const existing = await User.findById(instructorId).lean();
    if (!existing) return sendError(res, "User not found", 404);

    if (existing.role === "admin") {
      return sendError(res, "Cannot change admin role", 400);
    }

    if (
      existing.role === "instructor" &&
      existing.isInstructorActive &&
      existing.status === "approved" &&
      existing.permissionExpiry &&
      new Date(existing.permissionExpiry) > new Date()
    ) {
      return sendOk(res, existing, "Instructor is already active");
    }

    const expiry = buildExpiryFromDays(30);

    const updated = await User.findByIdAndUpdate(
      instructorId,
      {
        $set: {
          role: "instructor",
          status: "approved",
          isInstructorActive: true,
          approvedByAdmin: true,
          isExpired: false,
          permissionExpiry: expiry,
        },
      },
      { new: true, runValidators: true, select: "-password" }
    );

    return sendOk(res, updated, "Instructor access granted for 30 days");
  } catch (error) {
    console.error("[InstructorAdmin] grantInstructor Error:", error.message);
    return sendError(res);
  }
};

export const toggleInstructorStatus = async (req, res) => {
  try {
    const instructorId = req.params.instructorId || req.params.id;

    if (!isValidObjectId(instructorId)) {
      return sendError(res, "Invalid instructor ID", 400);
    }

    const existing = await User.findById(instructorId).lean();
    if (!existing || existing.role !== "instructor") {
      return sendError(res, "Instructor not found", 404);
    }

    const newActive = !existing.isInstructorActive;

    const updated = await User.findByIdAndUpdate(
      instructorId,
      {
        $set: {
          isInstructorActive: newActive,
          status: newActive ? "approved" : "suspended",
          approvedByAdmin: newActive ? true : existing.approvedByAdmin,
          isExpired: newActive ? false : existing.isExpired,
        },
      },
      { new: true, runValidators: true, select: "-password" }
    );

    return sendOk(
      res,
      updated,
      `Instructor ${newActive ? "activated" : "deactivated"}`
    );
  } catch (error) {
    console.error("[InstructorAdmin] toggleInstructorStatus Error:", error.message);
    return sendError(res);
  }
};

export const toggleInstructor = toggleInstructorStatus;

export const extendInstructorTime = async (req, res) => {
  try {
    const instructorId = req.params.instructorId || req.params.id;
    const { days, reason = "Admin extension" } = req.body;

    if (!isValidDays(days)) {
      return sendError(res, "Days must be a number between 1 and 365", 400);
    }

    if (!isValidObjectId(instructorId)) {
      return sendError(res, "Invalid instructor ID", 400);
    }

    const existing = await User.findById(instructorId).lean();
    if (!existing || existing.role !== "instructor") {
      return sendError(res, "Instructor not found", 404);
    }

    const used = existing.extensionHistory?.length || 0;
    const max = existing.maxExtensions || 20;
    if (used >= max) {
      return sendError(res, `Max ${max} extensions allowed for this instructor`, 400);
    }

    const now = new Date();
    const base =
      existing.permissionExpiry && new Date(existing.permissionExpiry) > now
        ? new Date(existing.permissionExpiry)
        : now;

    const newExpiry = buildExpiryFromDays(days, base);
    const historyEntry = {
      extendedBy: getActorId(req),
      days: parseDays(days),
      previousExpiry: existing.permissionExpiry || null,
      newExpiry,
      reason: normalizeText(reason) || "Admin extension",
    };

    const updated = await User.findByIdAndUpdate(
      instructorId,
      {
        $set: {
          permissionExpiry: newExpiry,
          isInstructorActive: true,
          approvedByAdmin: true,
          isExpired: false,
          status: "approved",
        },
        $push: {
          extensionHistory: historyEntry,
        },
      },
      { new: true, runValidators: true, select: "-password" }
    );

    return sendOk(
      res,
      updated,
      `Access extended by ${days} days until ${newExpiry.toLocaleDateString()}`
    );
  } catch (error) {
    console.error("[InstructorAdmin] extendInstructorTime Error:", error.message);
    return sendError(res);
  }
};

export const extendInstructor = extendInstructorTime;

export const reactivateInstructor = async (req, res) => {
  try {
    const instructorId = req.params.instructorId || req.params.id;
    const { reason = "Admin reactivation", days = 30 } = req.body;

    if (!isValidObjectId(instructorId)) {
      return sendError(res, "Invalid instructor ID", 400);
    }

    if (!isValidDays(days)) {
      return sendError(res, "Days must be a number between 1 and 365", 400);
    }

    const existing = await User.findById(instructorId).lean();
    if (!existing || existing.role !== "instructor") {
      return sendError(res, "Instructor not found", 404);
    }

    const newExpiry = buildExpiryFromDays(days);
    const reactivationEntry = {
      reactivatedBy: getActorId(req),
      reason: normalizeText(reason) || "Admin reactivation",
      reactivatedAt: new Date(),
    };

    const updated = await User.findByIdAndUpdate(
      instructorId,
      {
        $set: {
          isInstructorActive: true,
          isExpired: false,
          status: "approved",
          approvedByAdmin: true,
          permissionExpiry: newExpiry,
        },
        $push: { reactivationHistory: reactivationEntry },
      },
      { new: true, runValidators: true, select: "-password" }
    );

    return sendOk(res, updated, `Instructor reactivated for ${days} days`);
  } catch (error) {
    console.error("[InstructorAdmin] reactivateInstructor Error:", error.message);
    return sendError(res);
  }
};

export const revokeInstructorAccess = async (req, res) => {
  try {
    const { instructorId, userId, email, courseId } = req.body;
    const id = instructorId || userId;

    let query = {};
    if (id && isValidObjectId(id)) {
      query = { _id: toObjectId(id) };
    } else {
      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail) {
        return sendError(res, "instructorId or email is required", 400);
      }
      query = { email: normalizedEmail };
    }

    if (courseId) {
      if (!isValidObjectId(courseId)) {
        return sendError(res, "Invalid courseId", 400);
      }

      const user = await User.findOne(query).lean();
      if (!user) return sendError(res, "User not found", 404);

      await Course.updateOne(
        {
          _id: toObjectId(courseId),
          "assignedInstructors.instructor": toObjectId(user._id),
        },
        { $set: { "assignedInstructors.$.isActive": false } }
      );

      await User.findByIdAndUpdate(user._id, {
        $pull: { assignedCourses: toObjectId(courseId) },
      });

      return sendOk(res, null, "Instructor revoked from this course");
    }

    const instructor = await User.findOneAndUpdate(
      query,
      {
        $set: {
          role: "student",
          isInstructorActive: false,
          approvedByAdmin: false,
          status: "suspended",
          permissionExpiry: null,
          isExpired: false,
          assignedCourses: [],
          assignedModules: [],
          subjects: [],
        },
      },
      { new: true, runValidators: true, select: "-password" }
    );

    if (!instructor) return sendError(res, "Instructor not found", 404);

    await Course.updateMany(
      { "assignedInstructors.instructor": instructor._id },
      { $set: { "assignedInstructors.$[elem].isActive": false } },
      { arrayFilters: [{ "elem.instructor": instructor._id }] }
    );

    return sendOk(
      res,
      instructor,
      "Instructor access revoked - user is now a student"
    );
  } catch (error) {
    console.error("[InstructorAdmin] revokeInstructorAccess Error:", error.message);
    return sendError(res);
  }
};

export const renewInstructor = async (req, res) => {
  try {
    const instructorId = req.body.instructorId || req.params.instructorId || req.params.id;
    const { days, permissionExpiry, email } = req.body;

    let existing = null;

    if (instructorId) {
      if (!isValidObjectId(instructorId)) {
        return sendError(res, "Invalid instructor ID", 400);
      }
      existing = await User.findOne({
        _id: toObjectId(instructorId),
        role: "instructor",
      }).lean();
    } else {
      const normalizedEmail = normalizeEmail(email);
      if (normalizedEmail) {
        existing = await User.findOne({
          email: normalizedEmail,
          role: "instructor",
        }).lean();
      }
    }

    if (!existing) {
      return sendError(res, "Instructor not found", 404);
    }

    let newExpiry = null;

    if (days !== undefined) {
      if (!isValidDays(days)) {
        return sendError(res, "Days must be between 1 and 365", 400);
      }
      newExpiry = buildExpiryFromDays(days);
    } else if (permissionExpiry) {
      const parsed = parseFutureExpiry(permissionExpiry);
      if (parsed.error) {
        return sendError(res, parsed.error, 400);
      }
      newExpiry = parsed.expiry;
    } else {
      return sendError(res, "Provide either 'days' or 'permissionExpiry'", 400);
    }

    const updated = await User.findByIdAndUpdate(
      existing._id,
      {
        $set: {
          permissionExpiry: newExpiry,
          isInstructorActive: true,
          approvedByAdmin: true,
          isExpired: false,
          status: "approved",
        },
      },
      { new: true, runValidators: true, select: "-password" }
    );

    if (!updated) {
      return sendError(res, "Failed to update instructor", 500);
    }

    return sendOk(res, updated, "Instructor access renewed successfully");
  } catch (error) {
    console.error("[InstructorAdmin] renewInstructor Error:", error.message);
    return sendError(res, "Failed to renew instructor");
  }
};

export const assignCourseToInstructor = async (req, res) => {
  try {
    const {
      instructorId,
      instructorEmail,
      email,
      courseId,
      moduleName,
      subjectName,
      sectionId,
    } = req.body;

    if (!courseId) return sendError(res, "courseId is required", 400);
    if (!isValidObjectId(courseId)) {
      return sendError(res, "Invalid courseId format", 400);
    }

    const resolvedEmail = normalizeEmail(instructorEmail || email);
    const resolvedModuleName =
      normalizeText(moduleName) || normalizeText(subjectName) || null;

    let instructor = null;

    if (instructorId) {
      if (!isValidObjectId(instructorId)) {
        return sendError(res, "Invalid instructorId format", 400);
      }
      instructor = await User.findOne({
        _id: toObjectId(instructorId),
        role: "instructor",
      }).lean();
    } else if (resolvedEmail) {
      instructor = await User.findOne({
        email: resolvedEmail,
        role: "instructor",
      }).lean();
    } else {
      return sendError(res, "instructorId or instructorEmail is required", 400);
    }

    if (!instructor) {
      return sendError(res, "Instructor not found", 404);
    }

    if (!instructor.isInstructorActive) {
      return sendError(
        res,
        `Instructor ${instructor.email} is inactive. Activate them first.`,
        400
      );
    }

    let resolvedSectionId = null;
    if (sectionId) {
      if (!isValidObjectId(sectionId)) {
        return sendError(res, "Invalid sectionId format", 400);
      }
      resolvedSectionId = toObjectId(sectionId);
    }

    const resolvedInstructorId = instructor._id.toString();
    const course = await Course.findOne({
      _id: toObjectId(courseId),
      isDeleted: { $ne: true },
    });

    if (!course) return sendError(res, "Course not found", 404);

    if (!resolvedSectionId && resolvedModuleName) {
      const existingSection = course.sections?.find(
        (section) =>
          normalizeText(section.title).toLowerCase() ===
          resolvedModuleName.toLowerCase()
      );

      if (existingSection?._id) {
        resolvedSectionId = existingSection._id;
      } else {
        resolvedSectionId = new ObjectId();
        course.sections.push({
          _id: resolvedSectionId,
          title: resolvedModuleName,
          description: `Instructor-led module for ${course.title}`,
          assignedInstructor: toObjectId(resolvedInstructorId),
          order: course.sections?.length || 0,
          videos: [],
        });
        await course.save();
      }
    } else if (resolvedSectionId) {
      const section = course.sections?.id?.(resolvedSectionId);
      if (section && !section.assignedInstructor) {
        section.assignedInstructor = toObjectId(resolvedInstructorId);
        await course.save();
      }
    }

    const alreadyAssigned = course.assignedInstructors?.some((assignment) => {
      const sameInstructor =
        assignment.instructor?.toString() === resolvedInstructorId;
      if (!sameInstructor) return false;

      if (resolvedSectionId) {
        return assignment.sectionId?.toString() === resolvedSectionId.toString();
      }

      return (assignment.moduleName || null) === resolvedModuleName;
    });

    if (alreadyAssigned) {
      const assignmentFilter = {
        "elem.instructor": toObjectId(resolvedInstructorId),
      };

      if (resolvedSectionId) {
        assignmentFilter["elem.sectionId"] = resolvedSectionId;
      } else {
        assignmentFilter["elem.moduleName"] = resolvedModuleName;
      }

      await Course.updateOne(
        { _id: toObjectId(courseId) },
        {
          $set: {
            "assignedInstructors.$[elem].isActive": true,
            "assignedInstructors.$[elem].moduleName": resolvedModuleName,
            "assignedInstructors.$[elem].sectionId": resolvedSectionId,
            "assignedInstructors.$[elem].assignedBy": getActorId(req),
            "assignedInstructors.$[elem].assignedAt": new Date(),
          },
        },
        { arrayFilters: [assignmentFilter] }
      );
    } else {
      await Course.updateOne(
        { _id: toObjectId(courseId) },
        {
          $push: {
            assignedInstructors: {
              instructor: toObjectId(resolvedInstructorId),
              moduleName: resolvedModuleName,
              sectionId: resolvedSectionId,
              isActive: true,
              assignedAt: new Date(),
              assignedBy: getActorId(req),
            },
          },
        }
      );
    }

    await User.findByIdAndUpdate(
      resolvedInstructorId,
      {
        $addToSet: {
          assignedCourses: toObjectId(courseId),
          subjects: resolvedModuleName || course.title,
        },
      },
      { runValidators: true }
    );

    const updatedCourse = await Course.findById(courseId)
      .populate(
        "assignedInstructors.instructor",
        "name email isInstructorActive subjects permissionExpiry"
      )
      .lean();

    return sendOk(
      res,
      { course: updatedCourse },
      resolvedModuleName
        ? `Instructor assigned to module: ${resolvedModuleName}`
        : "Course assigned to instructor successfully"
    );
  } catch (error) {
    console.error("[InstructorAdmin] assignCourseToInstructor Error:", error.message);
    return sendError(res, "Failed to assign course");
  }
};

export const assignCourse = assignCourseToInstructor;

export const assignModule = async (req, res) => {
  try {
    const id = req.params.instructorId || req.params.id;
    const { moduleName, subjectName, courseId, sectionId } = req.body;
    const resolvedModuleName =
      normalizeText(moduleName) || normalizeText(subjectName);

    if (!isValidObjectId(id)) {
      return sendError(res, "Invalid instructor ID", 400);
    }

    if (!resolvedModuleName) {
      return sendError(res, "moduleName is required", 400);
    }

    const existing = await User.findById(id).lean();
    if (!existing || existing.role !== "instructor") {
      return sendError(res, "Instructor not found", 404);
    }

    const userUpdate = {
      $addToSet: {
        subjects: resolvedModuleName,
      },
    };

    if (courseId) {
      if (!isValidObjectId(courseId)) {
        return sendError(res, "Invalid courseId format", 400);
      }
      const courseExists = await Course.exists({
        _id: toObjectId(courseId),
        isDeleted: { $ne: true },
      });
      if (!courseExists) {
        return sendError(res, "Course not found", 404);
      }
      userUpdate.$addToSet.assignedCourses = toObjectId(courseId);
    }

    const updated = await User.findByIdAndUpdate(id, userUpdate, {
      new: true,
      runValidators: true,
      select: "-password",
    });

    if (courseId) {
      let resolvedSectionId = null;
      if (sectionId) {
        if (!isValidObjectId(sectionId)) {
          return sendError(res, "Invalid sectionId format", 400);
        }
        resolvedSectionId = toObjectId(sectionId);
      }

      await Course.updateOne(
        {
          _id: toObjectId(courseId),
          "assignedInstructors.instructor": toObjectId(id),
        },
        {
          $set: {
            "assignedInstructors.$.moduleName": resolvedModuleName,
            "assignedInstructors.$.sectionId": resolvedSectionId,
          },
        }
      );
    }

    return sendOk(res, updated, `Module '${resolvedModuleName}' assigned`);
  } catch (error) {
    console.error("[InstructorAdmin] assignModule Error:", error.message);
    return sendError(res, "Failed to assign module");
  }
};
