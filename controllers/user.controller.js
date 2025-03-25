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

export const followOrUnfollow = async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const { currentUserId } = req.body;

    if (!currentUserId) {
      return res.status(400).json({
        success: false,
        message: "Current user ID is required in request body",
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
      // Unfollow
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
      res.status(200).json({
        success: true,
        message: "User unfollowed successfully",
        currentUser: { following: currentUser.following },
        targetUser: {
          followers: targetUser.followers,
          followTimestamps: targetUser.followTimestamps,
        },
      });
    } else {
      // Follow
      currentUser.following.push(targetUserId);
      targetUser.followers.push(currentUserId);
      targetUser.followTimestamps.push({
        userId: currentUserId,
        timestamp: new Date(),
      });
      await currentUser.save();
      await targetUser.save();
      res.status(200).json({
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
    console.error("Error in followOrUnfollow:", error);
    res.status(500).json({ success: false, message: "Server error" });
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
