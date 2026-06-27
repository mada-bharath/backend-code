/**
 * =========================================================
 * ☁️ AWS S3 SERVICE (FINAL PRODUCTION READY 🔥)
 * =========================================================
 * ✅ Safe env handling (no crash)
 * ✅ Works with multer memory storage
 * ✅ Clean logging
 * ✅ Upload + Delete
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

/* =========================================================
   🔐 ENV CHECK (SAFE - NO CRASH)
========================================================= */
const requiredEnv = [
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_S3_BUCKET",
];

const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (missingEnv.length > 0) {
  console.error("❌ Missing AWS ENV:", missingEnv);
}

/* =========================================================
   🚀 S3 CLIENT
========================================================= */
export const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined, // allows fallback if not set
});

/* =========================================================
   🧠 HELPER: FILE KEY
========================================================= */
const generateKey = (file) => {
  const cleanName = file.originalname
    ?.replace(/\s+/g, "-")
    .toLowerCase() || "file";

  return `uploads/${Date.now()}-${cleanName}`;
};

/* =========================================================
   📤 UPLOAD FILE (OPTIONAL USAGE)
========================================================= */
export const uploadToS3 = async (file) => {
  try {
    if (!file || !file.buffer) {
      throw new Error("Invalid file input");
    }

    const key = generateKey(file);

    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    await s3.send(command);

    const url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

    return { url, key };
  } catch (error) {
    console.error("❌ S3 Upload Error:", error.message);
    throw new Error("File upload failed");
  }
};

/* =========================================================
   ❌ DELETE FILE
========================================================= */
export const deleteFromS3 = async (key) => {
  try {
    if (!key) return false;

    const command = new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
    });

    await s3.send(command);

    return true;
  } catch (error) {
    console.error("❌ S3 Delete Error:", error.message);
    return false;
  }
};