// debug.mjs
process.on("uncaughtException", (e) => {
  console.error("UNCAUGHT EXCEPTION:", e);
  process.exit(1);
});
process.on("unhandledRejection", (e) => {
  console.error("UNHANDLED REJECTION:", e);
  process.exit(1);
});

import("./core/server.js");