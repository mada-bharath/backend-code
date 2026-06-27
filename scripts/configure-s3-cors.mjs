import "dotenv/config";
import {
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const bucket = process.env.AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET;
const region = process.env.AWS_REGION || "ap-south-1";

const uniq = (values) => [...new Set(values.filter(Boolean))];

const configuredOrigins = process.env.S3_CORS_ORIGINS
  ? process.env.S3_CORS_ORIGINS.split(",").map((origin) => origin.trim())
  : [];

const allowedOrigins = uniq([
  process.env.CLIENT_URL,
  process.env.ADMIN_URL,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  ...configuredOrigins,
]);

if (!bucket) {
  throw new Error("Missing AWS_S3_BUCKET_NAME or AWS_S3_BUCKET in .env");
}

if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  throw new Error("Missing AWS access keys in .env");
}

const s3 = new S3Client({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

let existingRules = [];

try {
  const existing = await s3.send(new GetBucketCorsCommand({ Bucket: bucket }));
  existingRules = existing.CORSRules || [];
} catch (error) {
  if (
    error?.name !== "NoSuchCORSConfiguration" &&
    error?.$metadata?.httpStatusCode !== 404
  ) {
    throw error;
  }
}

const existingOrigins = existingRules.flatMap((rule) => rule.AllowedOrigins || []);
const existingExposeHeaders = existingRules.flatMap((rule) => rule.ExposeHeaders || []);
const allowedMethods = uniq(["PUT", "POST", "GET", "HEAD"]);
const allowedHeaders = uniq([
  "*",
  ...existingRules.flatMap((rule) => rule.AllowedHeaders || []),
]);
const exposeHeaders = uniq(["ETag", ...existingExposeHeaders]);

const corsConfiguration = {
  CORSRules: [
    {
      AllowedOrigins: uniq([...existingOrigins, ...allowedOrigins]),
      AllowedMethods: allowedMethods,
      AllowedHeaders: allowedHeaders,
      ExposeHeaders: exposeHeaders,
      MaxAgeSeconds: 3000,
    },
  ],
};

await s3.send(
  new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: corsConfiguration,
  })
);

const saved = await s3.send(new GetBucketCorsCommand({ Bucket: bucket }));

console.log(`Updated merged CORS for s3://${bucket} in ${region}`);
console.log(JSON.stringify(saved.CORSRules, null, 2));
