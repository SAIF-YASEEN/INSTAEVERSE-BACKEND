import cloudinary from "../utils/cloudinary.js";
import { Post } from "../models/post.model.js";
import { User } from "../models/user.model.js";
import { Comment } from "../models/comment.model.js";
import { getReceiverSocketId, io } from "../socket/socket.js";
import mongoose from "mongoose";
import sharp from "sharp";

export const addNewPost = async (req, res) => {
  console.log("Route hit: POST /api/v1/posts/addpost");
  try {
    const { caption, categories } = req.body;
    const media = req.file;
    const authorId = req.id;

    console.log("Received form data:", {
      caption,
      categories,
      hasFile: !!media,
    });

    if (!media) {
      console.log("Validation failed: Media is required");
      return res
        .status(400)
        .json({ message: "Media is required", success: false });
    }
    if (!categories) {
      console.log("Validation failed: At least one category is required");
      return res
        .status(400)
        .json({ message: "At least one category is required", success: false });
    }

    let categoryArray = categories
      .split(",")
      .map((cat) => cat.trim())
      .filter((cat) => cat !== "");
    if (categoryArray.length < 1) {
      console.log("Validation failed: At least one valid category is required");
      return res.status(400).json({
        message: "At least one valid category is required",
        success: false,
      });
    }
    if (categoryArray.length > 10) {
      console.log("Validation failed: Maximum of 10 categories allowed");
      return res
        .status(400)
        .json({ message: "Maximum of 10 categories allowed", success: false });
    }

    if (caption && caption.length > 500) {
      console.log("Validation failed: Caption cannot exceed 500 characters");
      return res.status(400).json({
        message: "Caption cannot exceed 500 characters",
        success: false,
      });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    console.log(
      "Generated Cloudinary timestamp:",
      new Date(timestamp * 1000).toISOString()
    );

    const isVideo = media.mimetype.startsWith("video");
    let mediaUrl, publicId;

    if (isVideo) {
      console.log("Uploading video to Cloudinary...");
      const fileUri = `data:${media.mimetype};base64,${media.buffer.toString(
        "base64"
      )}`;
      const cloudResponse = await cloudinary.uploader.upload(fileUri, {
        folder: "conexa_videos",
        resource_type: "video",
        timestamp: timestamp,
      });

      if (!cloudResponse?.secure_url) {
        console.log("Cloudinary upload failed: No secure_url returned");
        return res.status(500).json({
          message: "Failed to upload video to Cloudinary",
          success: false,
        });
      }

      mediaUrl = cloudResponse.secure_url;
      publicId = cloudResponse.public_id;

      if (!categoryArray.includes("video")) {
        categoryArray.push("video");
      }
    } else {
      console.log("Optimizing image with sharp...");
      const optimizedImageBuffer = await sharp(media.buffer)
        .resize({
          width: 800,
          height: 800,
          fit: "inside",
          withoutEnlargement: true,
        })
        .toFormat("jpeg", { quality: 80 })
        .toBuffer();

      console.log("Uploading image to Cloudinary...");
      const fileUri = `data:image/jpeg;base64,${optimizedImageBuffer.toString(
        "base64"
      )}`;
      const cloudResponse = await cloudinary.uploader.upload(fileUri, {
        folder: "conexa_images",
        resource_type: "image",
        timestamp: timestamp,
      });

      if (!cloudResponse?.secure_url) {
        console.log("Cloudinary upload failed: No secure_url returned");
        return res.status(500).json({
          message: "Failed to upload image to Cloudinary",
          success: false,
        });
      }

      mediaUrl = cloudResponse.secure_url;
      publicId = cloudResponse.public_id;
    }

    console.log("Creating new post in database...");
    const post = await Post.create({
      caption: caption || "",
      media: mediaUrl, // Keep for backward compatibility
      [isVideo ? "video" : "image"]: mediaUrl, // Save URL in video or image field
      publicId,
      type: isVideo ? "video" : "image",
      author: authorId,
      categories: categoryArray,
      likes: [],
      dislikes: [],
      comments: [],
      viewCount: 0,
      shareCount: 0,
      reports: [],
    });

    console.log("Updating user's posts array...");
    const user = await User.findById(authorId);
    if (!user) {
      console.log("User not found, reverting post creation");
      await Post.findByIdAndDelete(post._id);
      return res.status(404).json({
        message: "User not found. Post creation reverted.",
        success: false,
      });
    }

    user.posts.push(post._id);
    await user.save();

    console.log("Populating post author...");
    await post.populate({
      path: "author",
      select: "username profilePicture blueTick",
    });

    console.log(
      `Post created successfully: ${isVideo ? "video" : "image"} post`
    );
    return res.status(201).json({
      message: `New ${isVideo ? "video" : "image"} post added successfully`,
      post,
      success: true,
    });
  } catch (error) {
    console.error("Error in addNewPost:", {
      message: error.message,
      name: error.name,
      http_code: error.http_code,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    return res.status(error.http_code || 500).json({
      message: error.message || "Something went wrong while adding the post",
      success: false,
      errorDetails: {
        type: error.name,
        http_code: error.http_code,
      },
    });
  }
};

export const getAllPost = async (req, res) => {
  console.log("Route hit: GET /api/v1/posts/all");
  try {
    console.log("Fetching all posts...");
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .populate({ path: "author", select: "username profilePicture blueTick" })
      .populate({
        path: "comments",
        sort: { createdAt: -1 },
        populate: { path: "author", select: "username profilePicture" },
      });
    console.log(`Fetched ${posts.length} posts`);
    return res.status(200).json({ posts, success: true });
  } catch (error) {
    console.error("Error in getAllPost:", error);
    return res
      .status(500)
      .json({ message: "Server error while fetching posts", success: false });
  }
};

export const getUserPost = async (req, res) => {
  console.log("Route hit: GET /api/v1/posts/userpost/all");
  try {
    const authorId = req.id;
    console.log(`Fetching posts for user: ${authorId}`);
    const posts = await Post.find({ author: authorId })
      .sort({ createdAt: -1 })
      .populate({ path: "author", select: "username profilePicture blueTick" })
      .populate({
        path: "comments",
        sort: { createdAt: -1 },
        populate: { path: "author", select: "username profilePicture" },
      });
    console.log(`Fetched ${posts.length} user posts`);
    return res.status(200).json({ posts, success: true });
  } catch (error) {
    console.error("Error in getUserPost:", error);
    return res.status(500).json({
      message: "Server error while fetching user posts",
      success: false,
    });
  }
};

export const likePost = async (req, res) => {
  console.log("Route hit: GET /api/v1/posts/:id/like");
  try {
    const userId = req.id;
    const postId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      console.log("Validation failed: Invalid post ID");
      return res
        .status(400)
        .json({ message: "Invalid post ID", success: false });
    }

    console.log(`Fetching post: ${postId}`);
    const post = await Post.findById(postId);
    if (!post) {
      console.log("Post not found");
      return res
        .status(404)
        .json({ message: "Post not found", success: false });
    }

    const hasLiked = post.likes.includes(userId);
    console.log(
      `User ${userId} has ${
        hasLiked ? "already liked" : "not liked"
      } post ${postId}`
    );

    const update = {
      $pull: { dislikes: userId },
      ...(hasLiked
        ? { $pull: { likes: userId } }
        : { $addToSet: { likes: userId } }),
    };
    console.log("Updating post with:", update);
    await post.updateOne(update);

    console.log(`Fetching user: ${userId}`);
    const user = await User.findById(userId).select("username profilePicture");
    if (!user) {
      console.log("User not found");
      return res
        .status(404)
        .json({ message: "User not found", success: false });
    }

    console.log("Updating user feed...");
    await User.updateOne(
      { _id: userId },
      { $addToSet: { feed: { $each: post.categories } } }
    );

    const postOwnerId = post.author.toString();
    if (!hasLiked && postOwnerId !== userId) {
      console.log(`Sending like notification to post owner: ${postOwnerId}`);
      const notification = {
        type: "like",
        userId: userId,
        userDetails: {
          username: user.username,
          profilePicture:
            user.profilePicture || "https://example.com/default-avatar.jpg",
        },
        postId,
        postImage: post.media,
        message: "Your post was liked",
        timestamp: new Date().toISOString(),
      };
      const postOwnerSocketId = getReceiverSocketId(postOwnerId);
      if (io && postOwnerSocketId) {
        io.to(postOwnerSocketId).emit("notification", notification);
        console.log("Notification sent via Socket.IO");
      } else {
        console.warn("Socket.IO not initialized or no socket for post owner");
      }
    }

    console.log(`Post ${hasLiked ? "unliked" : "liked"} successfully`);
    return res.status(200).json({
      message: hasLiked ? "Like removed" : "Post liked successfully",
      likes: hasLiked ? post.likes.length - 1 : post.likes.length + 1,
      success: true,
    });
  } catch (error) {
    console.error("Error in likePost:", error);
    return res
      .status(500)
      .json({ message: "Server error while liking post", success: false });
  }
};

export const dislikePost = async (req, res) => {
  console.log("Route hit: GET /api/v1/posts/:id/dislike");
  try {
    const userId = req.id;
    const postId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      console.log("Validation failed: Invalid post ID");
      return res
        .status(400)
        .json({ message: "Invalid post ID", success: false });
    }

    console.log(`Fetching post: ${postId}`);
    const post = await Post.findById(postId);
    if (!post) {
      console.log("Post not found");
      return res
        .status(404)
        .json({ message: "Post not found", success: false });
    }

    const hasDisliked = post.dislikes.includes(userId);
    console.log(
      `User ${userId} has ${
        hasDisliked ? "already disliked" : "not disliked"
      } post ${postId}`
    );

    const update = {
      $pull: { likes: userId },
      ...(hasDisliked
        ? { $pull: { dislikes: userId } }
        : { $addToSet: { dislikes: userId } }),
    };
    console.log("Updating post with:", update);
    await post.updateOne(update);

    console.log(`Fetching user: ${userId}`);
    const user = await User.findById(userId).select("username profilePicture");
    if (!user) {
      console.log("User not found");
      return res
        .status(404)
        .json({ message: "User not found", success: false });
    }

    const postOwnerId = post.author.toString();
    if (!hasDisliked && postOwnerId !== userId) {
      console.log(`Sending dislike notification to post owner: ${postOwnerId}`);
      const notification = {
        type: "dislike",
        userId: userId,
        userDetails: {
          username: user.username,
          profilePicture: user.profilePicture,
        },
        postId,
        message: "Your post was disliked",
        timestamp: new Date().toISOString(),
      };
      const postOwnerSocketId = getReceiverSocketId(postOwnerId);
      if (io && postOwnerSocketId) {
        io.to(postOwnerSocketId).emit("notification", notification);
        console.log("Notification sent via Socket.IO");
      } else {
        console.warn("Socket.IO not initialized or no socket for post owner");
      }
    }

    console.log(`Post ${hasDisliked ? "undisliked" : "disliked"} successfully`);
    return res.status(200).json({
      message: hasDisliked ? "Dislike removed" : "Post disliked successfully",
      dislikes: hasDisliked
        ? post.dislikes.length - 1
        : post.dislikes.length + 1,
      success: true,
    });
  } catch (error) {
    console.error("Error in dislikePost:", error);
    return res
      .status(500)
      .json({ message: "Server error while disliking post", success: false });
  }
};

export const getDislikesOfPost = async (req, res) => {
  console.log("Route hit: POST /api/v1/posts/:id/dislikes");
  try {
    const { postId } = req.body;
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      console.log("Validation failed: Invalid post ID");
      return res
        .status(400)
        .json({ message: "Invalid post ID", success: false });
    }

    console.log(`Fetching dislikes for post: ${postId}`);
    const post = await Post.findById(postId).populate(
      "dislikes",
      "username profilePicture"
    );
    if (!post) {
      console.log("Post not found");
      return res
        .status(404)
        .json({ message: "Post not found", success: false });
    }
    console.log(`Fetched ${post.dislikes.length} dislikes`);
    return res.status(200).json({ users: post.dislikes, success: true });
  } catch (error) {
    console.error("Error in getDislikesOfPost:", error);
    return res.status(500).json({
      message: "Server error while fetching dislikes",
      success: false,
    });
  }
};

export const addComment = async (req, res) => {
  console.log("Route hit: POST /api/v1/posts/:id/comment");
  try {
    const postId = req.params.id;
    const userId = req.id;
    const { text } = req.body;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      console.log("Validation failed: Invalid post ID");
      return res
        .status(400)
        .json({ message: "Invalid post ID", success: false });
    }
    if (!text) {
      console.log("Validation failed: Text is required");
      return res
        .status(400)
        .json({ message: "Text is required", success: false });
    }

    console.log(`Fetching post: ${postId}`);
    const post = await Post.findById(postId);
    if (!post) {
      console.log("Post not found");
      return res
        .status(404)
        .json({ message: "Post not found", success: false });
    }

    console.log("Creating new comment...");
    const comment = await Comment.create({
      text,
      author: userId,
      post: postId,
    });

    console.log("Populating comment author...");
    await comment.populate({
      path: "author",
      select: "username profilePicture",
    });

    console.log("Adding comment to post...");
    post.comments.push(comment._id);
    await post.updateOne({ $set: { comments: post.comments } });

    console.log("Comment added successfully");
    return res.status(201).json({
      message: "Comment added successfully",
      comment,
      success: true,
    });
  } catch (error) {
    console.error("Error in addComment:", error);
    return res
      .status(500)
      .json({ message: "Server error while adding comment", success: false });
  }
};

export const getCommentsOfPost = async (req, res) => {
  console.log("Route hit: POST /api/v1/posts/:id/comment/all");
  try {
    const postId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      console.log("Validation failed: Invalid post ID");
      return res
        .status(400)
        .json({ message: "Invalid post ID", success: false });
    }

    console.log(`Fetching comments for post: ${postId}`);
    const comments = await Comment.find({ post: postId }).populate(
      "author",
      "username profilePicture"
    );
    if (!comments.length) {
      console.log("No comments found");
      return res
        .status(404)
        .json({ message: "No comments found for this post", success: false });
    }

    console.log(`Fetched ${comments.length} comments`);
    return res.status(200).json({ success: true, comments });
  } catch (error) {
    console.error("Error in getCommentsOfPost:", error);
    return res.status(500).json({
      message: "Server error while fetching comments",
      success: false,
    });
  }
};

export const deletePost = async (req, res) => {
  console.log("Route hit: DELETE /api/v1/posts/delete/:id");
  try {
    const postId = req.params.id;
    const authorId = req.id;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      console.log("Validation failed: Invalid post ID");
      return res
        .status(400)
        .json({ message: "Invalid post ID", success: false });
    }

    console.log(`Fetching post: ${postId}`);
    const post = await Post.findById(postId);
    if (!post) {
      console.log("Post not found");
      return res
        .status(404)
        .json({ message: "Post not found", success: false });
    }

    if (post.author.toString() !== authorId) {
      console.log("Unauthorized: User is not the post author");
      return res.status(403).json({ message: "Unauthorized", success: false });
    }

    if (post.publicId) {
      console.log(`Deleting media from Cloudinary: ${post.publicId}`);
      await cloudinary.uploader.destroy(post.publicId, {
        resource_type: post.type === "video" ? "video" : "image",
      });
    }

    console.log("Deleting post and associated comments...");
    await Post.findByIdAndDelete(postId);
    await Comment.deleteMany({ post: postId });

    console.log(`Removing post from user: ${authorId}`);
    const user = await User.findById(authorId);
    user.posts = user.posts.filter((id) => id.toString() !== postId);
    await user.save();

    console.log("Post deleted successfully");
    return res
      .status(200)
      .json({ message: "Post deleted successfully", success: true });
  } catch (error) {
    console.error("Error in deletePost:", error);
    return res
      .status(500)
      .json({ message: "Server error while deleting post", success: false });
  }
};

export const bookmarkPost = async (req, res) => {
  console.log("Route hit: GET /api/v1/posts/:id/bookmark");
  try {
    const postId = req.params.id;
    const userId = req.id;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      console.log("Validation failed: Invalid post ID");
      return res
        .status(400)
        .json({ message: "Invalid post ID", success: false });
    }

    console.log(`Fetching post: ${postId}`);
    const post = await Post.findById(postId);
    if (!post) {
      console.log("Post not found");
      return res
        .status(404)
        .json({ message: "Post not found", success: false });
    }

    console.log(`Fetching user: ${userId}`);
    const user = await User.findById(userId);
    if (!user) {
      console.log("User not found");
      return res
        .status(404)
        .json({ message: "User not found", success: false });
    }

    const hasBookmarked = user.bookmarks.includes(postId);
    console.log(
      `User ${userId} has ${
        hasBookmarked ? "already bookmarked" : "not bookmarked"
      } post ${postId}`
    );
    if (hasBookmarked) {
      user.bookmarks = user.bookmarks.filter(
        (id) => id.toString() !== postId.toString()
      );
    } else {
      user.bookmarks.push(postId);
    }
    await user.save();

    console.log(
      `Post ${hasBookmarked ? "unbookmarked" : "bookmarked"} successfully`
    );
    return res.status(200).json({
      message: hasBookmarked
        ? "Bookmark removed"
        : "Post bookmarked successfully",
      type: hasBookmarked ? "unsaved" : "saved",
      success: true,
    });
  } catch (error) {
    console.error("Error in bookmarkPost:", error);
    return res
      .status(500)
      .json({ message: "Server error while bookmarking post", success: false });
  }
};

export const getPostStats = async (req, res) => {
  console.log("Route hit: GET /api/v1/posts/stats");
  try {
    const { postId } = req.body;
    console.log(postId)
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      console.log("Validation failed: Invalid post ID");
      return res
        .status(400)
        .json({ message: "Invalid post ID", success: false });
    }

    console.log(`Fetching stats for post: ${postId}`);
    const post = await Post.findById(postId).select(
      "likes dislikes comments shareCount viewCount"
    );
    if (!post) {
      console.log("Post not found");
      return res
        .status(404)
        .json({ message: "Post not found", success: false });
    }

    console.log("Post stats fetched successfully");
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
    console.error("Error in getPostStats:", error);
    return res.status(500).json({
      message: "Server error while fetching post stats",
      success: false,
    });
  }
};
export const sharePost = async (req, res) => {
  console.log("Route hit: POST /api/v1/posts/:id/share");
  try {
    const { postId } = req.body;
    const { userId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      console.log("Validation failed: Invalid post ID");
      return res
        .status(400)
        .json({ message: "Invalid post ID", success: false });
    }
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      console.log("Validation failed: Invalid or missing user ID");
      return res
        .status(400)
        .json({ message: "Invalid or missing userId", success: false });
    }

    console.log(`Fetching post: ${postId}`);
    const post = await Post.findById(postId);
    if (!post) {
      console.log("Post not found");
      return res
        .status(404)
        .json({ message: "Post not found", success: false });
    }

    console.log("Incrementing share count...");
    post.shareCount += 1;
    await post.updateOne({ $set: { shareCount: post.shareCount } });

    console.log(`Fetching user: ${userId}`);
    const user = await User.findById(userId).select("username profilePicture");
    if (!user) {
      console.log("User not found");
      return res
        .status(404)
        .json({ message: "User not found", success: false });
    }

    const postOwnerId = post.author.toString();
    if (postOwnerId !== userId) {
      console.log(`Sending share notification to post owner: ${postOwnerId}`);
      const notification = {
        type: "share",
        userId: userId,
        userDetails: {
          username: user.username,
          profilePicture: user.profilePicture,
        },
        postId,
        message: "Your post was shared",
        timestamp: new Date().toISOString(),
      };
      const postOwnerSocketId = getReceiverSocketId(postOwnerId);
      if (io && postOwnerSocketId) {
        io.to(postOwnerSocketId).emit("notification", notification);
        console.log("Notification sent via Socket.IO");
      } else {
        console.warn("Socket.IO not initialized or no socket for post owner");
      }
    }

    console.log("Post shared successfully");
    return res.status(200).json({
      message: "Post shared successfully",
      shareCount: post.shareCount,
      success: true,
    });
  } catch (error) {
    console.error("Error in sharePost:", error);
    return res
      .status(500)
      .json({ message: "Server error while sharing post", success: false });
  }
};

export const recordPostView = async (req, res) => {
  console.log("Route hit: POST /api/v1/posts/:id/view");
  try {
    const { postId } = req.body;
    const { userId } = req.body;
    console.log("post", postId);
    console.log("user", userId);
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      console.log("Validation failed: Invalid post ID");
      return res
        .status(400)
        .json({ message: "Invalid post ID", success: false });
    }
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      console.log("Validation failed: Invalid or missing user ID");
      return res
        .status(400)
        .json({ message: "Invalid or missing userId", success: false });
    }

    console.log(`Fetching post: ${postId}`);
    const post = await Post.findById(postId);
    if (!post) {
      console.log("Post not found");
      return res
        .status(404)
        .json({ message: "Post not found", success: false });
    }

    console.log("Incrementing view count...");
    post.viewCount += 1;
    await post.updateOne({ $set: { viewCount: post.viewCount } });

    console.log(`Fetching user: ${userId}`);
    const user = await User.findById(userId).select("username profilePicture");
    if (!user) {
      console.log("User not found");
      return res
        .status(404)
        .json({ message: "User not found", success: false });
    }

    // Notification logic...
    console.log("View recorded successfully");
    return res.status(200).json({
      message: "View recorded successfully",
      viewCount: post.viewCount,
      success: true,
    });
  } catch (error) {
    console.error("Error in recordPostView:", error);
    return res
      .status(500)
      .json({ message: "Server error while recording view", success: false });
  }
};
export const getAllReels = async (req, res) => {
  console.log("Route hit: GET /api/v1/posts/reels");
  try {
    const sort = req.query.sort === "createdAt" ? { createdAt: -1 } : {};
    console.log(`Fetching all reels with sort: ${JSON.stringify(sort)}`);
    const posts = await Post.find({ type: "video" })
      .sort(sort)
      .populate("author", "username profilePicture blueTick");
    console.log(`Fetched ${posts.length} reels`);
    return res.status(200).json({
      message: "Reels fetched successfully",
      posts,
      success: true,
    });
  } catch (error) {
    console.error("Error in getAllReels:", error);
    return res
      .status(500)
      .json({ message: "Server error while fetching reels", success: false });
  }
};

export const getFollowingReels = async (req, res) => {
  console.log("Route hit: GET /api/v1/posts/reels/following/:userId");
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.log("Validation failed: Invalid user ID");
      return res
        .status(400)
        .json({ message: "Invalid user ID", success: false });
    }

    console.log(`Fetching user: ${userId}`);
    const user = await User.findById(userId).select("following");
    if (!user) {
      console.log("User not found");
      return res
        .status(404)
        .json({ message: "User not found", success: false });
    }

    console.log(`Fetching reels from followed users: ${user.following}`);
    const posts = await Post.find({
      type: "video",
      author: { $in: user.following },
    }).populate("author", "username profilePicture blueTick");
    console.log(`Fetched ${posts.length} following reels`);
    return res.status(200).json({
      message: "Following reels fetched successfully",
      posts,
      success: true,
    });
  } catch (error) {
    console.error("Error in getFollowingReels:", error);
    return res.status(500).json({
      message: "Server error while fetching following reels",
      success: false,
    });
  }
};

export const getRelevantReels = async (req, res) => {
  console.log("Route hit: GET /api/v1/posts/reels/relevant");
  try {
    console.log("Fetching relevant reels...");
    const posts = await Post.find({ type: "video" })
      .sort({ viewCount: -1, likes: -1 })
      .limit(20)
      .populate("author", "username profilePicture blueTick");
    console.log(`Fetched ${posts.length} relevant reels`);
    return res.status(200).json({
      message: "Relevant reels fetched successfully",
      posts,
      success: true,
    });
  } catch (error) {
    console.error("Error in getRelevantReels:", error);
    return res.status(500).json({
      message: "Server error while fetching relevant reels",
      success: false,
    });
  }
};

export const reportPost = async (req, res) => {
  console.log("Route hit: POST /api/v1/posts/:id/report");
  try {
    const { postId } = req.params;
    const { userId, reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      console.log("Validation failed: Invalid post ID");
      return res
        .status(400)
        .json({ message: "Invalid post ID", success: false });
    }
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      console.log("Validation failed: Invalid or missing user ID");
      return res
        .status(400)
        .json({ message: "Invalid or missing user ID", success: false });
    }
    if (!reason) {
      console.log("Validation failed: Reason required");
      return res
        .status(400)
        .json({ message: "Reason required", success: false });
    }

    console.log(`Fetching post: ${postId}`);
    const post = await Post.findById(postId);
    if (!post) {
      console.log("Post not found");
      return res
        .status(404)
        .json({ message: "Post not found", success: false });
    }

    console.log(`Fetching user: ${userId}`);
    const user = await User.findById(userId);
    if (!user) {
      console.log("User not found");
      return res
        .status(404)
        .json({ message: "User not found", success: false });
    }

    console.log(`Adding report for post: ${postId} by user: ${userId}`);
    post.reports.push({ user: userId, reason });
    await post.updateOne({ $set: { reports: post.reports } });

    console.log("Post reported successfully");
    return res
      .status(200)
      .json({ message: "Post reported successfully", success: true });
  } catch (error) {
    console.error("Error in reportPost:", error);
    return res
      .status(500)
      .json({ message: "Server error while reporting post", success: false });
  }
};
