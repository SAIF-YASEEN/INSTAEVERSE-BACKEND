import { ChatUser } from "../models/ChatUser.model.js";
import { User } from "../models/user.model.js";

export const addChatUser = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    // Check if user exists
    const userExists = await User.findById(userId);
    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if already in ChatUser
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

export const getChatUsers = async (req, res) => {
  try {
    const chatUsers = await ChatUser.find()
      .populate("userId", "username profilePicture activityStatus")
      .lean();

    const users = chatUsers.map((chatUser) => ({
      ...chatUser.userId,
      addedAt: chatUser.addedAt,
    }));

    return res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    console.error("Error getting chat users:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Function to add initial users (call this once or as needed)
export const addInitialChatUsers = async () => {
  try {
    const existingChatUsers = await ChatUser.countDocuments();
    if (existingChatUsers > 0) return; // Skip if already initialized

    const users = await User.find().limit(20); // Add 20 users initially
    const chatUserPromises = users.map((user) =>
      ChatUser.create({ userId: user._id })
    );

    await Promise.all(chatUserPromises);
    console.log("Initial chat users added successfully");
  } catch (error) {
    console.error("Error adding initial chat users:", error);
  }
};
