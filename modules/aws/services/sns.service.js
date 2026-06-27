/**
 * =========================================================
 * 📱 AWS SNS SERVICE (FINAL PRODUCTION READY 🔥)
 * =========================================================
 * ✅ Correct env usage
 * ✅ Safe credential handling
 * ✅ Clean debug logs
 * ✅ No crash on missing env
 */

import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

/* =========================================================
   🧠 CREATE CLIENT (SAFE)
========================================================= */
const createSNSClient = () => {
  const region = process.env.AWS_REGION || "ap-south-1";

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error("❌ SNS: Missing AWS credentials in .env");
  }

  return new SNSClient({
    region,
    credentials: process.env.AWS_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined, // fallback (important)
  });
};

/* =========================================================
   📩 SEND SMS
========================================================= */
export const sendSMS = async (phone, message) => {
  try {
    console.log("📱 Sending SMS to:", phone);

    const sns = createSNSClient();

    const command = new PublishCommand({
      Message: message,
      PhoneNumber: phone, // must be +91XXXXXXXXXX
    });

    const response = await sns.send(command);

    console.log("✅ SMS SENT:", response.MessageId);

    return response;

  } catch (error) {
    console.error("❌ SNS ERROR:", error.message);

    console.log("DEBUG → REGION:", process.env.AWS_REGION);
    console.log(
      "DEBUG → KEY:",
      process.env.AWS_ACCESS_KEY_ID ? "OK" : "MISSING"
    );
    console.log(
      "DEBUG → SECRET:",
      process.env.AWS_SECRET_ACCESS_KEY ? "OK" : "MISSING"
    );

    throw new Error("Failed to send SMS");
  }
};