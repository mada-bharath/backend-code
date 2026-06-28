import "dotenv/config";

import { setDefaultResultOrder } from "dns";
import mongoose from "mongoose";

setDefaultResultOrder("ipv4first");

const REQUIRED_ENV = ["MONGO_URI", "JWT_SECRET"];
const DB_TIMEOUT_MS = Number(process.env.DB_CONNECT_TIMEOUT_MS || 5000);

let connectionPromise = null;
let appPromise = null;

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
};

const setCorsHeaders = (req, res) => {
  const origin = req.headers.origin || process.env.CLIENT_URL || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
};

const getPathname = (req) => {
  const host = req.headers.host || "localhost";
  return new URL(req.url || "/", `https://${host}`).pathname;
};

const getMissingEnv = () => REQUIRED_ENV.filter((key) => !process.env[key]);

const getDatabaseState = () => ({
  connected: mongoose.connection.readyState === 1,
  readyState: mongoose.connection.readyState,
});

const loadApp = async () => {
  if (!appPromise) {
    appPromise = import("../core/app.js").then((mod) => mod.default);
  }

  return appPromise;
};

const connectDB = async () => {
  const missingEnv = getMissingEnv();
  if (missingEnv.length > 0) {
    const error = new Error(`Missing Vercel environment variables: ${missingEnv.join(", ")}`);
    error.code = "ENV_MISSING";
    throw error;
  }

  if (mongoose.connection.readyState === 1) return;

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: DB_TIMEOUT_MS,
      socketTimeoutMS: 20_000,
      autoIndex: true,
      family: 4,
    });
  }

  try {
    await connectionPromise;
  } catch (error) {
    connectionPromise = null;
    throw error;
  }
};

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const pathname = getPathname(req);

  if (pathname === "/favicon.png") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (pathname === "/health" || pathname === "/api/health") {
    try {
      await connectDB();
    } catch (error) {
      console.error("[Vercel database health error]", error);

      const missingEnv = error.code === "ENV_MISSING";

      json(res, missingEnv ? 500 : 503, {
        success: false,
        message: missingEnv
          ? error.message
          : "MongoDB is not connected. Check MongoDB Atlas network access and Vercel environment variables.",
        environment: process.env.NODE_ENV || "production",
        databaseConnected: false,
        databaseReadyState: mongoose.connection.readyState,
        missingEnvironmentVariables: getMissingEnv(),
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const database = getDatabaseState();

    json(res, 200, {
      success: true,
      message: "BharathVidya API running on Vercel",
      environment: process.env.NODE_ENV || "production",
      databaseConnected: database.connected,
      databaseReadyState: database.readyState,
      missingEnvironmentVariables: getMissingEnv(),
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    if (pathname.startsWith("/api")) {
      await connectDB();
    }

    const app = await loadApp();
    return app(req, res);
  } catch (error) {
    console.error("[Vercel backend error]", error);

    if (res.headersSent) return;

    const missingEnv = error.code === "ENV_MISSING";

    json(res, missingEnv ? 500 : 503, {
      success: false,
      message: missingEnv
        ? error.message
        : "Backend service is not ready. Check MongoDB Atlas network access and Vercel environment variables.",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}
