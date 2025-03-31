import { Conversation } from "../models/conversation.model.js";
import { Message } from "../models/message.model.js";
import { getReceiverSocketId, io } from "../socket/socket.js";
import { User } from "../models/user.model.js";

export const getMessage = async (req, res) => {
  try {
    const senderId = req.id;
    const receiverId = req.params.id;

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
    }).populate("senderId", "username");

    // console.log("Fetched messages from DB:", messages);
    return res.status(200).json({
      success: true,
      messages: messages,
    });
  } catch (error) {
    // console.error("Error fetching messages:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
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

export const sendMessage = async (req, res) => {
  try {
    const senderId = req.id;
    const receiverId = req.params.id;
    const { message } = req.body;
    const audioFile = req.file;

    let newMessage;

    if (audioFile) {
      const filePath = `/uploads/voice/${audioFile.filename}`;
      newMessage = await Message.create({
        senderId,
        receiverId,
        message: filePath,
        messageType: "voice",
      });
    } else {
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

    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", newMessage);
    }
    io.to(getReceiverSocketId(senderId)).emit("newMessage", newMessage);

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
