import { Conversation } from "../models/conversation.model.js";
import { getReceiverSocketId, io } from "../socket/socket.js";
import { Message } from "../models/message.model.js";

// Send a message
export const sendMessage = async (req, res) => {
  try {
    const senderId = req.id;
    const receiverId = req.params.id;
    const { message } = req.body; // Use `message` instead of `textMessage`

    if (!message?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message text is required.",
      });
    }

    let conversation = await Conversation.findOne({
      participants: { $all: [senderId, receiverId] },
    });

    // If conversation doesn't exist, create one
    if (!conversation) {
      conversation = await Conversation.create({
        participants: [senderId, receiverId],
        messages: [],
      });
    }

    // Create new message
    const newMessage = await Message.create({
      senderId,
      receiverId,
      message,
    });

    // Add message to conversation
    conversation.messages.push(newMessage._id);
    await conversation.save();

    // Emit real-time update via Socket.io
    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", newMessage);
    }

    return res.status(201).json({
      success: true,
      message: "Message sent successfully.",
      newMessage,
    });
  } catch (error) {
    console.error("Error sending message:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

// Get all messages between two users
export const getMessage = async (req, res) => {
  try {
    const senderId = req.id;
    const receiverId = req.params.id;

    const conversation = await Conversation.findOne({
      participants: { $all: [senderId, receiverId] },
    }).populate("messages");

    return res.status(200).json({
      success: true,
      messages: conversation ? conversation.messages : [],
    });
  } catch (error) {
    console.error("Error fetching messages:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};
