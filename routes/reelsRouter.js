import express from "express";
import mongoose from "mongoose";
import { Post } from "../models/post.model.js";
import { User } from "../models/user.model.js";

const postsRouter = express.Router();

// Get post stats
postsRouter.get("/api/v1/posts/:postId/stats", async (req, res) => {
  console.log("Route hit: GET /api/v1/posts/:postId/stats");
  try {
    const { postId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid post ID",
      });
    }

    const post = await Post.findById(postId).select(
      "likes dislikes comments shareCount viewCount"
    );

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Post stats fetched successfully",
      stats: {
        likes: post.likes?.length || 0,
        dislikes: post.dislikes?.length || 0,
        comments: post.comments?.length || 0,
        shares: post.shareCount,
        views: post.viewCount,
      },
    });
  } catch (error) {
    console.error("Error fetching post stats:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching post stats",
    });
  }
});

// Share a post
postsRouter.post("/api/v1/posts/:postId/share", async (req, res) => {
  console.log("Route hit: POST /api/v1/posts/:postId/share");
  try {
    const { postId } = req.params;
    const { userId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid post ID",
      });
    }

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing userId in request body",
      });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    post.shareCount += 1;
    await post.save();

    return res.status(200).json({
      success: true,
      message: "Post shared successfully",
      shareCount: post.shareCount,
    });
  } catch (error) {
    console.error("Error sharing post:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while sharing post",
    });
  }
});

// Record a post view
postsRouter.post("/api/v1/posts/:postId/view", async (req, res) => {
  console.log("Route hit: POST /api/v1/posts/:postId/view");
  try {
    const { postId } = req.params;
    const { userId } = req.body;

    console.log(`Processing view for post ${postId} by user ${userId}`);

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      console.log(`Invalid post ID: ${postId}`);
      return res.status(400).json({
        success: false,
        message: "Invalid post ID",
      });
    }

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      console.log(`Invalid or missing userId: ${userId}`);
      return res.status(400).json({
        success: false,
        message: "Invalid or missing userId in request body",
      });
    }

    const post = await Post.findById(postId);
    if (!post) {
      console.log(`Post not found: ${postId}`);
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    post.viewCount += 1;
    console.log(`Updating post ${postId}: viewCount = ${post.viewCount}`);
    await post.save();

    console.log(`View recorded successfully for post ${postId}`);
    return res.status(200).json({
      success: true,
      message: "View recorded successfully",
      viewCount: post.viewCount,
    });
  } catch (error) {
    console.error(`Error recording view for post ${req.params.postId}:`, error);
    return res.status(500).json({
      success: false,
      message: "Server error while recording view",
    });
  }
});

// Get all video posts (reels)
postsRouter.get("/api/v1/reels", async (req, res) => {
  console.log("Route hit: GET /api/v1/reels");
  try {
    const sort = req.query.sort === "createdAt" ? { createdAt: -1 } : {};
    const posts = await Post.find({ type: "video" })
      .sort(sort)
      .populate("author", "username profilePicture blueTick");

    return res.status(200).json({
      success: true,
      message: "Reels fetched successfully",
      posts,
    });
  } catch (error) {
    console.error("Error fetching reels:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching reels",
    });
  }
});

// Get video posts from followed users
postsRouter.get("/api/v1/reels/following/:userId", async (req, res) => {
  console.log("Route hit: GET /api/v1/reels/following/:userId");
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const user = await User.findById(userId).select("following");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const posts = await Post.find({
      type: "video",
      author: { $in: user.following },
    }).populate("author", "username profilePicture blueTick");

    return res.status(200).json({
      success: true,
      message: "Following reels fetched successfully",
      posts,
    });
  } catch (error) {
    console.error("Error fetching following reels:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching following reels",
    });
  }
});

// Get relevant video posts
postsRouter.get("/api/v1/reels/relevant", async (req, res) => {
  console.log("Route hit: GET /api/v1/reels/relevant");
  try {
    const posts = await Post.find({ type: "video" })
      .sort({ viewCount: -1, likes: -1 })
      .limit(20)
      .populate("author", "username profilePicture blueTick");

    return res.status(200).json({
      success: true,
      message: "Relevant reels fetched successfully",
      posts,
    });
  } catch (error) {
    console.error("Error fetching relevant reels:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching relevant reels",
    });
  }
});

// Report a post
postsRouter.post("/api/v1/posts/:postId/report", async (req, res) => {
  console.log("Route hit: POST /api/v1/posts/:postId/report");
  try {
    const { postId } = req.params;
    const { userId, reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid post ID",
      });
    }

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing user ID",
      });
    }

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Reason required",
      });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    post.reports.push({ user: userId, reason });
    await post.save();

    return res.status(200).json({
      success: true,
      message: "Post reported successfully",
    });
  } catch (error) {
    console.error("Error reporting post:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while reporting post",
    });
  }
});

// Like a post
postsRouter.get("/api/v1/posts/:postId/like", async (req, res) => {
  console.log("Route hit: GET /api/v1/posts/:postId/like");
  try {
    const { postId } = req.params;
    const userId = req.user._id; // Assuming user is attached via middleware

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid post ID",
      });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    const hasLiked = post.likes.includes(userId);
    if (hasLiked) {
      post.likes = post.likes.filter(
        (id) => id.toString() !== userId.toString()
      );
    } else {
      post.likes.push(userId);
      post.dislikes = post.dislikes.filter(
        (id) => id.toString() !== userId.toString()
      );
    }
    await post.save();

    return res.status(200).json({
      success: true,
      message: hasLiked ? "Like removed" : "Post liked successfully",
      likes: post.likes.length,
    });
  } catch (error) {
    console.error("Error liking post:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while liking post",
    });
  }
});

// Dislike a post
postsRouter.get("/api/v1/posts/:postId/dislike", async (req, res) => {
  console.log("Route hit: GET /api/v1/posts/:postId/dislike");
  try {
    const { postId } = req.params;
    const userId = req.user._id; // Assuming user is attached via middleware

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid post ID",
      });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    const hasDisliked = post.dislikes.includes(userId);
    if (hasDisliked) {
      post.dislikes = post.dislikes.filter(
        (id) => id.toString() !== userId.toString()
      );
    } else {
      post.dislikes.push(userId);
      post.likes = post.likes.filter(
        (id) => id.toString() !== userId.toString()
      );
    }
    await post.save();

    return res.status(200).json({
      success: true,
      message: hasDisliked ? "Dislike removed" : "Post disliked successfully",
      dislikes: post.dislikes.length,
    });
  } catch (error) {
    console.error("Error disliking post:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while disliking post",
    });
  }
});

// Bookmark a post
postsRouter.get("/api/v1/posts/:postId/bookmark", async (req, res) => {
  console.log("Route hit: GET /api/v1/posts/:postId/bookmark");
  try {
    const { postId } = req.params;
    const userId = req.user._id; // Assuming user is attached via middleware

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid post ID",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const hasBookmarked = user.bookmarks.includes(postId);
    if (hasBookmarked) {
      user.bookmarks = user.bookmarks.filter(
        (id) => id.toString() !== postId.toString()
      );
    } else {
      user.bookmarks.push(postId);
    }
    await user.save();

    return res.status(200).json({
      success: true,
      message: hasBookmarked
        ? "Bookmark removed"
        : "Post bookmarked successfully",
    });
  } catch (error) {
    console.error("Error bookmarking post:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while bookmarking post",
    });
  }
});

export default postsRouter;
``