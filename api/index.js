import "dotenv/config";

import { setDefaultResultOrder } from "dns";
import mongoose from "mongoose";

import app from "../core/app.js";

setDefaultResultOrder("ipv4first");

const REQUIRED_ENV = ["MONGO_URI", "JWT_SECRET"];
let connectionPromise = null;

const connectDB = async () => {
  for (const key of REQUIRED_ENV) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  if (mongoose.connection.readyState === 1) return;

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 30_000,
      socketTimeoutMS: 45_000,
      autoIndex: true,
      family: 4,
    });
  }

  await connectionPromise;
};

export default async function handler(req, res) {
  await connectDB();
  return app(req, res);
}
