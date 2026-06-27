// core/socket.js
// ─────────────────────────────────────────────────────────
// Shared Socket.IO instance — imported by controllers
// so they never need to import from server.js (avoids
// the circular: app.js → controller → server.js → app.js)
// ─────────────────────────────────────────────────────────

let _io = null;

export const setIO = (io) => {
  _io = io;
};

export const emitToUser = (userId, event, data) => {
  if (!_io || !userId || !event) return;
  _io.to(userId.toString()).emit(event, data);
};

export const emitToAll = (event, data) => {
  if (!_io || !event) return;
  _io.emit(event, data);
};