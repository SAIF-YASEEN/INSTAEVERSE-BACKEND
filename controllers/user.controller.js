import { User } from "../models/user.model.js";
import { Post } from "../models/post.model.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import getDataUri from "../utils/datauri.js";
import cloudinary from "../utils/cloudinary.js";
import asyncHandler from "../utils/asyncHandler.js";
import { DisabledAccount } from "../models/DisabledAccount.js";
import axios from "axios";
let io;
export const setIo = (socketIo) => {
  io = socketIo;
};

export const register = asyncHandler(async (req, res) => {
  const {
    username,
    name,
    email,
    password,
    gender,
    dob,
    city,
    country,
    profilePicture,
    accountChoice,
  } = req.body;

  // Validate required fields
  if (
    !username ||
    !name ||
    !email ||
    !password ||
    !gender ||
    !dob ||
    !city ||
    !country ||
    !accountChoice
  ) {
    return res.status(400).json({
      message: "All required fields must be provided.",
      success: false,
    });
  }

  // Validate age (must be 18+)
  const birthDate = new Date(dob);
  const today = new Date();
  const age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  // if (
  //   monthDiff < 0 ||
  //   (monthDiff === 0 && today.getDate() < birthDate.getDate())
  // ) {
  //   age--;
  // }
  if (age < 18) {
    return res.status(400).json({
      message: "You must be at least 18 years old to register.",
      success: false,
    });
  }

  // Check for existing user
  const user = await User.findOne({ $or: [{ email }, { username }] });
  if (user) {
    return res.status(400).json({
      message: "Email or username already exists.",
      success: false,
    });
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create user
  const newUser = await User.create({
    username,
    name,
    email,
    password: hashedPassword,
    gender,
    dob: birthDate,
    city,
    country,
    profilePicture: profilePicture || "/defaultAvatar/img1.png",
    accountChoice,
  });

  return res.status(201).json({
    message: "Account created successfully.",
    success: true,
    user: {
      _id: newUser._id,
      username: newUser.username,
      name: newUser.name,
      email: newUser.email,
      gender: newUser.gender,
      profilePicture: newUser.profilePicture,
    },
  });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({
      message: "Something is missing, please check!",
      success: false,
    });
  }

  // Check in User collection first
  let user = await User.findOne({ email });
  let isDisabledAccount = false;

  // If not found in User, check DisabledAccount collection
  if (!user) {
    const disabledAccount = await DisabledAccount.findOne({ email });
    if (disabledAccount) {
      isDisabledAccount = true;
    } else {
      return res.status(401).json({
        message: "Incorrect email or password",
        success: false,
      });
    }
  }

  // If account is disabled, attempt to re-enable it
  if (isDisabledAccount) {
    const enableResponse = await axios.post(
      "http://localhost:8000/api/v1/user/enable",
      { userId: (await DisabledAccount.findOne({ email }))._id },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    if (!enableResponse.data.success) {
      return res.status(400).json({
        message: "Failed to re-enable account. Please contact support.",
        success: false,
      });
    }

    // Fetch the re-enabled user
    user = await User.findOne({ email });
    if (!user) {
      return res.status(500).json({
        message: "Error retrieving re-enabled account",
        success: false,
      });
    }
  }

  const isPasswordMatch = await bcrypt.compare(password, user.password);
  if (!isPasswordMatch) {
    return res.status(401).json({
      message: "Incorrect email or password",
      success: false,
    });
  }

  const token = jwt.sign({ userId: user._id }, process.env.SECRET_KEY, {
    expiresIn: "7d",
  });

  // Populate posts
  const populatedPosts = await Promise.all(
    user.posts.map(async (postId) => {
      const post = await Post.findById(postId);
      if (post?.author.equals(user._id)) {
        return post;
      }
      return null;
    })
  );

  const userResponse = {
    _id: user._id,
    username: user.username,
    email: user.email,
    profilePicture: user.profilePicture,
    bio: user.bio,
    followers: user.followers,
    following: user.following,
    conexmate: user.conexmate,
    posts: populatedPosts.filter(Boolean),
    isPrivate: user.isPrivate,
    chatUsers: user.chatUsers,
  };

  return res
    .cookie("token", token, {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    })
    .json({
      message: isDisabledAccount
        ? `Account re-enabled! Welcome back ${user.username}`
        : `Welcome back ${user.username}`,
      success: true,
      user: userResponse,
    });
});

export const logout = asyncHandler(async (req, res) => {
  return res.cookie("token", "", { maxAge: 0 }).json({
    message: "Logged out successfully.",
    success: true,
  });
});

export const getProfile = asyncHandler(async (req, res) => {
  const userId = req.params.id;
  const user = await User.findById(userId)
    .select("-password")
    .populate("posts", null, null, { sort: { createdAt: -1 } })
    .populate("bookmarks")
    .populate("chatTabs")
    .populate("followers", "username profilePicture isPrivate")
    .populate("following", "username profilePicture isPrivate")
    .populate("conexmate", "username profilePicture isPrivate");
  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }
  return res.status(200).json({
    user,
    success: true,
  });
});

export const editProfile = asyncHandler(async (req, res) => {
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
});

export const getSuggestedUsers = asyncHandler(async (req, res) => {
  const suggestedUsers = await User.find({ _id: { $ne: req.id } }).select(
    "-password"
  );
  if (!suggestedUsers || suggestedUsers.length === 0) {
    return res.status(404).json({
      message: "No users available",
      success: false,
    });
  }
  return res.status(200).json({
    success: true,
    users: suggestedUsers,
  });
});

export const followOrUnfollow = asyncHandler(async (req, res) => {
  const targetUserId = req.params.id;
  const { currentUserId } = req.body;

  if (!currentUserId || !targetUserId) {
    return res.status(400).json({
      success: false,
      message: "Current user ID and target user ID are required",
    });
  }

  if (currentUserId === targetUserId) {
    return res.status(400).json({
      success: false,
      message: "You cannot follow or unfollow yourself",
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
    currentUser.conexmate = currentUser.conexmate.filter(
      (id) => id.toString() !== targetUserId
    );
    targetUser.conexmate = targetUser.conexmate.filter(
      (id) => id.toString() !== currentUserId
    );

    await currentUser.save();
    await targetUser.save();

    return res.status(200).json({
      success: true,
      message: `You have unfollowed ${targetUser.username}`,
      currentUser: {
        following: currentUser.following,
        conexmate: currentUser.conexmate,
      },
      targetUser: {
        followers: targetUser.followers,
        conexmate: targetUser.conexmate,
        followTimestamps: targetUser.followTimestamps,
      },
    });
  } else {
    // Follow
    currentUser.following.push(targetUserId);
    targetUser.followers.push(currentUserId);
    const followTimestamp = new Date();
    targetUser.followTimestamps.push({
      userId: currentUserId,
      timestamp: followTimestamp,
    });

    // Check for mutual follow (conexmate)
    const isMutual = targetUser.following.includes(currentUserId);
    if (isMutual) {
      currentUser.conexmate = currentUser.conexmate.includes(targetUserId)
        ? currentUser.conexmate
        : [...currentUser.conexmate, targetUserId];
      targetUser.conexmate = targetUser.conexmate.includes(currentUserId)
        ? targetUser.conexmate
        : [...targetUser.conexmate, currentUserId];
    }

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
    }

    return res.status(200).json({
      success: true,
      message: `You have followed ${targetUser.username}`,
      currentUser: {
        following: currentUser.following,
        conexmate: currentUser.conexmate,
      },
      targetUser: {
        followers: targetUser.followers,
        conexmate: targetUser.conexmate,
        followTimestamps: targetUser.followTimestamps,
      },
    });
  }
});

export const getUsersByIds = asyncHandler(async (req, res) => {
  const { userIds } = req.body;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: "No user IDs provided or invalid format",
    });
  }

  const users = await User.find({ _id: { $in: userIds } })
    .select("_id username profilePicture isPrivate")
    .lean();

  if (!users || users.length === 0) {
    return res.status(404).json({
      success: false,
      message: "No users found for the provided IDs",
    });
  }

  return res.status(200).json({
    success: true,
    users,
  });
});

export const getConexmateUsers = asyncHandler(async (req, res) => {
  const { userIds } = req.body;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: "No user IDs provided or invalid format",
    });
  }

  const users = await User.find({ _id: { $in: userIds } })
    .select("_id username profilePicture isPrivate")
    .lean();

  if (!users || users.length === 0) {
    return res.status(404).json({
      success: false,
      message: "No users found for the provided IDs",
    });
  }

  return res.status(200).json({
    success: true,
    users,
  });
});

export const removeFollower = asyncHandler(async (req, res) => {
  const followerId = req.params.id;
  const { userId } = req.body;

  if (!userId || !followerId) {
    return res.status(400).json({
      success: false,
      message: "User ID and follower ID are required",
    });
  }

  const user = await User.findById(userId);
  const follower = await User.findById(followerId);

  if (!user || !follower) {
    return res.status(404).json({
      success: false,
      message: "User or follower not found",
    });
  }

  if (!user.followers.includes(followerId)) {
    return res.status(400).json({
      success: false,
      message: "Not a follower",
    });
  }

  user.followers = user.followers.filter((id) => id.toString() !== followerId);
  user.conexmate = user.conexmate.filter((id) => id.toString() !== followerId);
  follower.following = follower.following.filter(
    (id) => id.toString() !== userId
  );
  follower.conexmate = follower.conexmate.filter(
    (id) => id.toString() !== userId
  );

  await user.save();
  await follower.save();

  return res.status(200).json({
    success: true,
    message: "Follower removed successfully",
    user: {
      followers: user.followers,
      conexmate: user.conexmate,
    },
  });
});

export const getLikesOfPost = asyncHandler(async (req, res) => {
  const { postId } = req.body;

  if (!postId) {
    return res.status(400).json({
      success: false,
      message: "No post ID provided",
    });
  }

  const post = await Post.findById(postId).select("likes").lean();

  if (!post) {
    return res.status(404).json({
      success: false,
      message: "Post not found",
    });
  }

  if (!post.likes || post.likes.length === 0) {
    return res.status(200).json({
      success: true,
      users: [],
    });
  }

  const users = await User.find({ _id: { $in: post.likes } })
    .select("_id username profilePicture isPrivate")
    .lean();

  return res.status(200).json({
    success: true,
    users,
  });
});

export const getUserFeed = asyncHandler(async (req, res) => {
  const userId = req.id;
  const user = await User.findById(userId).select("feed");
  if (!user) {
    return res.status(404).json({
      message: "User not found",
      success: false,
    });
  }
  return res.status(200).json({
    feed: user.feed,
    success: true,
  });
});

export const updatePrivacy = asyncHandler(async (req, res) => {
  const { userId, isPrivate } = req.body;

  if (!userId || typeof isPrivate !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "Invalid request: userId and isPrivate (boolean) are required",
    });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  user.isPrivate = isPrivate;
  const updatedUser = await user.save();

  return res.status(200).json({
    success: true,
    message: `Account ${
      isPrivate ? "set to private" : "set to public"
    } successfully`,
    data: updatedUser,
  });
});

export const getUserProfile = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id)
    .select("-password")
    .populate("followers", "username profilePicture isPrivate chatTabs")
    .populate("following", "username profilePicture isPrivate")
    .populate("conexmate", "username profilePicture isPrivate");

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  const posts = await Post.find({ user: id })
    .sort({ createdAt: -1 })
    .populate("user", "username profilePicture");

  return res.status(200).json({
    success: true,
    data: {
      user,
      posts,
    },
  });
});

export const addChatUser = asyncHandler(async (req, res) => {
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
});

export const getChatUsers = asyncHandler(async (req, res) => {
  const userId = req.id;

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
});
