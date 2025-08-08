import { Conversation } from "../models/conversation.model.js";
import { Message } from "../models/message.model.js";
import { getReceiverSocketId, io } from "../socket/socket.js";
import { User } from "../models/user.model.js";
import cloudinary from "../utils/cloudinary.js";

export const sendMessage = async (req, res) => {
  try {
    const senderId = req.id; // From auth middleware
    const receiverId = req.params.id; // From URL params
    const { message, image, postId, storyId, mediaUrl, mediaType } = req.body; // Add storyId, mediaUrl, mediaType

    // Validate sender and receiver
    if (!senderId || !receiverId) {
      return res.status(400).json({
        success: false,
        message: "Sender and receiver IDs are required.",
      });
    }

    // Ensure receiver exists
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: "Receiver not found.",
      });
    }

    let newMessage;
    let imageUrl;

    if (image) {
      // Handle base64 image upload to Cloudinary
      const uploadResponse = await cloudinary.uploader.upload(image, {
        folder: "chat_images",
      });
      imageUrl = uploadResponse.secure_url;

      newMessage = await Message.create({
        senderId,
        receiverId,
        message: message?.trim() || null,
        image: imageUrl,
        messageType: "image",
      });
    } else if (req.file) {
      // Handle voice messages
      const filePath = `/uploads/voice/${req.file.filename}`;
      newMessage = await Message.create({
        senderId,
        receiverId,
        message: filePath,
        messageType: "voice",
      });
    } else if (postId) {
      // Handle post sharing
      const postMessage = message?.trim() || `Shared a post: ${postId}`;
      newMessage = await Message.create({
        senderId,
        receiverId,
        message: postMessage,
        postId,
        messageType: "post",
      });
    } else if (storyId) {
      // Handle story sharing
      if (!mediaUrl || !mediaType || !["image", "video"].includes(mediaType)) {
        return res.status(400).json({
          success: false,
          message:
            "Story ID, media URL, and valid media type (image or video) are required.",
        });
      }
      newMessage = await Message.create({
        senderId,
        receiverId,
        message: message?.trim() || `Shared a story: ${storyId}`,
        storyId,
        [mediaType]: mediaUrl, // Store mediaUrl in image or video field
        messageType: "story",
      });
    } else {
      // Handle text messages
      if (!message?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Message text is required for text messages.",
        });
      }
      newMessage = await Message.create({
        senderId,
        receiverId,
        message,
        messageType: "text",
      });
    }

    // Find or create conversation
    let conversation = await Conversation.findOne({
      participants: { $all: [senderId, receiverId] },
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [senderId, receiverId],
        messages: [],
      });
    }

    conversation.messages.push(newMessage._id);
    await conversation.save();

    // Fetch sender's details
    const sender = await User.findById(senderId).select("username avatar");
    const senderUsername = sender ? sender.username : "Unknown";
    const senderAvatar =
      sender && sender.avatar
        ? sender.avatar
        : "";

    // Prepare message response
    const messageWithDetails = {
      ...newMessage._doc,
      senderId: {
        _id: senderId,
        username: senderUsername,
        avatar: senderAvatar,
      },
      senderUsername,
      senderAvatar,
      image: newMessage.image || null,
      video: newMessage.video || null,
      postId: newMessage.postId || null,
      storyId: newMessage.storyId || null,
    };

    // Emit to Socket.IO
    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", messageWithDetails);
    }
    const senderSocketId = getReceiverSocketId(senderId);
    if (senderSocketId) {
      io.to(senderSocketId).emit("newMessage", messageWithDetails);
    }

    return res.status(201).json({
      success: true,
      message: "Message sent successfully.",
      newMessage: messageWithDetails,
    });
  } catch (error) {
    console.error("Error sending message:", error.message, error.stack);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error.",
    });
  }
};

// Keep getMessage and deleteMessage as they are
export const getMessage = async (req, res) => {
  try {
    const senderId = req.id;
    const receiverId = req.params.id;

    if (!senderId || !receiverId) {
      return res.status(400).json({
        success: false,
        message: "Sender and receiver IDs are required.",
      });
    }

    const conversation = await Conversation.findOne({
      participants: { $all: [senderId, receiverId] },
    });

    if (!conversation) {
      return res.status(200).json({
        success: true,
        messages: [],
      });
    }

    const messages = await Message.find({
      _id: { $in: conversation.messages },
    })
      .populate("senderId", "username avatar")
      .lean();

    const enhancedMessages = messages.map((msg) => ({
      ...msg,
      senderUsername: msg.senderId?.username || "Unknown",
      senderAvatar: msg.senderId?.avatar || "https://via.placeholder.com/40",
    }));

    return res.status(200).json({
      success: true,
      messages: enhancedMessages,
    });
  } catch (error) {
    console.error("Error fetching messages:", error.message, error.stack);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error.",
    });
  }
};

export const deleteMessage = async (req, res) => {
  try {
    const messageId = req.params.messageId;
    const userId = req.id;

    const message = await Message.findOne({ _id: messageId, senderId: userId });
    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found or not authorized to delete",
      });
    }

    const sender = await User.findById(userId).select("username");
    if (!sender) {
      return res.status(404).json({
        success: false,
        message: "Sender not found",
      });
    }

    const deletedMessage = await Message.findByIdAndUpdate(
      messageId,
      {
        message: null,
        isDeleted: true,
        deletedAt: new Date(),
      },
      { new: true }
    );

    const receiverSocketId = getReceiverSocketId(message.receiverId);
    const senderSocketId = getReceiverSocketId(userId);
    const deleteEventData = {
      messageId: messageId,
      deletedAt: deletedMessage.deletedAt,
      senderUsername: sender.username,
    };

    if (receiverSocketId) {
      io.to(receiverSocketId).emit("message-deleted", deleteEventData);
    }
    if (senderSocketId) {
      io.to(senderSocketId).emit("message-deleted", deleteEventData);
    }

    return res.status(200).json({
      success: true,
      message: "Message deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting message:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
