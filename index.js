import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import connectDB from "./utils/db.js";
import userRoute from "./routes/user.route.js";
import postRoute from "./routes/post.route.js";
import messageRoute from "./routes/message.route.js";
import { app, server } from "./socket/socket.js";
import { Post } from "./models/post.model.js";
import { Message } from "./models/message.model.js";
import { Comment } from "./models/comment.model.js";
import { Conversation } from "./models/conversation.model.js";
import { User } from "./models/user.model.js";

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3000;

// Middlewares
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true })); // Fixed urlencoded import

const corsOptions = {
  origin: ["http://localhost:5173", "http://192.168.2.11:5173"],
  credentials: true,
};

app.use(cors(corsOptions));

// Authentication middleware
const authMiddleware = async (req, res, next) => {
  try {
    const userId = req.headers["user-id"]; // Assuming user-id header from frontend
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

// Delete account endpoint with authMiddleware
app.delete("/api/v1/user/delete", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;

    // Delete user's posts
    const posts = await Post.find({ author: userId });
    const postIds = posts.map((post) => post._id);
    await Post.deleteMany({ author: userId });

    // Delete comments on user's posts
    await Comment.deleteMany({ post: { $in: postIds } });

    // Delete user's comments on other posts
    await Comment.deleteMany({ author: userId });

    // Delete user's messages and conversations
    await Message.deleteMany({
      $or: [{ senderId: userId }, { receiverId: userId }],
    });
    await Conversation.deleteMany({ participants: userId });

    // Remove user from followers/following of other users
    await User.updateMany(
      { $or: [{ followers: userId }, { following: userId }] },
      { $pull: { followers: userId, following: userId } }
    );

    // Delete the user
    await User.deleteOne({ _id: userId });

    res.json({ success: true, message: "Account and associated data deleted" });
  } catch (error) {
    console.error("Error deleting account:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Start server
server.listen(PORT, () => {
  connectDB();
  console.log(`Server listening at port ${PORT}`);
});
