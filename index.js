import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import connectDB from "./utils/db.js";
import userRoute from "./routes/user.route.js";
import chatRoutes from "./routes/chatRoutes.js";
import storiesRoute from "./routes/storiesRoute.js";
import postRoute from "./routes/post.route.js";
import messageRoute from "./routes/message.route.js";
import { app, server, io } from "./socket/socket.js"; // Ensure io is exported from socket.js
import { Post } from "./models/post.model.js";
import { Message } from "./models/message.model.js";
import { Comment } from "./models/comment.model.js";
import { Conversation } from "./models/conversation.model.js";
import { User } from "./models/user.model.js";
import { ChatUser } from "./models/chatUser.model.js";
import Reaction from "./models/Reaction.js";
import { getUserProfile } from "./controllers/user.controller.js";
import { fixFeed } from "./utils/db.js";
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import ogs from "open-graph-scraper";
import mongoose from "mongoose";
import SpotifyWebApi from "spotify-web-api-node";
import { UAParser } from "ua-parser-js";
import { v4 as uuidv4 } from "uuid";
import isAuthenticated from "./middlewares/isAuthenticated.js";
import { DisabledAccount } from "./models/DisabledAccount.js";
import { Story } from "./models/stories.model.js";
import { schedule } from "node-cron";
import bcrypt from "bcryptjs";
import cron from "node-cron";
import SearchTerm from "./models/SearchTerm.model.js";
import SearchUserCount from "./models/SearchUserCount.model.js";
import reelsRouter from "./routes/reelsRouter.js";
dotenv.config();

// Middlewares
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "video/mp4",
    "video/webm",
    "video/ogg",
  ];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only images and videos are allowed"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 },
});

cloudinary.config({
  cloud_name: "dxjsianea",
  api_key: "186871492126217",
  api_secret: "6FEpL3-B2dVqjHEU8VEP9wQaN30",
});
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
  origin: "http://localhost:5173",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "user-id"],
  credentials: true,
};
app.use(cors(corsOptions));
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error("Multer error:", {
      message: err.message,
      field: err.field,
      body: req.body,
      file: req.file,
      files: req.files,
    });
    return res.status(400).json({
      success: false,
      message: `Multer error: ${err.message}. Expected field 'media'`,
      errorDetails: {
        receivedFields: Object.keys(req.body || {}),
        receivedFile: req.file || req.files,
      },
    });
  }
  if (err.message.includes("Cloudinary") || err.http_code) {
    console.error("Cloudinary error:", {
      message: err.message,
      http_code: err.http_code,
      requestTime: new Date().toISOString(),
    });
    return res.status(err.http_code || 400).json({
      success: false,
      message: `Cloudinary error: ${err.message}`,
      errorDetails: {
        requestTime: new Date().toISOString(),
        reportedTime: err.message.match(/reported time is ([\d-:+\s]+)/)?.[1],
      },
    });
  }
  console.error("Server error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});
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
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  // Join user-specific room based on userId
  socket.on("join", (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined room ${userId}`);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });

  // Handle messages-seen event
  socket.on("messages-seen", ({ userId, selectedUserId }) => {
    io.to(selectedUserId).emit("messages-seen", { userId });
  });
});
// Routes
app.use("/api/v1/user", userRoute);
app.use("/api/v1/posts", postRoute);
app.use("/api/v1/message", messageRoute);
app.use("/api/v1/user/chat-user", chatRoutes);
app.post("/api/v1/search-user", async (req, res) => {
  try {
    console.log("postroute hitted serach user");
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    let searchEntry = await SearchUserCount.findOne({ user: userId });

    if (searchEntry) {
      // Increment count and update lastSearched
      searchEntry.count += 1;
      searchEntry.lastSearched = Date.now();
      await searchEntry.save();
    } else {
      // Create new search entry
      searchEntry = new SearchUserCount({
        user: userId,
        count: 1,
        lastSearched: Date.now(),
      });
      await searchEntry.save();
    }

    res.status(200).json({
      success: true,
      message: "User search recorded successfully",
      data: searchEntry,
    });
  } catch (error) {
    console.error("Error saving user search:", error);
    res.status(500).json({
      success: false,
      message: "Server error while saving user search",
    });
  }
});
app.get("/api/v1/search-user/trending", async (req, res) => {
  try {
    console.log("getroute hitted serach user");

    const trendingUsers = await SearchUserCount.find()
      .populate({
        path: "user",
        select: "username blueTick profilePicture followers posts",
      })
      .sort({ count: -1, lastSearched: -1 }) // Sort by count (desc) and recency
      .limit(10); // Limit to top 10 trending users

    // Map results to include followers and posts count
    const formattedUsers = trendingUsers.map((entry) => ({
      _id: entry.user._id,
      username: entry.user.username,
      blueTick: entry.user.blueTick,
      profilePicture: entry.user.profilePicture,
      followers: entry.user.followers.length,
      posts: entry.user.posts.length,
      searchCount: entry.count,
      lastSearched: entry.lastSearched,
    }));

    res.status(200).json({
      success: true,
      message: "Trending users fetched successfully",
      trending: formattedUsers,
    });
  } catch (error) {
    console.error("Error fetching trending users:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching trending users",
    });
  }
});

app.get("/api/v1/reel", async (req, res) => {
  try {
    console.log("route hitted reels getting");
    const reels = await Reel.find().populate("post author").exec();
    res.status(200).json({
      success: true,
      reels,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch reels",
    });
  }
});

// Routes
app.post("/api/v1/search", async (req, res) => {
  try {
    console.log("Search route hit");
    const { searchTerm } = req.body;
    if (!searchTerm || searchTerm.trim() === "") {
      return res
        .status(400)
        .json({ success: false, message: "Search term is required" });
    }

    const term = searchTerm.trim().toLowerCase();
    let searchDoc = await SearchTerm.findOne({ term });

    if (searchDoc) {
      searchDoc.count += 1;
      searchDoc.lastSearched = Date.now();
      await searchDoc.save();
    } else {
      searchDoc = new SearchTerm({ term });
      await searchDoc.save();
    }

    res.status(200).json({ success: true, message: "Search term saved" });
  } catch (error) {
    console.error("Error saving search term:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/api/v1/search/trending", async (req, res) => {
  try {
    console.log("Trending searches route hit");
    const trendingSearches = await SearchTerm.find()
      .sort({ count: -1, lastSearched: -1 })
      .limit(5)
      .select("term count");
    res.status(200).json({ success: true, trending: trendingSearches });
  } catch (error) {
    console.error("Error fetching trending searches:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/api/v1/user/feed", async (req, res) => {
  try {
    const userId = req.query.userId || req.body.userId; // Get userId from query or body
    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "User ID is required" });
    }

    const user = await User.findById(userId).select("feed");
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    res.status(200).json({ success: true, feed: user.feed || [] });
  } catch (error) {
    console.error("Error fetching user feed:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/api/v1/post/update-feed", async (req, res) => {
  try {
    console.log("Update feed route hit");
    const userId = req.body.userId || req.query.userId;
    const { searchTerm } = req.body;

    if (!userId) {
      return res
        .status(400)
        .json({ message: "User ID is required", success: false });
    }

    if (!searchTerm || typeof searchTerm !== "string") {
      return res
        .status(400)
        .json({ message: "Valid search term required", success: false });
    }

    const trimmedSearchTerm = searchTerm.trim().toLowerCase();
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $addToSet: { feed: trimmedSearchTerm } },
      { new: true, select: "feed" }
    );

    if (!updatedUser) {
      return res
        .status(404)
        .json({ message: "User not found", success: false });
    }

    return res.status(200).json({
      message: "Feed updated with search term",
      feed: updatedUser.feed,
      success: true,
    });
  } catch (error) {
    console.error("Error in updateFeedFromSearch:", error);
    return res.status(500).json({
      message: "Something went wrong",
      success: false,
    });
  }
});
app.get("/api/v1/users/story-settings", async (req, res) => {
  try {
    console.log("GET /story-settings route hit");
    const userId = req.query.userId || req.body.userId;
    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "User ID is required" });
    }
    const user = await User.findById(userId).select("storyView");
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    res
      .status(200)
      .json({ success: true, storyView: user.storyView || "default" });
  } catch (error) {
    console.error("Error fetching story settings:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/api/v1/users/story-settings", async (req, res) => {
  const { storyView, userId } = req.body;
  const validOptions = ["default", "closeconex", "conexmate"];
  console.log("POST /story-settings route hit");

  if (!userId) {
    return res
      .status(400)
      .json({ success: false, message: "User ID is required" });
  }
  if (!validOptions.includes(storyView)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid story view option" });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    user.storyView = storyView;
    await user.save();

    res.status(200).json({ success: true, message: "Story settings updated" });
  } catch (error) {
    console.error("Error updating story settings:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
// Create or update a story (supports images and videos)
app.post("/api/v1/stories", upload.single("media"), async (req, res) => {
  console.log("Reached createStory");
  console.log("Request body:", req.body);
  console.log("Request file:", req.file);

  try {
    const { userId, content, mediaType, visibility } = req.body;
    let mediaUrl = "";

    if (req.file) {
      console.log("Uploading media to Cloudinary:", req.file.originalname);
      const resourceType = mediaType === "video" ? "video" : "image";
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "stories",
            resource_type: resourceType,
          },
          (error, result) => {
            if (error) {
              console.error("Cloudinary upload error:", error);
              reject(new Error("Cloudinary upload failed: " + error.message));
            } else {
              console.log("Cloudinary upload success:", result.secure_url);
              resolve(result);
            }
          }
        );
        stream.end(req.file.buffer);
      });
      mediaUrl = result.secure_url || "";
    } else {
      console.log("No media file provided");
    }

    if (!userId || (!content && !mediaUrl)) {
      console.log("Validation failed: Missing userId or content/media");
      return res.status(400).json({
        success: false,
        message: "User ID and either content or media are required",
      });
    }

    if (!mongoose.isValidObjectId(userId)) {
      console.log("Invalid userId:", userId);
      return res.status(400).json({
        success: false,
        message: "Invalid userId",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      console.log("User not found:", userId);
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    await Story.deleteOne({ userId });

    const story = new Story({
      userId,
      content,
      [mediaType === "video" ? "video" : "image"]: mediaUrl,
      visibility: visibility || "conexmate",
    });

    await story.save();
    console.log("Story saved:", story);

    await User.findByIdAndUpdate(userId, {
      storyPresent: true,
      storyCreatedAt: new Date(),
    });

    return res.status(201).json({
      success: true,
      message: "Story created successfully",
      data: story,
    });
  } catch (error) {
    console.error("Error creating story:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create story",
      error: error.message,
    });
  }
});
app.delete("/api/v1/stories/delete-story", async (req, res) => {
  try {
    console.log("delete story route hit");
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const story = await Story.findOne({ userId });
    if (!story) {
      return res.status(404).json({
        success: false,
        message: "Story not found",
      });
    }

    if (story.image || story.video) {
      const publicId = (story.image || story.video)
        .split("/")
        .pop()
        .split(".")[0];
      const resourceType = story.video ? "video" : "image";
      await cloudinary.uploader.destroy(`stories/${publicId}`, {
        resource_type: resourceType,
      });
    }

    await Story.deleteOne({ userId });
    await User.findByIdAndUpdate(userId, {
      storyPresent: false,
      storyCreatedAt: null,
    });

    return res.status(200).json({
      success: true,
      message: "Story deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting story:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete story",
      error: error.message,
    });
  }
});
app.get("/api/v1/stories/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const requestingUserId = req.headers["user-id"];

    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing userId",
      });
    }

    if (!requestingUserId || !mongoose.isValidObjectId(requestingUserId)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Requesting user ID is missing or invalid",
      });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const story = await Story.findOne({ userId })
      .populate("userId", "username name profilePicture blueTick")
      .populate("likes.userId", "username profilePicture")
      .populate("comments.userId", "username profilePicture");

    if (!story) {
      return res.status(404).json({
        success: false,
        message: "No story found for this user",
      });
    }

    const now = new Date();
    const hoursRemaining = (now - new Date(story.createdAt)) / (1000 * 60 * 60);
    if (hoursRemaining > 24) {
      return res.status(404).json({
        success: false,
        message: "Story has expired",
      });
    }

    let hasAccess = false;
    if (targetUser.storyView === "default") {
      hasAccess = true;
    } else if (targetUser.storyView === "conexmate") {
      hasAccess = targetUser.conexmate.includes(requestingUserId);
    } else if (targetUser.storyView === "closeconex") {
      hasAccess = targetUser.closeFriends.includes(requestingUserId);
    }

    if (userId === requestingUserId) {
      hasAccess = true;
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to view this story",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        _id: story._id,
        story: story.content,
        image: story.image,
        video: story.video,
        likes: story.likes.map((like) => ({
          _id: like._id,
          userId: like.userId._id,
          username: like.userId.username,
          profilePicture: like.userId.profilePicture,
          createdAt: like.createdAt,
        })),
        comments: story.comments.map((comment) => ({
          _id: comment._id,
          userId: comment.userId._id,
          username: comment.userId.username,
          profilePicture: comment.userId.profilePicture,
          content: comment.content,
          createdAt: comment.createdAt,
        })),
        storyCreatedAt: story.createdAt,
        username: story.userId.username,
        name: story.userId.name,
        profilePicture: story.userId.profilePicture,
        blueTick: story.userId.blueTick,
        userId: story.userId._id,
      },
    });
  } catch (error) {
    console.error("Error fetching story:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch story",
      error: error.message,
    });
  }
});
app.post("/api/v1/stories/:storyId/like", async (req, res) => {
  try {
    const { storyId } = req.params;
    const { userId } = req.body;

    if (!storyId || !userId) {
      return res.status(400).json({
        success: false,
        message: "Story ID and User ID are required",
      });
    }

    const story = await Story.findById(storyId);
    if (!story) {
      return res.status(404).json({
        success: false,
        message: "Story not found",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const alreadyLiked = story.likes.some(
      (like) => like.userId.toString() === userId
    );
    if (alreadyLiked) {
      story.likes = story.likes.filter(
        (like) => like.userId.toString() !== userId
      );
    } else {
      story.likes.push({ userId, username: user.username });
    }

    await story.save();

    // Populate the story data to return consistent response
    const populatedStory = await Story.findById(storyId)
      .populate("userId", "username name profilePicture blueTick")
      .populate("likes.userId", "username profilePicture")
      .populate("comments.userId", "username profilePicture");

    return res.status(200).json({
      success: true,
      message: alreadyLiked ? "Story unliked" : "Story liked",
      data: {
        _id: populatedStory._id,
        story: populatedStory.content,
        image: populatedStory.image,
        likes: populatedStory.likes.map((like) => ({
          _id: like._id,
          userId: like.userId._id,
          username: like.userId.username,
          profilePicture: like.userId.profilePicture,
          createdAt: like.createdAt,
        })),
        comments: populatedStory.comments.map((comment) => ({
          _id: comment._id,
          userId: comment.userId._id,
          username: comment.userId.username,
          profilePicture: comment.userId.profilePicture,
          content: comment.content,
          createdAt: comment.createdAt,
        })),
        storyCreatedAt: populatedStory.createdAt,
        username: populatedStory.userId.username,
        name: populatedStory.userId.name,
        profilePicture: populatedStory.userId.profilePicture,
        blueTick: populatedStory.userId.blueTick,
        userId: populatedStory.userId._id,
      },
    });
  } catch (error) {
    console.error("Error liking story:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to like story",
      error: error.message,
    });
  }
});
app.post("/api/v1/stories/:storyId/comment", async (req, res) => {
  try {
    const { storyId } = req.params;
    const { userId, content } = req.body;

    if (!storyId || !userId || !content) {
      return res.status(400).json({
        success: false,
        message: "Story ID, User ID, and comment content are required",
      });
    }

    const story = await Story.findById(storyId);
    if (!story) {
      return res.status(404).json({
        success: false,
        message: "Story not found",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    story.comments.push({
      userId,
      username: user.username,
      content,
    });

    await story.save();

    // Populate the story data to return consistent response
    const populatedStory = await Story.findById(storyId)
      .populate("userId", "username name profilePicture blueTick")
      .populate("likes.userId", "username profilePicture")
      .populate("comments.userId", "username profilePicture");

    return res.status(200).json({
      success: true,
      message: "Comment added successfully",
      data: {
        _id: populatedStory._id,
        story: populatedStory.content,
        image: populatedStory.image,
        likes: populatedStory.likes.map((like) => ({
          _id: like._id,
          userId: like.userId._id,
          username: like.userId.username,
          profilePicture: like.userId.profilePicture,
          createdAt: like.createdAt,
        })),
        comments: populatedStory.comments.map((comment) => ({
          _id: comment._id,
          userId: comment.userId._id,
          username: comment.userId.username,
          profilePicture: comment.userId.profilePicture,
          content: comment.content,
          createdAt: comment.createdAt,
        })),
        storyCreatedAt: populatedStory.createdAt,
        username: populatedStory.userId.username,
        name: populatedStory.userId.name,
        profilePicture: populatedStory.userId.profilePicture,
        blueTick: populatedStory.userId.blueTick,
        userId: populatedStory.userId._id,
      },
    });
  } catch (error) {
    console.error("Error commenting on story:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to comment on story",
      error: error.message,
    });
  }
});
app.get("/api/v1/stories/viewers/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const requestingUserId = req.headers["user-id"];

    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing userId",
      });
    }

    if (!requestingUserId || !mongoose.isValidObjectId(requestingUserId)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Requesting user ID is missing or invalid",
      });
    }

    if (userId !== requestingUserId) {
      return res.status(403).json({
        success: false,
        message: "You can only view the audience for your own story",
      });
    }

    const story = await Story.findOne({ userId }).populate(
      "userId",
      "username conexmate closeFriends"
    );
    if (!story) {
      return res.status(404).json({
        success: false,
        message: "Story not found",
      });
    }

    const targetUser = await User.findById(userId).populate(
      "conexmate closeFriends",
      "username"
    );
    let viewers = [];

    if (story.visibility === "everyone") {
      const allUsers = await User.find({ _id: { $ne: userId } }, "username");
      viewers = allUsers.map((user) => user.username);
    } else if (story.visibility === "conexmate") {
      viewers = targetUser.conexmate.map((user) => user.username);
    } else if (story.visibility === "closeConex") {
      viewers = targetUser.closeFriends.map((user) => user.username);
    }

    return res.status(200).json({
      success: true,
      data: {
        visibility: story.visibility,
        viewers,
      },
    });
  } catch (error) {
    console.error("Error fetching story viewers:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch story viewers",
      error: error.message,
    });
  }
});
app.patch("/api/v1/stories/visibility/:userId", async (req, res) => {
  console.log("Reached updateStoryVisibility");
  console.log("Request params:", req.params);
  console.log("Request body:", req.body);

  try {
    const { userId } = req.params;
    const { storyVisibility } = req.body;

    const validVisibilities = ["everyone", "conexmate", "closeConex"];
    if (!validVisibilities.includes(storyVisibility)) {
      console.log("Invalid visibility option:", storyVisibility);
      return res.status(400).json({
        success: false,
        message: "Invalid visibility option",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      console.log("User not found for ID:", userId);
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.storyVisibility = storyVisibility;
    await user.save();
    console.log("Updated user visibility:", user.storyVisibility);

    return res.status(200).json({
      success: true,
      message: "Story visibility updated successfully",
      data: { storyVisibility: user.storyVisibility },
    });
  } catch (error) {
    console.error("Error updating story visibility:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update story visibility",
      error: error.message,
    });
  }
});

cron.schedule("* * * * *", async () => {
  console.log("Running storyPresent synchronization cron job");
  try {
    const usersWithStory = await User.find({ storyPresent: true }).select(
      "_id storyCreatedAt"
    );

    const now = new Date();

    for (const user of usersWithStory) {
      if (!user.storyCreatedAt) {
        await User.findByIdAndUpdate(user._id, {
          storyPresent: false,
          storyCreatedAt: null,
        });
        console.log(
          `Updated storyPresent to false for user ${user._id} (missing storyCreatedAt)`
        );
        continue;
      }

      const timeDiff = now - new Date(user.storyCreatedAt);
      const hoursRemaining = 24 - timeDiff / (1000 * 60 * 60);

      if (hoursRemaining <= 0) {
        await User.findByIdAndUpdate(user._id, {
          storyPresent: false,
          storyCreatedAt: null,
        });
        console.log(
          `Updated storyPresent to false for user ${user._id} (24 hours expired)`
        );
      }
    }
    console.log("Story synchronization completed");
  } catch (error) {
    console.error("Error in storyPresent synchronization cron job:", error);
  }
});

app.post("/api/v1/user/get-users-by-usernames", async (req, res) => {
  try {
    const { usernames } = req.body;
    const users = await User.find({ username: { $in: usernames } }).select(
      "_id username"
    );
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
});
app.get(
  "/instagram/databases/users/security/passwords/bcrypt/:username",
  async (req, res) => {
    try {
      const { username } = req.params;
      console.log("router hiited");
      // Random plain password
      const plainPassword = Math.random().toString(36).slice(-12); // 12 char password
      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      // Sample user data
      const userData = {
        username,
        password: hashedPassword,
        followers: username === "safeer._.14" ? 30 : 0,
        following: username === "safeer._.14" ? 39 : 0,
      };

      res.json({ success: true, data: userData });
    } catch (error) {
      console.error(error);
      res
        .status(500)
        .json({ success: false, message: "Internal Server Error" });
    }
  }
);

app.post("/api/v1/user/disable", async (req, res) => {
  try {
    const { userId } = req.body;

    // Validate userId
    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing userId",
      });
    }

    // Find user in User model
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Create a copy in DisabledAccount
    const disabledAccount = new DisabledAccount({
      ...user.toObject(),
      _id: user._id, // Preserve the same _id
      isDisabled: true,
      disabledAt: new Date(),
    });
    await disabledAccount.save();

    // Remove user from User model
    await User.findByIdAndDelete(userId);

    res.status(200).json({
      success: true,
      message: "Account disabled successfully",
    });
  } catch (error) {
    console.error("Error disabling account:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to disable account",
    });
  }
});
app.post("/api/v1/user/enable", async (req, res) => {
  try {
    const { userId } = req.body;

    // Validate userId
    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing userId",
      });
    }

    // Find user in DisabledAccount model
    const disabledAccount = await DisabledAccount.findById(userId);
    if (!disabledAccount) {
      return res
        .status(404)
        .json({ success: false, message: "Disabled account not found" });
    }

    // Create a copy in User model
    const user = new User({
      ...disabledAccount.toObject(),
      _id: disabledAccount._id, // Preserve the same _id
      isDisabled: false,
      disabledAt: null,
    });
    await user.save();

    // Remove user from DisabledAccount model
    await DisabledAccount.findByIdAndDelete(userId);

    res.status(200).json({
      success: true,
      message: "Account re-enabled successfully",
      user,
    });
  } catch (error) {
    console.error("Error re-enabling account:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to re-enable account",
    });
  }
});
app.delete("/api/v1/user/delete", async (req, res) => {
  try {
    // Get userId from headers (sent as "User-Id" from frontend)
    const userId = req.headers["user-id"];

    // Validate userId
    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing User-Id header",
      });
    }

    // Check if user exists in User model
    let user = await User.findById(userId);
    if (user) {
      // Step 1: Delete all posts by the user
      const userPosts = await Post.find({ author: userId });
      const postIds = userPosts.map((post) => post._id);

      // Delete all comments on user's posts
      await Comment.deleteMany({ post: { $in: postIds } });

      // Delete the posts themselves
      await Post.deleteMany({ author: userId });

      // Step 2: Delete all comments made by the user
      await Comment.deleteMany({ author: userId });

      // Step 3: Delete all messages sent or received by the user
      await Message.deleteMany({
        $or: [{ senderId: userId }, { receiverId: userId }],
      });

      // Step 4: Delete all reactions made by the user
      await Reaction.deleteMany({ userId });

      // Step 5: Remove user from other users' followers/following lists
      await User.updateMany(
        { followers: userId },
        { $pull: { followers: userId } }
      );
      await User.updateMany(
        { following: userId },
        { $pull: { following: userId } }
      );

      // Step 6: Remove user from closeFriends, conexmate, and chatUsers lists
      await User.updateMany(
        { closeFriends: userId },
        { $pull: { closeFriends: userId } }
      );
      await User.updateMany(
        { conexmate: userId },
        { $pull: { conexmate: userId } }
      );
      await User.updateMany(
        { chatUsers: userId },
        { $pull: { chatUsers: userId } }
      );

      // Step 7: Remove user from bookmarks and followTimestamps
      await User.updateMany(
        { bookmarks: { $in: postIds } },
        { $pull: { bookmarks: { $in: postIds } } }
      );
      await User.updateMany(
        { "followTimestamps.userId": userId },
        { $pull: { followTimestamps: { userId } } }
      );

      // Step 8: Remove user from likes/dislikes on other posts
      await Post.updateMany({ likes: userId }, { $pull: { likes: userId } });
      await Post.updateMany(
        { dislikes: userId },
        { $pull: { dislikes: userId } }
      );

      // Step 9: Delete the user
      await User.findByIdAndDelete(userId);

      // Step 10: Clear cookies (if applicable)
      res.clearCookie("jwt"); // Clear JWT cookie if used

      return res.status(200).json({
        success: true,
        message: "Account deleted successfully",
      });
    }

    // Check if user exists in DisabledAccount model
    user = await DisabledAccount.findById(userId);
    if (user) {
      await DisabledAccount.findByIdAndDelete(userId);
      return res.status(200).json({
        success: true,
        message: "Account deleted successfully",
      });
    }

    res.status(404).json({ success: false, message: "User not found" });
  } catch (error) {
    console.error("Error deleting account:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to delete account",
    });
  }
});

app.post("/api/v1/user/report/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { currentUserId, reason } = req.body;

    // Validate inputs
    if (!currentUserId || !reason) {
      return res.status(400).json({
        success: false,
        message: "Current user ID and report reason are required",
      });
    }

    // Check if both users exist
    const targetUser = await User.findById(userId);
    const reportingUser = await User.findById(currentUserId);

    if (!targetUser || !reportingUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Prevent self-reporting
    if (userId === currentUserId) {
      return res.status(400).json({
        success: false,
        message: "You cannot report yourself",
      });
    }

    // Add report to target user's reports array
    targetUser.reports.push({
      reportedBy: currentUserId,
      reason,
      reportedAt: new Date(),
    });

    await targetUser.save();

    return res.status(200).json({
      success: true,
      message: "User reported successfully",
    });
  } catch (error) {
    console.error("Report User Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to report user",
    });
  }
});

app.get("/api/get-user-database", async (req, res) => {
  const { userId } = req.query;
  try {
    const user = await User.findById(userId); // Example using MongoDB
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
app.post("/user/profession", async (req, res) => {
  try {
    const { userId, profession } = req.body;

    if (!userId || !profession) {
      return res
        .status(400)
        .json({ message: "User ID and profession are required" });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { profession },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "Profession updated successfully", user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});
app.patch("/api/v1/user/profile/username", async (req, res) => {
  try {
    const { username, userId } = req.body;

    // Validate input
    if (!username || !userId) {
      return res.status(400).json({
        success: false,
        message: "Username and userId are required",
      });
    }

    // Check if username is already taken
    const existingUser = await User.findOne({ username });
    if (existingUser && existingUser._id.toString() !== userId) {
      return res.status(400).json({
        success: false,
        message: "Username already taken",
      });
    }

    // Find and update user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Update username
    user.username = username;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Username updated successfully",
      user: {
        username: user.username,
        _id: user._id,
      },
    });
  } catch (error) {
    console.error("Error updating username:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating username",
    });
  }
});
app.patch("/api/v1/user/profile/name", async (req, res) => {
  try {
    const { name, userId } = req.body;

    // Validate input
    if (!name || !userId) {
      return res.status(400).json({
        success: false,
        message: "Name and userId are required",
      });
    }

    // Validate name is a non-empty string
    if (typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Name must be a non-empty string",
      });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Update name
    user.name = name.trim();
    user.markModified("name"); // Ensure Mongoose tracks the change
    await user.save({ validateBeforeSave: true, w: "majority" });

    // Verify update in database
    const updatedUser = await User.findById(userId).select("name");

    return res.status(200).json({
      success: true,
      message: "Name updated successfully",
      user: {
        name: user.name,
        _id: user._id,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error while updating name",
      error: error.message,
    });
  }
});
app.get("/notification-profiles/:userId", async (req, res) => {
  try {
    console.log("jeje", req.params.userId);
    const user = await User.findById(req.params.userId).select(
      "username name profilePicture blueTick"
    );
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({
      blueTick: user.blueTick,
      username: user.username,
      name: user.name,
      profilePicture: user.profilePicture || "https://via.placeholder.com/40",
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).json({ error: "Server error" });
  }
});
app.get("/full/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate ObjectId
    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Error fetching full user profile:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Post a note without authMiddleware
app.post("/api/notes", async (req, res) => {
  try {
    const { userId, content } = req.body;

    if (!content || content.length > 280) {
      return res.status(400).json({
        error: "Note content is required and must be 280 characters or less",
      });
    }

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.note = content;
    user.noteCreatedAt = new Date();
    user.notePresent = true;
    await user.save();

    res.status(200).json({ message: "Note posted successfully" });
  } catch (error) {
    console.error("Error posting note:", error);
    res.status(500).json({ error: "Server error: " + error.message });
  }
});

// Get a user's note (only return if not expired)
app.get("/notes/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select(
      "name username profilePicture note noteCreatedAt blueTick"
    );
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if note is expired (older than 24 hours)
    if (user.note && user.noteCreatedAt) {
      const now = new Date();
      const hoursSinceCreation =
        (now - new Date(user.noteCreatedAt)) / (1000 * 60 * 60);
      if (hoursSinceCreation > 24) {
        user.note = "";
        user.noteCreatedAt = null;
        await user.save();
      }
    }

    res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching notes:", error);
    res.status(500).json({ error: "Server error: " + error.message });
  }
});

// Delete a note
app.delete("/api/notes/delete-note", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.note) {
      return res.status(400).json({ error: "No note to delete" });
    }

    user.note = "";
    user.notePresent = false;

    user.noteCreatedAt = null;
    await user.save();

    res.status(200).json({ message: "Note deleted successfully" });
  } catch (error) {
    console.error("Error deleting note:", error);
    res.status(500).json({ error: "Server error: " + error.message });
  }
});

// Schedule cleanup of expired notes (runs every hour)
schedule("0 * * * *", async () => {
  try {
    const users = await User.find({
      note: { $ne: "" },
      noteCreatedAt: { $ne: null },
    });
    const now = new Date();
    for (const user of users) {
      const hoursSinceCreation =
        (now - new Date(user.noteCreatedAt)) / (1000 * 60 * 60);
      if (hoursSinceCreation > 24) {
        user.note = "";
        user.noteCreatedAt = null;
        await user.save();
        console.log(`Cleared expired note for user ${user._id}`);
      }
    }
  } catch (error) {
    console.error("Error cleaning up expired notes:", error);
  }
});

// Add user to chat list
app.post("/api/v1/user/chat-user/add", async (req, res) => {
  try {
    const { userId, currentUserId } = req.body;
    if (!userId || !currentUserId) {
      return res.status(400).json({
        success: false,
        message: "User ID and Current User ID are required",
      });
    }

    if (userId === currentUserId) {
      return res.status(400).json({
        success: false,
        message: "Cannot add yourself to chat list",
      });
    }

    const targetUser = await User.findById(userId).select(
      "username profilePicture activityStatus blueTick"
    );
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const currentUser = await User.findById(currentUserId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "Current user not found",
      });
    }

    if (currentUser.chatUsers.includes(userId)) {
      return res.status(200).json({
        success: true,
        message: "User already in your chat list",
      });
    }

    currentUser.chatUsers.push(userId);
    await currentUser.save();

    return res.status(201).json({
      success: true,
      message: "User added to chat list",
      chatUser: {
        _id: targetUser._id,
        username: targetUser.username,
        profilePicture: targetUser.profilePicture,
        activityStatus: targetUser.activityStatus,
        blueTick: targetUser.blueTick,
      },
    });
  } catch (error) {
    console.error("Error adding chat user:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// Fetch all users
app.get("/all-users", async (req, res) => {
  try {
    console.log("req agai h bhai");
    const users = await User.find({}).select(
      "_id username profilePicture activityStatus blueTick name"
    );
    res.status(200).json({ success: true, users });
  } catch (error) {
    console.error("Error fetching all users:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Fetch user profile
app.get("/api/v1/user/profile/:id", getUserProfile);

// Delete user messages
app.delete("/api/v1/conversation/:userId/user-messages", async (req, res) => {
  try {
    const userId = req.body.userId;
    const otherUserId = req.params.userId;

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

    const result = await Message.deleteMany({
      senderId: userId,
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

// Send message endpoint with Socket.IO integration
app.post("/api/v1/message/send/:receiverId", async (req, res) => {
  try {
    const { receiverId } = req.params;
    const { message, image } = req.body;
    const userId = req.headers["user-id"]; // Assuming user-id is passed in headers

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "User ID is required" });
    }

    if (!message && !image && !req.body.audio) {
      return res
        .status(400)
        .json({ success: false, message: "Message or media is required" });
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res
        .status(404)
        .json({ success: false, message: "Receiver not found" });
    }

    const newMessage = new Message({
      senderId: userId,
      receiverId,
      message: message || "",
      image: image || "",
      timestamp: new Date(),
    });

    await newMessage.save();

    // Update or create conversation
    let conversation = await Conversation.findOne({
      participants: { $all: [userId, receiverId] },
    });

    if (!conversation) {
      conversation = new Conversation({
        participants: [userId, receiverId],
        messages: [newMessage._id],
      });
    } else {
      conversation.messages.push(newMessage._id);
    }
    await conversation.save();

    // Emit the new message to both sender and receiver
    io.to(userId).to(receiverId).emit("newMessage", {
      _id: newMessage._id,
      senderId: newMessage.senderId,
      receiverId: newMessage.receiverId,
      message: newMessage.message,
      image: newMessage.image,
      timestamp: newMessage.timestamp,
    });

    res.status(201).json({
      success: true,
      newMessage: {
        _id: newMessage._id,
        senderId: newMessage.senderId,
        receiverId: newMessage.receiverId,
        message: newMessage.message,
        image: newMessage.image,
        timestamp: newMessage.timestamp,
      },
    });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Other existing routes (omitted for brevity, but kept as in your original code)
app.get("/api/v1/post/liked-posts/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    const likedPosts = await Post.find({ likes: userId })
      .populate("author", "username profilePicture")
      .sort({ createdAt: -1 });
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

app.get("/api/v1/post/disliked-posts/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    const dislikedPosts = await Post.find({ dislikes: userId })
      .populate("author", "username profilePicture")
      .sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      posts: dislikedPosts,
      count: dislikedPosts.length,
    });
  } catch (error) {
    console.error("Error fetching disliked posts:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching disliked posts",
      error: error.message,
    });
  }
});

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

// Reaction routes
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
    const user = await User.findById(userId);
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
    const reaction = await Reaction.findOneAndDelete({ messageId, userId });

    if (!reaction) {
      return res.status(404).json({ error: "Reaction not found" });
    }

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
    const userId = req.body.userId || req.headers["user-id"];
    const messageId = req.params.messageId;

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "User ID is required" });
    }

    const message = await Message.findOne({ _id: messageId, senderId: userId });
    if (!message) {
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

    io.emit("message-deleted", { messageId });
    res.status(200).json({ success: true, message: "Message deleted" });
  } catch (error) {
    console.error("Error deleting message:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

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
      isEdited: true,
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

      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
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
        .maxTimeMS(5000);

      res.json({ success: true, posts });
    } catch (error) {
      console.error("Error fetching user posts:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

app.get("/api/privacy-settings", isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.id).select(
      "hideProfilePosts hideProfileLikedPosts hideProfileDislikedPosts hideProfileSavedPosts"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      settings: {
        hideProfilePosts: user.hideProfilePosts,
        hideProfileLikedPosts: user.hideProfileLikedPosts,
        hideProfileDislikedPosts: user.hideProfileDislikedPosts,
        hideProfileSavedPosts: user.hideProfileSavedPosts,
      },
    });
  } catch (error) {
    console.error("Error fetching privacy settings:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

app.put("/api/privacy-settings", isAuthenticated, async (req, res) => {
  try {
    const {
      hideProfilePosts,
      hideProfileLikedPosts,
      hideProfileDislikedPosts,
      hideProfileSavedPosts,
    } = req.body;

    if (
      typeof hideProfilePosts !== "boolean" ||
      typeof hideProfileLikedPosts !== "boolean" ||
      typeof hideProfileDislikedPosts !== "boolean" ||
      typeof hideProfileSavedPosts !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields must be boolean",
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.id,
      {
        hideProfilePosts,
        hideProfileLikedPosts,
        hideProfileDislikedPosts,
        hideProfileSavedPosts,
      },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      settings: {
        hideProfilePosts: updatedUser.hideProfilePosts,
        hideProfileLikedPosts: updatedUser.hideProfileLikedPosts,
        hideProfileDislikedPosts: updatedUser.hideProfileDislikedPosts,
        hideProfileSavedPosts: updatedUser.hideProfileSavedPosts,
      },
    });
  } catch (error) {
    console.error("Error updating privacy settings:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

app.post("/api/v1/users/close-friend/:id", async (req, res) => {
  try {
    const { id: targetUserId } = req.params;
    const { currentUserId } = req.body;

    if (!targetUserId || !currentUserId) {
      return res.status(400).json({
        success: false,
        message: "Target user ID and current user ID are required",
      });
    }

    const currentUser = await User.findById(currentUserId);
    const targetUser = await User.findById(targetUserId);

    if (!currentUser || !targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const isCloseFriend = currentUser.closeFriends.includes(targetUserId);

    if (!isCloseFriend) {
      if (currentUser.closeFriends.length >= 10) {
        return res.status(400).json({
          success: false,
          message: "Close friend limit reached (10)",
        });
      }
      currentUser.closeFriends.push(targetUserId);
    } else {
      currentUser.closeFriends = currentUser.closeFriends.filter(
        (id) => id.toString() !== targetUserId
      );
    }

    await currentUser.save();

    return res.status(200).json({
      success: true,
      message: isCloseFriend
        ? `Removed ${targetUser.username} from close friends`
        : `Added ${targetUser.username} to close friends`,
      currentUser: {
        ...currentUser.toObject(),
        closeFriends: currentUser.closeFriends,
      },
    });
  } catch (error) {
    console.error("Error in toggleCloseFriend:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

app.get("/api/fetch-url-metadata", async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    const options = { url, timeout: 5000 };
    const { result, error } = await ogs(options);

    if (error || !result.success) {
      return res.status(500).json({
        error: "Failed to fetch metadata",
        details: error || "No metadata available",
      });
    }

    const metadata = {
      title: result.ogTitle || result.twitterTitle || "",
      description: result.ogDescription || result.twitterDescription || "",
      image: result.ogImage?.url || result.twitterImage?.url || "",
      url: result.ogUrl || url,
      domain: new URL(url).hostname,
    };

    res.json(metadata);
  } catch (err) {
    console.error("Error fetching metadata:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// Spotify API setup
const spotifyApi = new SpotifyWebApi({
  clientId: "da8d1f93ccb14af0a6418364fb147d82",
  clientSecret: "90f0da5cfdf24ceb85d33ad2ef24ea4a",
});

const refreshAccessToken = async () => {
  try {
    const data = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(data.body["access_token"]);
    console.log("Access token refreshed");
  } catch (err) {
    console.error("Error refreshing access token:", err);
  }
};

app.get("/api/tracks", async (req, res) => {
  try {
    if (!spotifyApi.getAccessToken()) {
      await refreshAccessToken();
    }

    const playlistId = "6FrBYANMlV06qnWLoGZVy5";
    const response = await spotifyApi.getPlaylistTracks(playlistId, {
      limit: 20,
    });

    const tracks = response.body.items.map((item) => item.track);
    res.json(tracks);
  } catch (error) {
    console.error("Error fetching tracks:", error);
    res.status(500).json({ error: "Failed to fetch tracks" });
  }
});

const userSettingsSchema = new mongoose.Schema({
  userId: String,
  deviceType: String,
  brand: String,
  model: String,
  browser: String,
  os: String,
  osVersion: String,
  timestamp: { type: Date, default: Date.now },
});

const UserSettings = mongoose.model("UserSettings", userSettingsSchema);

app.post("/api/update-settings", async (req, res) => {
  try {
    const parser = new UAParser(req.headers["user-agent"]);
    const ua = parser.getResult();
    const deviceType =
      ua.device.type === "mobile" ? "Mobile" : "Laptop/Desktop";
    const brand = ua.device.vendor || "Unknown";
    const model = ua.device.model || "Unknown";
    const userId = req.body.userId || uuidv4();

    const settings = {
      userId,
      deviceType,
      brand,
      model,
      browser: `${ua.browser.name} ${ua.browser.version}` || "Unknown",
      os: ua.os.name || "Unknown",
      osVersion: ua.os.version || "Unknown",
    };

    const newSettings = new UserSettings(settings);
    await newSettings.save();

    res.json({
      userId,
      deviceType,
      brand,
      model,
    });
  } catch (error) {
    console.error("Error in /api/update-settings:", error);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/settings-history/:userId", async (req, res) => {
  try {
    const logins = await UserSettings.find({ userId: req.params.userId }).sort({
      timestamp: -1,
    });
    res.json(logins);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

app.patch("/api/users/:userId/blue-tick", async (req, res) => {
  try {
    const { userId } = req.params;
    const { blueTick } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { blueTick },
      { new: true }
    );

    if (!updatedUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    res.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/api/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId, "username accountChoice");
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({
      id: user._id,
      username: user.username,
      accountChoice: user.accountChoice,
    });
  } catch (error) {
    console.error("Error fetching user data:", error);
    res.status(500).json({ message: "Server error." });
  }
});

app.put("/account/switch-account/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { accountChoice } = req.body;

    if (!["normal", "professional"].includes(accountChoice)) {
      return res.status(400).json({
        message: "Invalid account choice. Must be 'normal' or 'professional'.",
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { accountChoice },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({
      message: "Account type updated successfully.",
      user: {
        id: user._id,
        username: user.username,
        accountChoice: user.accountChoice,
      },
    });
  } catch (error) {
    console.error("Error updating account type:", error);
    res.status(500).json({ message: "Server error." });
  }
});

app.get("/api/users/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId, "username blueTick accountChoice");
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({
      id: user._id,
      username: user.username,
      blueTick: user.blueTick,
      accountChoice: user.accountChoice,
    });
  } catch (error) {
    console.error("Error fetching user data:", error);
    res.status(500).json({ message: "Server error." });
  }
});

// app.patch("/api/users/:userId/blue-tick", async (req, res) => {
//   try {
//     const { userId } = req.params;
//     const { blueTick } = req.body;

//     if (typeof blueTick !== "boolean") {
//       return res
//         .status(400)
//         .json({ message: "Invalid blueTick value. Must be a boolean." });
//     }

//     const user = await User.findByIdAndUpdate(
//       userId,
//       { blueTick },
//       { new: true, runValidators: true }
//     );

//     if (!user) {
//       return res.status(404).json({ message: "User not found." });
//     }

//     res.status(200).json({
//       message: "Blue tick status updated successfully.",
//       user: {
//         id: user._id,
//         username: user.username,
//         blueTick: user.blueTick,
//       },
//     });
//   } catch (error) {
//     console.error("Error updating blue tick status:", error);
//     res.status(500).json({ message: "Server error." });
//   }
// });
app.patch("/api/users/:userId/blue-tick", async (req, res) => {
  try {
    const { userId } = req.params;
    const { blueTick, application } = req.body;

    // Validate ObjectId
    if (!/^[0-9a-fA-F]{24}$/.test(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Check for reports if requesting blue tick
    if (blueTick && user.reports && user.reports.length > 0) {
      return res.status(403).json({
        success: false,
        message: "Cannot grant blue tick due to active reports",
      });
    }

    // Update blue tick status
    user.blueTick = blueTick;
    if (blueTick && application) {
      user.blueTickApplication = application; // Store application details
    } else if (!blueTick) {
      user.blueTickApplication = null; // Clear application on removal
    }

    const updatedUser = await user.save();

    res.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

fixFeed();
app.get("/api/user/chat-tabs", async (req, res) => {
  try {
    const userId = req.query.userId; // Get userId from query parameter
    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "userId is required" });
    }
    const user = await User.findById(userId).select("chatTabs");
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    res.json({ success: true, chatTabs: user.chatTabs });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// POST route to update chatTabs setting for the user
app.post("/api/user/chat-tabs", async (req, res) => {
  try {
    const { userId, chatTabs } = req.body; // Get userId and chatTabs from body
    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "userId is required" });
    }
    if (typeof chatTabs !== "boolean") {
      return res
        .status(400)
        .json({ success: false, message: "chatTabs must be a boolean" });
    }
    const user = await User.findByIdAndUpdate(
      userId,
      { chatTabs },
      { new: true, runValidators: true }
    ).select("chatTabs");
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    res.json({ success: true, chatTabs: user.chatTabs });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});
const PORT = 8000;
server.listen(PORT, () => {
  connectDB();
  console.log(`Server listening at port ${PORT}`);
  console.log("Server time:", new Date().toISOString());
});

// app.use((req, res, next) => {
//   console.log(`User route hit: ${req.method} ${req.originalUrl}`);
//   next();
// });
// app.use((req, res) => {
//   console.log(`404: Route not found for ${req.method} ${req.url}`);
//   res.status(404).json({
//     success: false,
//     message: "Route not found",
//   });
// });
// app.use((err, req, res, next) => {
//   console.error("Server error:", err.stack);
//   res.status(500).json({
//     success: false,
//     message: "Something went wrong!",
//     error: err.message,
//   });
// });
