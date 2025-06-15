import { User } from "../models/user.model.js";
import { ChatUser } from "../models/chatUser.model.js";
// Add a user to the current user's chat list
export const addChatUser = async (req, res) => {
  try {
    console.log("Request body:", req.body); 
    const { userId, currentUserId } = req.body;
    if (!userId || !currentUserId) {
      return res.status(400).json({
        success: false,
        message: "User ID and Current User ID are required",
      });
    }

    if (userId === currentUserId) {
      return res.status(400).json({
        success: false,
        message: "Cannot add yourself to chat list",
      });
    }

    const targetUser = await User.findById(userId).select(
      "username profilePicture activityStatus blueTick"
    );
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const currentUser = await User.findById(currentUserId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "Current user not found",
      });
    }

    // Check if user is already in chat list
    if (currentUser.chatUsers.includes(userId)) {
      return res.status(200).json({
        success: true,
        message: "User already in your chat list",
      });
    }

    // Add user to chat list
    currentUser.chatUsers.push(userId);
    await currentUser.save();

    return res.status(201).json({
      success: true,
      message: "User added to chat list",
      chatUser: {
        _id: targetUser._id,
        username: targetUser.username,
        profilePicture: targetUser.profilePicture,
        activityStatus: targetUser.activityStatus,
        blueTick: targetUser.blueTick, // Include blueTick
      },
    });
  } catch (error) {
    console.error("Error adding chat user:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Get the current user's chat list
export const getChatUsers = async (req, res) => {
  try {
    const { currentUserId } = req.query;

    if (!currentUserId) {
      return res.status(400).json({
        success: false,
        message: "Current user ID is required",
      });
    }

    const user = await User.findById(currentUserId).populate(
      "chatUsers",
      "username profilePicture activityStatus blueTick"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Debug log to check populated data
    console.log("Populated chatUsers:", user.chatUsers);

    const formattedChatUsers = user.chatUsers.map((chatUser) => ({
      _id: chatUser._id,
      username: chatUser.username,
      profilePicture: chatUser.profilePicture,
      activityStatus: chatUser.activityStatus,
      blueTick: chatUser.blueTick ?? false, // Fallback to false
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

// Delete a user from the current user's chat list
export const deleteChatUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { currentUserId } = req.body;

    if (!userId || !currentUserId) {
      return res.status(400).json({
        success: false,
        message: "User ID and Current User ID are required",
      });
    }

    const currentUser = await User.findById(currentUserId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "Current user not found",
      });
    }

    const index = currentUser.chatUsers.indexOf(userId);
    if (index === -1) {
      return res.status(404).json({
        success: false,
        message: "User not found in your chat list",
      });
    }

    currentUser.chatUsers.splice(index, 1);
    await currentUser.save();

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

// Temporary endpoint to update blueTick for all users
export const updateBlueTick = async (req, res) => {
  try {
    // Set blueTick: false for all users
    const updateResult = await User.updateMany(
      {},
      { $set: { blueTick: false } }
    );

    // Set blueTick: true for a specific user (e.g., saifurrehman___0708)
    const specificUserResult = await User.updateOne(
      { username: "saifurrehman___0708" },
      { $set: { blueTick: true } }
    );

    return res.status(200).json({
      success: true,
      message: "BlueTick updated for users",
      updatedCount: updateResult.modifiedCount,
      specificUserUpdated: specificUserResult.modifiedCount,
    });
  } catch (error) {
    console.error("Error updating blueTick:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
