import { Story } from "../models/stories.model.js";
import { User } from "../models/user.model.js";
import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: "dxjsianea",
  api_key: "186871492126217",
  api_secret: "6FEpL3-B2dVqjHEU8VEP9wQaN30",
});

export const createStory = async (req, res) => {
  console.log("Reached createStory controller");
  console.log("Request body:", req.body);
  console.log("Request file:", req.file);

  try {
    const { userId, content, visibility } = req.body;
    let image = "";

    if (req.file) {
      console.log("Uploading image to Cloudinary:", req.file.originalname);
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "stories",
            resource_type: "image",
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
      image = result.secure_url || "";
    } else {
      console.log("No image file provided");
    }

    if (!userId || (!content && !image)) {
      console.log("Validation failed: Missing userId or content/image");
      return res.status(400).json({
        success: false,
        message: "User ID and either content or image are required",
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

    const story = new Story({
      userId,
      content,
      image,
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
};
export const deleteStory = async (req, res) => {
  try {
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

    // Delete image from Cloudinary if it exists
    if (story.image) {
      const publicId = story.image.split("/").pop().split(".")[0]; // Extract public ID from URL
      await cloudinary.uploader.destroy(`stories/${publicId}`);
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
};

export const getStoryByUser = async (req, res) => {
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

    const story = await Story.findOne({ userId }).populate(
      "userId",
      "username name profilePicture blueTick"
    );
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

    const targetUser = await User.findById(userId);
    const requestingUser = await User.findById(requestingUserId);
    let hasAccess = false;

    if (story.visibility === "everyone") {
      hasAccess = true;
    } else if (story.visibility === "conexmate") {
      hasAccess = targetUser.conexmate.includes(requestingUserId);
    } else if (story.visibility === "closeConex") {
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
        likes: story.likes,
        comments: story.comments,
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
};

export const likeStory = async (req, res) => {
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

    return res.status(200).json({
      success: true,
      message: alreadyLiked ? "Story unliked" : "Story liked",
      data: story,
    });
  } catch (error) {
    console.error("Error liking story:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to like story",
      error: error.message,
    });
  }
};

export const commentStory = async (req, res) => {
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

    return res.status(200).json({
      success: true,
      message: "Comment added successfully",
      data: story,
    });
  } catch (error) {
    console.error("Error commenting on story:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to comment on story",
      error: error.message,
    });
  }
};

export const getStoryViewers = async (req, res) => {
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
};

export const updateStoryVisibility = async (req, res) => {
  console.log("Reached updateStoryVisibility controller"); // Debug log
  console.log("Request params:", req.params); // Log userId
  console.log("Request body:", req.body); // Log storyVisibility

  try {
    const { userId } = req.params;
    const { storyVisibility } = req.body;

    // Validate storyVisibility
    const validVisibilities = ["everyone", "conexmate", "closeConex"];
    if (!validVisibilities.includes(storyVisibility)) {
      console.log("Invalid visibility option:", storyVisibility);
      return res.status(400).json({
        success: false,
        message: "Invalid visibility option",
      });
    }

    // Find and update user
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
};
