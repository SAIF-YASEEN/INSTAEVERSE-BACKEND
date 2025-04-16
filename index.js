import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import connectDB from "./utils/db.js";
import userRoute from "./routes/user.route.js";
import chatRoutes from "./routes/chatRoutes.js";
import postRoute from "./routes/post.route.js";
import messageRoute from "./routes/message.route.js";
import { app, server, io } from "./socket/socket.js"; // Ensure io is exported from socket.js
import { Post } from "./models/post.model.js";
import { Message } from "./models/message.model.js";
import { Comment } from "./models/comment.model.js";
import { Conversation } from "./models/conversation.model.js";
import { User } from "./models/user.model.js";
import Reaction from "./models/Reaction.js";
import { getUserProfile } from "./controllers/user.controller.js";
import isAuthenticated from "./middlewares/isAuthenticated.js";
import { fixFeed } from "./utils/db.js";
import multer from "multer";
import mongoose from "mongoose";
dotenv.config();

// Middlewares
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
// Global Multer error handling
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error("Multer error:", err);
    return res.status(400).json({
      success: false,
      message: `Multer error: ${err.message}`,
      field: err.field,
    });
  }
  next(err);
});
const corsOptions = {
  origin: ["http://localhost:5173"],
  credentials: true,
};
app.use(cors(corsOptions));

// Authentication middleware
const authMiddleware = async (req, res, next) => {
  try {
    const userId = req.headers["user-id"];
    if (!userId) {
      return res.status(401).json({ message: "No user ID provided" });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res
      .status(500)
      .json({ message: "Authentication error", error: error.message });
  }
};

// Routes
app.use("/api/v1/user", userRoute);
app.use("/api/v1/post", postRoute);
app.use("/api/v1/message", messageRoute);
app.use("/api/v1/user/chat-user", chatRoutes);

app.get("/api/v1/user/profile/:id", getUserProfile);
app.delete("/api/v1/conversation/:userId/user-messages", async (req, res) => {
  try {
    // Extract current user ID from request body (or headers, if preferred)
    const userId = req.body.userId; // Assuming userId is sent in the request body
    const otherUserId = req.params.userId;

    // Validate userId and otherUserId
    if (!userId || !otherUserId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing user IDs" });
    }

    if (userId === otherUserId) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete messages with yourself",
      });
    }

    // Delete only messages sent by the current user to the specified other user
    const result = await Message.deleteMany({
      senderId: userId, // Only delete messages where the current user is the sender
      receiverId: otherUserId,
    });

    if (result.deletedCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No messages found to delete" });
    }

    res.status(200).json({
      success: true,
      message: "Chat messages deleted for the current user",
    });
  } catch (error) {
    console.error("Error deleting user messages:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/api/v1/post/liked-posts/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Find posts where the user's ID is in the likes array
    const likedPosts = await Post.find({ likes: userId })
      .populate("author", "username profilePicture")
      .sort({ createdAt: -1 }); // Sort by most recent first

    res.status(200).json({
      success: true,
      posts: likedPosts,
      count: likedPosts.length,
    });
  } catch (error) {
    console.error("Error fetching liked posts:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching liked posts",
      error: error.message,
    });
  }
});
// Get liked posts for a user

// Delete account endpoint
app.delete("/api/v1/user/delete", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    const posts = await Post.find({ author: userId });
    const postIds = posts.map((post) => post._id);
    await Post.deleteMany({ author: userId });
    await Comment.deleteMany({ post: { $in: postIds } });
    await Comment.deleteMany({ author: userId });
    await Message.deleteMany({
      $or: [{ senderId: userId }, { receiverId: userId }],
    });
    await Conversation.deleteMany({ participants: userId });
    await User.updateMany(
      { $or: [{ followers: userId }, { following: userId }] },
      { $pull: { followers: userId, following: userId } }
    );
    await User.deleteOne({ _id: userId });
    res.json({ success: true, message: "Account and associated data deleted" });
  } catch (error) {
    console.error("Error deleting account:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Disable account endpoint
app.post("/disable", authMiddleware, async (req, res) => {
  try {
    const userId = req.body.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    user.isDisabled = true;
    user.disabledAt = new Date();
    await user.save();
    res
      .status(200)
      .json({ success: true, message: "Account disabled successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Reaction Routes
app.get("/api/reactions/:messageId", async (req, res) => {
  try {
    const reactions = await Reaction.find({ messageId: req.params.messageId });
    res.json(reactions);
  } catch (error) {
    console.error("GET /api/reactions error:", error);
    res
      .status(500)
      .json({ error: "Error fetching reactions", details: error.message });
  }
});

app.post("/api/reactions", async (req, res) => {
  try {
    const { messageId, userId, emoji, timestamp } = req.body;
    const user = await User.findById(userId); // Fetch actual user data
    if (!user) throw new Error("User not found");

    const reaction = new Reaction({
      messageId,
      userId,
      emoji,
      timestamp,
      user: {
        username: user.username,
        profilePicture: user.profilePicture,
      },
    });

    await reaction.save();
    io.emit("new-reaction", reaction);
    res.status(201).json(reaction);
  } catch (error) {
    console.error("POST /api/reactions error:", error);
    res
      .status(500)
      .json({ error: "Error adding reaction", details: error.message });
  }
});

app.put("/api/reactions/:messageId", async (req, res) => {
  try {
    const { userId, emoji } = req.body;
    const reaction = await Reaction.findOneAndUpdate(
      { messageId: req.params.messageId, userId },
      { emoji, timestamp: new Date() },
      { new: true }
    );

    if (!reaction) {
      return res.status(404).json({ error: "Reaction not found" });
    }

    io.emit("new-reaction", reaction);
    res.json(reaction);
  } catch (error) {
    console.error("PUT /api/reactions error:", error);
    res
      .status(500)
      .json({ error: "Error updating reaction", details: error.message });
  }
});

app.delete("/api/reactions/:messageId/:userId", async (req, res) => {
  try {
    const { messageId, userId } = req.params;
    // console.log(
    //   `Attempting to delete reaction - messageId: ${messageId}, userId: ${userId}`
    // );

    const reaction = await Reaction.findOneAndDelete({ messageId, userId });

    if (!reaction) {
      // console.log("Reaction not found in database");
      return res.status(404).json({ error: "Reaction not found" });
    }

    // console.log("Reaction deleted successfully:", reaction);
    io.emit("reaction-deleted", { messageId, userId });
    res.status(204).send();
  } catch (error) {
    console.error("DELETE /api/reactions error:", error);
    res
      .status(500)
      .json({ error: "Error deleting reaction", details: error.message });
  }
});
app.delete("/api/v1/message/:messageId", async (req, res) => {
  try {
    const userId = req.body.userId || req.headers["user-id"]; // Get userId from body or headers
    const messageId = req.params.messageId;

    if (!userId) {
      // console.log("No userId provided in request");
      return res
        .status(400)
        .json({ success: false, message: "User ID is required" });
    }

    // console.log(`DELETE /api/v1/message/${messageId} called by user ${userId}`);

    const message = await Message.findOne({ _id: messageId, senderId: userId });
    if (!message) {
      // console.log(
      //   `Message ${messageId} not found or not owned by user ${userId}`
      // );
      return res.status(404).json({
        success: false,
        message: "Message not found or not authorized",
      });
    }

    await Message.deleteOne({ _id: messageId });
    await Conversation.updateOne(
      { messages: messageId },
      { $pull: { messages: messageId } }
    );

    // console.log(`Message ${messageId} deleted by user ${userId}`);
    io.emit("message-deleted", { messageId }); // Notify via socket
    res.status(200).json({ success: true, message: "Message deleted" });
  } catch (error) {
    console.error("Error deleting message:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});
// index.js or user.route.js
app.patch("/api/v1/user/profile/username", async (req, res) => {
  try {
    const { username, userId } = req.body;
    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "User ID is required" });
    }
    if (!username) {
      return res
        .status(400)
        .json({ success: false, message: "Username is required" });
    }

    // Check if username is already taken
    const existingUser = await User.findOne({ username });
    if (existingUser && existingUser._id.toString() !== userId) {
      return res
        .status(400)
        .json({ success: false, message: "Username already taken" });
    }

    // Update the user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { username },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    res
      .status(200)
      .json({ success: true, user: { username: updatedUser.username } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
// Edit Message Route
app.put("/api/v1/message/:messageId", async (req, res) => {
  const { messageId } = req.params;
  const { message, userId } = req.body;

  if (!userId) {
    return res
      .status(400)
      .json({ success: false, message: "userId is required" });
  }

  try {
    const existingMessage = await Message.findById(messageId);
    if (!existingMessage) {
      return res
        .status(404)
        .json({ success: false, message: "Message not found" });
    }

    if (existingMessage.senderId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: "You can only edit your own messages",
      });
    }

    existingMessage.message = message;
    existingMessage.isEdited = true;
    existingMessage.editedAt = new Date();
    await existingMessage.save();

    io.emit("message-edited", {
      messageId: existingMessage._id,
      newMessage: message,
      editedAt: existingMessage.editedAt,
      isEdited: true, // Include isEdited in the socket event
    });

    res.status(200).json({
      success: true,
      message: "Message updated successfully",
      updatedMessage: existingMessage,
    });
  } catch (error) {
    console.error("Error editing message:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});
// Update activity status
app.put("/api/v1/users/update-activity-status", async (req, res) => {
  try {
    const { userId, activityStatus } = req.body;
    const user = await User.findByIdAndUpdate(
      userId,
      { activityStatus },
      { new: true }
    );
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    res.status(200).json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update last active
app.put("/api/v1/users/update-last-active", async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findByIdAndUpdate(
      userId,
      { lastActive: new Date() },
      { new: true }
    );
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    res.status(200).json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get online users
app.get("/api/v1/users/online-users", async (req, res) => {
  try {
    const threshold = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    const onlineUsers = await User.find({
      activityStatus: true,
      lastActive: { $gte: threshold },
    }).select("_id");
    res.status(200).json({
      success: true,
      onlineUsers: onlineUsers.map((user) => user._id),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
fixFeed();

app.put("/api/v1/users/update-privacy", async (req, res) => {
  try {
    const { userId, isPrivate } = req.body;

    // Validate input
    if (!userId || typeof isPrivate !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Invalid request: userId and isPrivate (boolean) are required",
      });
    }

    console.log("Updating privacy for user:", userId, "to:", isPrivate);

    // Find and update user
    const user = await User.findById(userId);
    if (!user) {
      console.log("User not found:", userId);
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Update the field
    user.isPrivate = isPrivate;
    const updatedUser = await user.save();

    console.log("Updated user:", updatedUser);

    res.status(200).json({
      success: true,
      message: `Account ${
        isPrivate ? "set to private" : "set to public"
      } successfully`,
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error in updatePrivacy:", error);
    res.status(500).json({
      success: false,
      message: "Error updating privacy settings",
      error: error.message,
    });
  }
});

app.get(
  "/api/v1/notification-action-center/fetching-only-user-post",
  async (req, res) => {
    try {
      const userId = req.query.userId;
      // console.log("Fetching posts for userId:", userId); // Debug log

      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        console.log("Invalid or missing userId");
        return res
          .status(400)
          .json({ success: false, message: "Invalid or missing user ID" });
      }

      const posts = await Post.find({ author: userId })
        .populate("likes", "username profilePicture")
        .populate("dislikes", "username profilePicture")
        .populate({
          path: "comments",
          populate: { path: "author", select: "username profilePicture" },
        })
        .maxTimeMS(5000); // 5-second timeout for query

      // console.log("Posts found:", posts.length); // Debug log
      res.json({ success: true, posts });
    } catch (error) {
      console.error("Error fetching user posts:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);
// Socket.IO Connection
io.on("connection", (socket) => {
  // console.log("New client connected:", socket.id);

  socket.on("disconnect", () => {
    // console.log("Client disconnected:", socket.id);
  });
});
const PORT = 8000;
// Start server
server.listen(PORT, () => {
  connectDB();
  console.log(`Server listening at port ${PORT}`);
});
