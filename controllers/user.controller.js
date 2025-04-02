import { User } from "../models/user.model.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import getDataUri from "../utils/datauri.js";
import cloudinary from "../utils/cloudinary.js";
import { Post } from "../models/post.model.js";

export const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(401).json({
        message: "Something is missing, please check!",
        success: false,
      });
    }
    const user = await User.findOne({ email });
    if (user) {
      return res.status(401).json({
        message: "Try different email",
        success: false,
      });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({
      username,
      email,
      password: hashedPassword,
    });
    return res.status(201).json({
      message: "Account created successfully.",
      success: true,
    });
  } catch (error) {
    console.log(error);
  }
};
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(401).json({
        message: "Something is missing, please check!",
        success: false,
      });
    }
    let user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        message: "Incorrect email or password",
        success: false,
      });
    }
    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      return res.status(401).json({
        message: "Incorrect email or password",
        success: false,
      });
    }

    // If user is disabled, enable them again
    if (user.isDisabled) {
      user.isDisabled = false;
      user.disabledAt = null;
      await user.save();
    }

    const token = await jwt.sign({ userId: user._id }, process.env.SECRET_KEY, {
      expiresIn: "1d",
    });

    // Populate each post in the posts array
    const populatedPosts = await Promise.all(
      user.posts.map(async (postId) => {
        const post = await Post.findById(postId);
        if (post?.author.equals(user._id)) {
          return post;
        }
        return null;
      })
    );

    user = {
      _id: user._id,
      username: user.username,
      email: user.email,
      profilePicture: user.profilePicture,
      bio: user.bio,
      followers: user.followers,
      following: user.following,
      posts: populatedPosts.filter(Boolean),
    };

    return res
      .cookie("token", token, {
        httpOnly: true,
        sameSite: "strict",
        maxAge: 24 * 60 * 60 * 1000,
      })
      .json({
        message: `Welcome back ${user.username}`,
        success: true,
        user,
      });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ message: "Something went wrong", success: false });
  }
};

export const logout = async (_, res) => {
  try {
    return res.cookie("token", "", { maxAge: 0 }).json({
      message: "Logged out successfully.",
      success: true,
    });
  } catch (error) {
    console.log(error);
  }
};
export const getProfile = async (req, res) => {
  try {
    const userId = req.params.id;
    let user = await User.findById(userId)
      .populate({ path: "posts", createdAt: -1 })
      .populate("bookmarks");
    return res.status(200).json({
      user,
      success: true,
    });
  } catch (error) {
    console.log(error);
  }
};

export const editProfile = async (req, res) => {
  try {
    const userId = req.id;
    const { bio, gender } = req.body;
    const profilePicture = req.file;
    let cloudResponse;

    if (profilePicture) {
      const fileUri = getDataUri(profilePicture);
      cloudResponse = await cloudinary.uploader.upload(fileUri);
    }

    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({
        message: "User not found.",
        success: false,
      });
    }
    if (bio) user.bio = bio;
    if (gender) user.gender = gender;
    if (profilePicture) user.profilePicture = cloudResponse.secure_url;

    await user.save();

    return res.status(200).json({
      message: "Profile updated.",
      success: true,
      user,
    });
  } catch (error) {
    console.log(error);
  }
};
export const getSuggestedUsers = async (req, res) => {
  try {
    const suggestedUsers = await User.find({ _id: { $ne: req.id } }).select(
      "-password"
    );
    if (!suggestedUsers) {
      return res.status(400).json({
        message: "Currently do not have any users",
      });
    }
    return res.status(200).json({
      success: true,
      users: suggestedUsers,
    });
  } catch (error) {
    console.log(error);
  }
};

let io;
const setIo = (socketIo) => {
  io = socketIo;
};

export const followOrUnfollow = async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const { currentUserId } = req.body;

    if (!currentUserId) {
      return res.status(400).json({
        success: false,
        message: "Current user ID is required",
      });
    }

    const targetUser = await User.findById(targetUserId);
    const currentUser = await User.findById(currentUserId);

    if (!targetUser || !currentUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const isFollowing = currentUser.following.includes(targetUserId);

    if (isFollowing) {
      currentUser.following = currentUser.following.filter(
        (id) => id.toString() !== targetUserId
      );
      targetUser.followers = targetUser.followers.filter(
        (id) => id.toString() !== currentUserId
      );
      targetUser.followTimestamps = targetUser.followTimestamps.filter(
        (ft) => ft.userId.toString() !== currentUserId
      );
      await currentUser.save();
      await targetUser.save();

      return res.status(200).json({
        success: true,
        message: "User unfollowed successfully",
        currentUser: { following: currentUser.following },
        targetUser: {
          followers: targetUser.followers,
          followTimestamps: targetUser.followTimestamps,
        },
      });
    } else {
      currentUser.following.push(targetUserId);
      targetUser.followers.push(currentUserId);
      const followTimestamp = new Date();
      targetUser.followTimestamps.push({
        userId: currentUserId,
        timestamp: followTimestamp,
      });
      await currentUser.save();
      await targetUser.save();

      if (io) {
        const followData = {
          type: "follow",
          userId: currentUserId,
          userDetails: {
            username: currentUser.username,
            profilePicture:
              currentUser.profilePicture ||
              "https://example.com/default-avatar.jpg",
          },
          timestamp: followTimestamp.toISOString(),
        };
        io.to(targetUserId).emit("follow", followData);
        console.log(`Emitted follow event to ${targetUserId}:`, followData);
      } else {
        console.error("Socket.IO not initialized");
      }

      return res.status(200).json({
        success: true,
        message: "User followed successfully",
        currentUser: { following: currentUser.following },
        targetUser: {
          followers: targetUser.followers,
          followTimestamps: targetUser.followTimestamps,
        },
      });
    }
  } catch (error) {
    console.error("Follow/Unfollow Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
export const getUsersByIds = async (req, res) => {
  try {
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No user IDs provided or invalid format",
      });
    }

    // Fetch users by IDs, selecting only necessary fields
    const users = await User.find({ _id: { $in: userIds } })
      .select("_id username profilePicture")
      .lean();

    if (!users || users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No users found for the provided IDs",
      });
    }

    res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    console.error("Error in getUsersByIds:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching users",
    });
  }
};

export const removeFollower = async (req, res) => {
  try {
    const followerId = req.params.id;
    const { userId } = req.body; // Get userId from request body

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    // Remove follower from user's followers list
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (!user.followers.includes(followerId)) {
      return res
        .status(400)
        .json({ success: false, message: "Not a follower" });
    }

    user.followers = user.followers.filter(
      (id) => id.toString() !== followerId
    );
    await user.save();

    // Remove user from follower's following list
    const follower = await User.findById(followerId);
    if (follower) {
      follower.following = follower.following.filter(
        (id) => id.toString() !== userId
      );
      await follower.save();
    }

    res.status(200).json({
      success: true,
      message: "Follower removed successfully",
      user: {
        ...user.toObject(),
        followers: user.followers,
      },
    });
  } catch (error) {
    console.error("Error in removeFollower:", error);
    res.status(500).json({
      success: false,
      message: "Server error while removing follower",
    });
  }
};
// In userController.js
// export const getUserProfile = async (req, res) => {
//   try {
//     const userId = req.params.id;
//     const user = await User.findById(userId).select("-password");
//     if (!user) {
//       return res
//         .status(404)
//         .json({ success: false, message: "User not found" });
//     }
//     res.status(200).json({ success: true, user });
//   } catch (error) {
//     console.error("Error in getUserProfile:", error);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// };
export const getUserFeed = async (req, res) => {
  try {
    const userId = req.id; // From isAuthenticated middleware
    const user = await User.findById(userId).select("feed");
    if (!user) {
      return res
        .status(404)
        .json({ message: "User not found", success: false });
    }
    return res.status(200).json({
      feed: user.feed,
      success: true,
    });
  } catch (error) {
    console.error("Error in getUserFeed:", error);
    return res.status(500).json({ message: "Server error", success: false });
  }
};
export const updatePrivacy = async (req, res) => {
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
};

// Get user profile
export const getUserProfile = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .select("-password")
      .populate("followers", "username profilePicture isPrivate")
      .populate("following", "username profilePicture isPrivate");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const posts = await Post.find({ user: id })
      .sort({ createdAt: -1 })
      .populate("user", "username profilePicture");

    res.status(200).json({
      success: true,
      data: {
        user,
        posts,
      },
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching profile",
    });
  }
};

// controllers/user.controller.js
// ... existing imports ...

export const addChatUser = async (req, res) => {
  try {
    const { userId, targetUserId } = req.body;

    if (!userId || !targetUserId) {
      return res.status(400).json({
        success: false,
        message: "Both user IDs are required",
      });
    }

    const user = await User.findById(userId);
    const targetUser = await User.findById(targetUserId);

    if (!user || !targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.chatUsers.includes(targetUserId)) {
      return res.status(200).json({
        success: true,
        message: "User already in chat list",
      });
    }

    user.chatUsers.push(targetUserId);
    await user.save();

    return res.status(200).json({
      success: true,
      message: "User added to chat list",
      chatUsers: user.chatUsers,
    });
  } catch (error) {
    console.error("Error adding chat user:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const getChatUsers = async (req, res) => {
  try {
    const userId = req.id; // from isAuthenticated middleware

    const user = await User.findById(userId)
      .populate("chatUsers", "username profilePicture activityStatus")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      chatUsers: user.chatUsers,
    });
  } catch (error) {
    console.error("Error getting chat users:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

