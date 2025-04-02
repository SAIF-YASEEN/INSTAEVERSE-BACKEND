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
  // console.log("A user connected:", socket.id);

  // Handle user connection and online status
  const userId = socket.handshake.query.userId;
  if (userId) {
    userSocketMap[userId] = socket.id; // Map the user ID to the socket ID
  }

  // Emit the list of online users to all connected clients
  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  // Handle message-edited event
  // socket.js
  socket.on("message-edited", (data) => {
    console.log("Message edited:", data); // Debug log
    const { messageId, newMessage, editedAt, isEdited, senderId, receiverId } =
      data;

    const receiverSocketId = getReceiverSocketId(receiverId);
    const senderSocketId = getReceiverSocketId(senderId); // Ensure sender gets the update too

    // Emit to receiver
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("message-edited", {
        messageId,
        newMessage,
        editedAt,
        isEdited,
        senderId,
        receiverId,
      });
    }

    // Emit to sender (ensure sender's UI updates too)
    if (senderSocketId && senderSocketId !== socket.id) {
      io.to(senderSocketId).emit("message-edited", {
        messageId,
        newMessage,
        editedAt,
        isEdited,
        senderId,
        receiverId,
      });
    }

    // Emit back to the sender's current socket (in case senderSocketId differs)
    io.to(socket.id).emit("message-edited", {
      messageId,
      newMessage,
      editedAt,
      isEdited,
      senderId,
      receiverId,
    });
  });

  // Existing message-seen event handler
  socket.on("message-seen", (data) => {
    // Broadcast to the specific user whose messages were viewed
    socket.to(data.viewedUserId).emit("message-seen", {
      viewerUsername: data.viewerUsername,
      viewedUserId: data.viewedUserId,
    });
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    // console.log("A user disconnected:", socket.id);
    if (userId) {
      delete userSocketMap[userId]; // Remove the user from the map
    }
    io.emit("getOnlineUsers", Object.keys(userSocketMap)); // Update the list of online users
  });
});

export { app, server, io };
