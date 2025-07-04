import sharp from "sharp";
import cloudinary from "../utils/cloudinary.js";
import { Post } from "../models/post.model.js";
import { User } from "../models/user.model.js";
import { Comment } from "../models/comment.model.js";
import { getReceiverSocketId, io } from "../socket/socket.js";

export const addNewPost = async (req, res) => {
  try {
    const { caption, categories } = req.body;
    const image = req.file;
    const authorId = req.id;

    // Validate required fields
    if (!image) {
      return res
        .status(400)
        .json({ message: "Image is required", success: false });
    }
    if (!categories) {
      return res
        .status(400)
        .json({ message: "At least one category is required", success: false });
    }

    // Parse and validate categories
    const categoryArray = categories
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

    // Validate caption length
    if (caption && caption.length > 500) {
      return res
        .status(400)
        .json({
          message: "Caption cannot exceed 500 characters",
          success: false,
        });
    }

    // Optimize image with sharp
    const optimizedImageBuffer = await sharp(image.buffer)
      .resize({
        width: 800,
        height: 800,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toFormat("jpeg", { quality: 80 })
      .toBuffer();

    // Convert buffer to data URI
    const fileUri = `data:image/jpeg;base64,${optimizedImageBuffer.toString(
      "base64"
    )}`;

    // Upload to Cloudinary
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

    // Create new post
    const post = await Post.create({
      caption: caption || "",
      image: cloudResponse.secure_url,
      publicId: cloudResponse.public_id,
      author: authorId,
      categories: categoryArray,
      likes: [],
      comments: [],
    });

    // Update user's posts array
    const user = await User.findById(authorId);
    if (!user) {
      await Post.findByIdAndDelete(post._id);
      return res
        .status(404)
        .json({ message: "User not found", success: false });
    }
    user.posts.push(post._id);
    await user.save();

    // Populate author field
    await post.populate({ path: "author", select: "username profilePicture" });

    // Send success response
    return res.status(201).json({
      message: "New post added successfully",
      post,
      success: true,
    });
  } catch (error) {
    console.error("Error in addNewPost:", error);
    if (error instanceof multer.MulterError) {
      return res.status(400).json({
        message: `Multer error: ${error.message}`,
        success: false,
      });
    }
    return res.status(500).json({
      message: error.message || "Something went wrong while adding the post",
      success: false,
    });
  }
};


export const getAllPost = async (req, res) => {
  try {
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .populate({ path: "author", select: "username profilePicture blueTick" })
      .populate({
        path: "comments",
        sort: { createdAt: -1 },
        populate: {
          path: "author",
          select: "username profilePicture",
        },
      });
    return res.status(200).json({
      posts,
      success: true,
    });
  } catch (error) {
    // console.log(error);
  }
};
export const getUserPost = async (req, res) => {
  try {
    const authorId = req.id;
    const posts = await Post.find({ author: authorId })
      .sort({ createdAt: -1 })
      .populate({
        path: "author",
        select: "username, profilePicture",
      })
      .populate({
        path: "comments",
        sort: { createdAt: -1 },
        populate: {
          path: "author",
          select: "username, profilePicture",
        },
      });
    return res.status(200).json({
      posts,
      success: true,
    });
  } catch (error) {
    // console.log(error);
  }
};
// post.controller.js

export const likePost = async (req, res) => {
  try {
    const userId = req.id; // Renamed for consistency
    const postId = req.params.id;
    const post = await Post.findById(postId);
    if (!post) {
      return res
        .status(404)
        .json({ message: "Post not found", success: false });
    }

    // Remove from dislikes if present, add to likes
    await post.updateOne({
      $pull: { dislikes: userId }, // Remove from dislikes
      $addToSet: { likes: userId }, // Add to likes if not already present
    });
    await post.save();

    // Fetch user and update feed
    const user = await User.findById(userId).select(
      "username profilePicture feed"
    );
    await User.updateOne(
      { _id: userId },
      { $addToSet: { feed: { $each: post.categories } } }
    );

    const postOwnerId = post.author.toString();
    if (postOwnerId !== userId) {
      const notification = {
        type: "like",
        userId: userId,
        userDetails: {
          username: user.username,
          profilePicture:
            user.profilePicture || "https://example.com/default-avatar.jpg",
        },
        postId,
        postImage: post.image,
        message: "Your post was liked",
        timestamp: new Date().toISOString(),
      };
      const postOwnerSocketId = getReceiverSocketId(postOwnerId);
      if (io && postOwnerSocketId) {
        io.to(postOwnerSocketId).emit("notification", notification);
      } else {
        console.warn("Socket.IO not initialized or no socket for post owner");
      }
    }

    return res.status(200).json({ message: "Post liked", success: true });
  } catch (error) {
    console.error("Error in likePost:", error.message);
    return res.status(500).json({ message: "Server error", success: false });
  }
};

export const dislikePost = async (req, res) => {
  try {
    const userId = req.id;
    const postId = req.params.id;
    const post = await Post.findById(postId);
    if (!post) {
      return res
        .status(404)
        .json({ message: "Post not found", success: false });
    }

    // Remove from likes if present, add to dislikes
    await post.updateOne({
      $pull: { likes: userId }, // Remove from likes
      $addToSet: { dislikes: userId }, // Add to dislikes if not already present
    });
    await post.save();

    const user = await User.findById(userId).select("username profilePicture");
    const postOwnerId = post.author.toString();
    if (postOwnerId !== userId) {
      const notification = {
        type: "dislike",
        userId: userId,
        userDetails: user,
        postId,
        message: "Your post was disliked",
        timestamp: new Date().toISOString(),
      };
      const postOwnerSocketId = getReceiverSocketId(postOwnerId);
      if (io && postOwnerSocketId) {
        io.to(postOwnerSocketId).emit("notification", notification);
      }
    }

    return res.status(200).json({ message: "Post disliked", success: true });
  } catch (error) {
    console.error("Error in dislikePost:", error.message);
    return res.status(500).json({ message: "Server error", success: false });
  }
};

export const getDislikesOfPost = async (req, res) => {
  try {
    const { postId } = req.body; // Getting postId from body
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
    return res.status(500).json({ message: "Server error", success: false });
  }
};
export const addComment = async (req, res) => {
  try {
    const postId = req.params.id;
    const commentKrneWalaUserKiId = req.id;

    const { text } = req.body;

    const post = await Post.findById(postId);

    if (!text)
      return res
        .status(400)
        .json({ message: "text is required", success: false });

    const comment = await Comment.create({
      text,
      author: commentKrneWalaUserKiId,
      post: postId,
    });

    await comment.populate({
      path: "author",
      select: "username profilePicture",
    });

    post.comments.push(comment._id);
    await post.save();

    return res.status(201).json({
      message: "Comment Added",
      comment,
      success: true,
    });
  } catch (error) {
    // console.log(error);
  }
};
export const getCommentsOfPost = async (req, res) => {
  try {
    const postId = req.params.id;

    const comments = await Comment.find({ post: postId }).populate(
      "author",
      "username profilePicture"
    );

    if (!comments)
      return res
        .status(404)
        .json({ message: "No comments found for this post", success: false });

    return res.status(200).json({ success: true, comments });
  } catch (error) {
    // console.log(error);
  }
};
export const deletePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const authorId = req.id;

    const post = await Post.findById(postId);
    if (!post)
      return res
        .status(404)
        .json({ message: "Post not found", success: false });

    // check if the logged-in user is the owner of the post
    if (post.author.toString() !== authorId)
      return res.status(403).json({ message: "Unauthorized" });

    // delete post
    await Post.findByIdAndDelete(postId);

    // remove the post id from the user's post
    let user = await User.findById(authorId);
    user.posts = user.posts.filter((id) => id.toString() !== postId);
    await user.save();

    // delete associated comments
    await Comment.deleteMany({ post: postId });

    return res.status(200).json({
      success: true,
      message: "Post deleted",
    });
  } catch (error) {
    // console.log(error);
  }
};
export const bookmarkPost = async (req, res) => {
  try {
    const postId = req.params.id;
    const authorId = req.id;
    const post = await Post.findById(postId);
    if (!post)
      return res
        .status(404)
        .json({ message: "Post not found", success: false });

    const user = await User.findById(authorId);
    if (user.bookmarks.includes(post._id)) {
      // already bookmarked -> remove from the bookmark
      await user.updateOne({ $pull: { bookmarks: post._id } });
      await user.save();
      return res.status(200).json({
        type: "unsaved",
        message: "Post removed from bookmark",
        success: true,
      });
    } else {
      // bookmark krna pdega
      await user.updateOne({ $addToSet: { bookmarks: post._id } });
      await user.save();
      return res
        .status(200)
        .json({ type: "saved", message: "Post bookmarked", success: true });
    }
  } catch (error) {
    // console.log(error);
  }
};
// In postController.js (append this)
export const updateFeedFromSearch = async (req, res) => {
  try {
    const userId = req.id; // From auth middleware
    const { searchTerm } = req.body;

    if (!searchTerm || typeof searchTerm !== "string") {
      return res
        .status(400)
        .json({ message: "Valid search term required", success: false });
    }

    // Treat the search term as a single category (no splitting)
    const trimmedSearchTerm = searchTerm.trim().toLowerCase();

    // Add to user's feed without duplicates
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $addToSet: { feed: trimmedSearchTerm } },
      { new: true, select: "feed" } // Return updated feed
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
};
