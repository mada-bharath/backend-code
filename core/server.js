/**
 * =========================================================
 * 🚀 SERVER.JS (FINAL PRODUCTION 🔥)
 * =========================================================
 * Path: backend/core/server.js
 *
 * ✅ FIX 5: DNS forced to IPv4 first — fixes ECONNREFUSED
 *    on mobile hotspots and Fortinet-filtered networks.
 * ✅ FIX 6: serverSelectionTimeoutMS increased to 30s
 * =========================================================
 */

import "dotenv/config";

/* ✅ FIX: Force IPv4 DNS — must be BEFORE any network imports */
import { setDefaultResultOrder } from "dns";
setDefaultResultOrder("ipv4first");

import http       from "http";
import mongoose   from "mongoose";
import { Server } from "socket.io";

import app        from "./app.js";
import { setIO }  from "./socket.js";

/* LOGGER */
let logger;
try {
  const logging = await import("../infrastructure/logging/logger.js");
  logger        = logging.logger;
} catch {
  console.warn("⚠️  Winston logger not found — using console fallback.");
  logger = {
    info:  (...a) => console.log(...a),
    warn:  (...a) => console.warn(...a),
    error: (...a) => console.error(...a),
  };
}

/* ENV VALIDATION */
const REQUIRED_ENV = ["MONGO_URI", "JWT_SECRET"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌ [ENV] Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

/* AWS CONFIG WARNING */
const awsConfigured =
  !!process.env.AWS_ACCESS_KEY_ID     &&
  !!process.env.AWS_SECRET_ACCESS_KEY &&
  !!process.env.AWS_REGION            &&
  !!process.env.AWS_S3_BUCKET_NAME;

if (!awsConfigured) {
  logger.warn("⚠️  AWS not fully configured — S3 uploads and CloudFront streaming unavailable.");
}

/* ENV CONSTANTS */
const PORT       = process.env.PORT       || 5000;
const MONGO_URI  = process.env.MONGO_URI;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const NODE_ENV   = process.env.NODE_ENV   || "development";

/* HTTP SERVER */
const server = http.createServer(app);

/* SOCKET.IO */
export const io = new Server(server, {
  cors: {
    origin: NODE_ENV === "production"
      ? [CLIENT_URL]
      : [CLIENT_URL, "http://localhost:5173", "http://localhost:3000"],
    methods:     ["GET", "POST"],
    credentials: true,
  },
  transports:     ["websocket", "polling"],
  pingTimeout:    60_000,
  pingInterval:   25_000,
  upgradeTimeout: 30_000,
  allowEIO3:      true,
});

setIO(io);

const onlineUsers = new Map();

io.on("connection", (socket) => {
  logger.info(`🔌 Socket connected: ${socket.id}`);

  socket.on("register", (userId) => {
    if (!userId) return;
    socket.join(userId.toString());
    onlineUsers.set(userId.toString(), socket.id);
    logger.info(`✅ User ${userId} joined room ${userId}`);
  });

  socket.on("disconnect", (reason) => {
    for (const [userId, sid] of onlineUsers.entries()) {
      if (sid === socket.id) {
        onlineUsers.delete(userId);
        logger.info(`🔌 User ${userId} disconnected (${reason})`);
        break;
      }
    }
  });

  socket.on("error", (err) => {
    logger.error(`❌ Socket error on ${socket.id}: ${err.message}`);
  });
});

/* MONGODB CONNECTION
   ✅ family: 4          — force IPv4 (fixes mobile hotspot DNS)
   ✅ serverSelection 30s — more time for slow connections      */
const connectDB = async () => {
  await mongoose.connect(MONGO_URI, {
    maxPoolSize:              10,
    serverSelectionTimeoutMS: 30_000,
    socketTimeoutMS:          45_000,
    autoIndex:                true,
    family:                   4,
  });
  logger.info("✅ MongoDB Atlas connected successfully");
};

mongoose.connection.on("disconnected", () =>
  logger.warn("⚠️  MongoDB disconnected — attempting automatic reconnect...")
);
mongoose.connection.on("reconnected", () =>
  logger.info("✅ MongoDB reconnected")
);
mongoose.connection.on("error", (err) =>
  logger.error(`❌ MongoDB runtime error: ${err.message}`)
);

/* START SERVER */
const startServer = async () => {
  try {
    await connectDB();
    const handleListenError = (error) => {
      if (error.code === "EADDRINUSE") {
        logger.error(`Port ${PORT} is already in use by another process.`);
        logger.error(
          `Stop the existing backend process on port ${PORT}, or start this server with a different PORT value.`
        );
        process.exit(1);
      }

      logger.error(`Server listen failed: ${error.message}`);
      process.exit(1);
    };

    server.once("error", handleListenError);
    server.listen(PORT, () => {
      server.off("error", handleListenError);
      logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      logger.info(`🚀 Server running on port : ${PORT}`);
      logger.info(`🌐 Environment            : ${NODE_ENV}`);
      logger.info(`📡 Client URL             : ${CLIENT_URL}`);
      logger.info(`☁️  AWS configured         : ${awsConfigured ? "YES ✅" : "NO ⚠️  (S3 disabled)"}`);
      logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    });
  } catch (error) {
    logger.error(`❌ Server startup failed: ${error.message}`);
    process.exit(1);
  }
};

/* GRACEFUL SHUTDOWN */
const gracefulShutdown = async (signal) => {
  logger.info(`📴 ${signal} received — starting graceful shutdown...`);
  server.close(async () => {
    try {
      await mongoose.connection.close();
      logger.info("✅ MongoDB connection closed cleanly");
      logger.info("👋 Server shut down. Goodbye.");
      process.exit(0);
    } catch (err) {
      logger.error(`❌ Error during shutdown: ${err.message}`);
      process.exit(1);
    }
  });
  setTimeout(() => {
    logger.error("⏰ Shutdown timeout — forcing exit");
    process.exit(1);
  }, 10_000).unref();
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT",  () => gracefulShutdown("SIGINT"));

/* GLOBAL ERROR SAFETY NET */
process.on("uncaughtException", (err) => {
  logger.error(`💥 UNCAUGHT EXCEPTION: ${err.message}`);
  logger.error(err.stack);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error(`💥 UNHANDLED REJECTION: ${reason}`);
  server.close(() => process.exit(1));
});

/* BOOT */
startServer();

export default server;
