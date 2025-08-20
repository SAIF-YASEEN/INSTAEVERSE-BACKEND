import cloudinary from "../utils/cloudinary.js";
import { Post } from "../models/post.model.js";
import { User } from "../models/user.model.js";
import { Comment } from "../models/comment.model.js";
import { getReceiverSocketId, io } from "../socket/socket.js";
import mongoose from "mongoose";
import sharp from "sharp";

export const addNewPost = async (req, res) => {
  try {
    const { caption, categories } = req.body;
    const media = req.file;
    const authorId = req.id;

    if (!media) {
      return res
        .status(400)
        .json({ message: "Media is required", success: false });
    }
    if (!categories) {
      return res
        .status(400)
        .json({ message: "At least one category is required", success: false });
    }

    let categoryArray = categories
      .split(",")
      .map((cat) => cat.trim())
      .filter((cat) => cat !== "");
    if (categoryArray.length < 1) {
      return res.status(400).json({
        message: "At least one valid category is required",
        success: false,
      });
    }
    if (categoryArray.length > 10) {
      return res
        .status(400)
        .json({ message: "Maximum of 10 categories allowed", success: false });
    }

    if (caption && caption.length > 500) {
      return res.status(400).json({
        message: "Caption cannot exceed 500 characters",
        success: false,
      });
    }

    const isVideo = media.mimetype.startsWith("video");
    let mediaUrl, publicId;

    if (isVideo) {
      const fileUri = `data:${media.mimetype};base64,${media.buffer.toString(
        "base64"
      )}`;
      const cloudResponse = await cloudinary.uploader.upload(fileUri, {
        folder: "conexa_videos",
        resource_type: "video",
      });

      if (!cloudResponse?.secure_url) {
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
      const optimizedImageBuffer = await sharp(media.buffer)
        .resize({
          width: 800,
          height: 800,
          fit: "inside",
          withoutEnlargement: true,
        })
        .toFormat("jpeg", { quality: 80 })
        .toBuffer();

      const fileUri = `data:image/jpeg;base64,${optimizedImageBuffer.toString(
        "base64"
      )}`;
      const cloudResponse = await cloudinary.uploader.upload(fileUri, {
        folder: "conexa_images",
        resource_type: "image",
      });

      if (!cloudResponse?.secure_url) {
        return res.status(500).json({
          message: "Failed to upload image to Cloudinary",
          success: false,
        });
      }

      mediaUrl = cloudResponse.secure_url;
      publicId = cloudResponse.public_id;
    }

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

    const user = await User.findById(authorId);
    if (!user) {
      await Post.findByIdAndDelete(post._id);
      return res.status(404).json({
        message: "User not found. Post creation reverted.",
        success: false,
      });
    }

    user.posts.push(post._id);
    await user.save();

    await post.populate({
      path: "author",
      select: "username profilePicture blueTick",
    });

    return res.status(201).json({
      message: `New ${isVideo ? "video" : "image"} post added successfully`,
      post,
      success: true,
    });
  } catch (error) {
    console.error("Error in addNewPost:", error);
    return res.status(error.http_code || 500).json({
      message: error.message || "Something went wrong while adding the post",
      success: false,
    });
  }
};

export const getAllPost = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate({ path: "author", select: "username profilePicture blueTick" })
      .populate({
        path: "comments",
        sort: { createdAt: -1 },
        populate: { path: "author", select: "username profilePicture" },
      });
    const totalPosts = await Post.countDocuments();
    return res.status(200).json({
      posts,
      totalPosts,
      hasMore: skip + posts.length < totalPosts,
      success: true,
    });
  } catch (error) {
    console.error("Error in getAllPost:", error);
    return res
      .status(500)
      .json({ message: "Server error while fetching posts", success: false });
  }
};

export const getUserPost = async (req, res) => {
  try {
    const authorId = req.id;
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const posts = await Post.find({ author: authorId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate({ path: "author", select: "username profilePicture blueTick" })
      .populate({
        path: "comments",
        sort: { createdAt: -1 },
        populate: { path: "author", select: "username profilePicture" },
      });
    const totalPosts = await Post.countDocuments({ author: authorId });
    return res.status(200).json({
      posts,
      totalPosts,
      hasMore: skip + posts.length < totalPosts,
      success: true,
    });
  } catch (error) {
    console.error("Error in getUserPost:", error);
    return res.status(500).json({
      message: "Server error while fetching user posts",
      success: false,
    });
  }
};

export const likePost = async (req, res) => {
  try {
    console.log("post like hitted");

    const userId = req.id;
    const postId = req.params.id;

    const post = await Post.findById(postId);
    if (!post) {
      return res
        .status(404)
        .json({ message: "Post not found", success: false });
    }

    const hasLiked = post.likes.includes(userId);

    const update = {
      $pull: { dislikes: userId },
      ...(hasLiked
        ? { $pull: { likes: userId } }
        : { $addToSet: { likes: userId } }),
    };
    await post.updateOne(update);

    const user = await User.findById(userId).select("username profilePicture");
    if (!user) {
      return res
        .status(404)
        .json({ message: "User not found", success: false });
    }

    await User.updateOne(
      { _id: userId },
      { $addToSet: { feed: { $each: post.categories } } }
    );

    const postOwnerId = post.author.toString();
    if (!hasLiked && postOwnerId !== userId) {
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
      }
    }

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
  try {
    const userId = req.id;
    const postId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res
        .status(400)
        .json({ message: "Invalid post ID", success: false });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res
        .status(404)
        .json({ message: "Post not found", success: false });
    }

    const hasDisliked = post.dislikes.includes(userId);

    const update = {
      $pull: { likes: userId },
      ...(hasDisliked
        ? { $pull: { dislikes: userId } }
        : { $addToSet: { dislikes: userId } }),
    };
    await post.updateOne(update);

    const user = await User.findById(userId).select("username profilePicture");
    if (!user) {
      return res
        .status(404)
        .json({ message: "User not found", success: false });
    }

    const postOwnerId = post.author.toString();
    if (!hasDisliked && postOwnerId !== userId) {
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
      }
    }

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
  try {
    const { postId } = req.body;
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res
        .status(400)
        .json({ message: "Invalid post ID", success: false });
    }

    const post = await Post.findById(postId).populate(
      "dislikes",
      "username profilePicture"
    );
    if (!post) {
      return res
        .status(404)
        .json({ message: "Post not found", success: false });
    }
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
  try {
    const postId = req.params.id;
    const userId = req.id;
    const { text } = req.body;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res
        .status(400)
        .json({ message: "Invalid post ID", success: false });
    }
    if (!text) {
      return res
        .status(400)
        .json({ message: "Text is required", success: false });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res
        .status(404)
        .json({ message: "Post not found", success: false });
    }

    const comment = await Comment.create({
      text,
      author: userId,
      post: postId,
    });

    await comment.populate({
      path: "author",
      select: "username profilePicture",
    });

    post.comments.push(comment._id);
    await post.updateOne({ $set: { comments: post.comments } });

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
  try {
    const postId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res
        .status(400)
        .json({ message: "Invalid post ID", success: false });
    }

    const comments = await Comment.find({ post: postId }).populate(
      "author",
      "username profilePicture blueTick"
    );
    if (!comments.length) {
      return res
        .status(404)
        .json({ message: "No comments found for this post", success: false });
    }

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
  try {
    const postId = req.params.id;
    const authorId = req.id;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res
        .status(400)
        .json({ message: "Invalid post ID", success: false });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res
        .status(404)
        .json({ message: "Post not found", success: false });
    }

    if (post.author.toString() !== authorId) {
      return res.status(403).json({ message: "Unauthorized", success: false });
    }

    if (post.publicId) {
      await cloudinary.uploader.destroy(post.publicId, {
        resource_type: post.type === "video" ? "video" : "image",
      });
    }

    await Post.findByIdAndDelete(postId);
    await Comment.deleteMany({ post: postId });

    const user = await User.findById(authorId);
    user.posts = user.posts.filter((id) => id.toString() !== postId);
    await user.save();

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
  try {
    const postId = req.params.id;
    const userId = req.id;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res
        .status(400)
        .json({ message: "Invalid post ID", success: false });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res
        .status(404)
        .json({ message: "Post not found", success: false });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ message: "User not found", success: false });
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
  try {
    const { id: postId } = req.params; // Use postId from URL params
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res
        .status(400)
        .json({ message: "Invalid post ID", success: false });
    }

    const post = await Post.findById(postId).select(
      "likes dislikes comments shareCount viewCount"
    );
    if (!post) {
      return res
        .status(404)
        .json({ message: "Post not found", success: false });
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
    console.error("Error in getPostStats:", error);
    return res.status(500).json({
      message: "Server error while fetching post stats",
      success: false,
    });
  }
};
export const sharePost = async (req, res) => {
  try {
    const { postId } = req.body;
    const { userId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res
        .status(400)
        .json({ message: "Invalid post ID", success: false });
    }
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res
        .status(400)
        .json({ message: "Invalid or missing userId", success: false });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res
        .status(404)
        .json({ message: "Post not found", success: false });
    }

    post.shareCount += 1;
    await post.updateOne({ $set: { shareCount: post.shareCount } });

    const user = await User.findById(userId).select("username profilePicture");
    if (!user) {
      return res
        .status(404)
        .json({ message: "User not found", success: false });
    }

    const postOwnerId = post.author.toString();
    if (postOwnerId !== userId) {
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
      }
    }

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
  try {
    const { postId } = req.body;
    const { userId } = req.body;
    console.log(postId, "is viewed by", userId);
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res
        .status(400)
        .json({ message: "Invalid post ID", success: false });
    }
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res
        .status(400)
        .json({ message: "Invalid or missing userId", success: false });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res
        .status(404)
        .json({ message: "Post not found", success: false });
    }

    post.viewCount += 1;
    await post.updateOne({ $set: { viewCount: post.viewCount } });

    const user = await User.findById(userId).select("username profilePicture");
    if (!user) {
      return res
        .status(404)
        .json({ message: "User not found", success: false });
    }

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
  try {
    const { page = 1, limit = 10 } = req.query; // Default to page 1, limit 10
    const sort = req.query.sort === "createdAt" ? { createdAt: -1 } : {};
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const posts = await Post.find({ type: "video" })
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate("author", "username profilePicture blueTick");

    const totalPosts = await Post.countDocuments({ type: "video" });

    return res.status(200).json({
      message: "Reels fetched successfully",
      posts,
      totalPosts,
      hasMore: skip + posts.length < totalPosts,
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
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res
        .status(400)
        .json({ message: "Invalid user ID", success: false });
    }

    const user = await User.findById(userId).select("following");
    if (!user) {
      return res
        .status(404)
        .json({ message: "User not found", success: false });
    }

    const posts = await Post.find({
      type: "video",
      author: { $in: user.following },
    }).populate("author", "username profilePicture blueTick");
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
  try {
    const posts = await Post.find({ type: "video" })
      .sort({ viewCount: -1, likes: -1 })
      .limit(20)
      .populate("author", "username profilePicture blueTick");
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
  try {
    const { postId } = req.params;
    const { userId, reason, postIdBody } = req.body;
    console.log(postIdBody);

    if (!reason) {
      return res
        .status(400)
        .json({ message: "Reason required", success: false });
    }

    const post = await Post.findById(postId || postIdBody);
    if (!post) {
      return res
        .status(404)
        .json({ message: "Post not found", success: false });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ message: "User not found", success: false });
    }

    post.reports.push({ user: userId, reason });
    await post.updateOne({ $set: { reports: post.reports } });

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

export const getMaxMetrics = async (req, res) => {
  try {
    console.log("metrcis req reached to backend")
    // Aggregate to find the maximum values for each metric
    const metrics = await Post.aggregate([
      {
        $facet: {
          maxViews: [
            { $sort: { viewCount: -1 } },
            { $limit: 1 },
            { $project: { viewCount: 1 } },
          ],
          maxLikes: [
            { $project: { likesCount: { $size: "$likes" } } },
            { $sort: { likesCount: -1 } },
            { $limit: 1 },
            { $project: { likesCount: 1 } },
          ],
          maxDislikes: [
            { $project: { dislikesCount: { $size: "$dislikes" } } },
            { $sort: { dislikesCount: -1 } },
            { $limit: 1 },
            { $project: { dislikesCount: 1 } },
          ],
          maxShares: [
            { $sort: { shareCount: -1 } },
            { $limit: 1 },
            { $project: { shareCount: 1 } },
          ],
          maxComments: [
            { $project: { commentsCount: { $size: "$comments" } } },
            { $sort: { commentsCount: -1 } },
            { $limit: 1 },
            { $project: { commentsCount: 1 } },
          ],
          maxReports: [
            { $project: { reportsCount: { $size: "$reports" } } },
            { $sort: { reportsCount: -1 } },
            { $limit: 1 },
            { $project: { reportsCount: 1 } },
          ],
        },
      },
      {
        $project: {
          maxViews: { $arrayElemAt: ["$maxViews.viewCount", 0] },
          maxLikes: { $arrayElemAt: ["$maxLikes.likesCount", 0] },
          maxDislikes: { $arrayElemAt: ["$maxDislikes.dislikesCount", 0] },
          maxShares: { $arrayElemAt: ["$maxShares.shareCount", 0] },
          maxComments: { $arrayElemAt: ["$maxComments.commentsCount", 0] },
          maxReports: { $arrayElemAt: ["$maxReports.reportsCount", 0] },
        },
      },
    ]);

    // Extract the first result from the aggregation
    const maxMetrics = metrics[0] || {
      maxViews: 0,
      maxLikes: 0,
      maxDislikes: 0,
      maxShares: 0,
      maxComments: 0,
      maxReports: 0,
    };

    return res.status(200).json({
      message: "Max metrics fetched successfully",
      maxMetrics,
      success: true,
    });
  } catch (error) {
    console.error("Error in getMaxMetrics:", error);
    return res.status(500).json({
      message: "Server error while fetching max metrics",
      success: false,
    });
  }
};
