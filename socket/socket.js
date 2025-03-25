import { Server } from "socket.io";
import express from "express";
import http from "http";

const app = express();

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.URL || "http://localhost:3000", // Fallback to localhost if process.env.URL is not set
    methods: ["GET", "POST"],
    credentials: true, // Allow credentials (cookies, authorization headers, etc.)
  },
});

const userSocketMap = {}; // This map stores socket IDs corresponding to user IDs: userId -> socketId

// Helper function to get the receiver's socket ID
export const getReceiverSocketId = (receiverId) => userSocketMap[receiverId];

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  const userId = socket.handshake.query.userId;
  if (userId) {
    userSocketMap[userId] = socket.id; // Map the user ID to the socket ID
  }

  // Emit the list of online users to all connected clients
  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("A user disconnected:", socket.id);
    if (userId) {
      delete userSocketMap[userId]; // Remove the user from the map
    }
    io.emit("getOnlineUsers", Object.keys(userSocketMap)); // Update the list of online users
  });
});

export { app, server, io };
