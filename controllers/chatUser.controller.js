import { ChatUser } from "../models/ChatUser.model.js";
import { User } from "../models/user.model.js";

// Add a chat user
export const addChatUser = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const userExists = await User.findById(userId);
    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const existingChatUser = await ChatUser.findOne({ userId });
    if (existingChatUser) {
      return res.status(200).json({
        success: true,
        message: "User already in chat list",
        chatUser: existingChatUser,
      });
    }

    const chatUser = await ChatUser.create({ userId });

    return res.status(201).json({
      success: true,
      message: "User added to chat list",
      chatUser,
    });
  } catch (error) {
    console.error("Error adding chat user:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
// Get chat users
export const getChatUsers = async (req, res) => {
  try {
    const chatUsers = await ChatUser.find()
      .populate("userId", "username profilePicture activityStatus")
      .lean();

    // Filter out chatUsers with invalid (null) userId references and format the data
    const formattedChatUsers = chatUsers
      .filter((chatUser) => chatUser.userId !== null) // Skip entries with null userId
      .map((chatUser) => ({
        _id: chatUser.userId._id,
        username: chatUser.userId.username,
        profilePicture: chatUser.userId.profilePicture,
        activityStatus: chatUser.userId.activityStatus,
        addedAt: chatUser.addedAt,
      }));

    return res.status(200).json({
      success: true,
      chatUsers: formattedChatUsers,
    });
  } catch (error) {
    console.error("Error getting chat users:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Delete a chat user
export const deleteChatUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { currentUserId } = req.body;

    if (!userId || !currentUserId) {
      return res.status(400).json({
        success: false,
        message: "User ID and current user ID are required",
      });
    }

    if (userId === currentUserId) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete yourself from chat list",
      });
    }

    const chatUser = await ChatUser.findOneAndDelete({ userId });
    if (!chatUser) {
      return res.status(404).json({
        success: false,
        message: "User not found in chat list",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User removed from chat list",
    });
  } catch (error) {
    console.error("Error deleting chat user:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Add initial chat users (for setup)
export const addInitialChatUsers = async () => {
  try {
    const existingChatUsers = await ChatUser.countDocuments();
    if (existingChatUsers > 0) return;

    const users = await User.find().limit(20);
    const chatUserPromises = users.map((user) =>
      ChatUser.create({ userId: user._id })
    );

    await Promise.all(chatUserPromises);
    console.log("Initial chat users added successfully");
  } catch (error) {
    console.error("Error adding initial chat users:", error);
  }
};
