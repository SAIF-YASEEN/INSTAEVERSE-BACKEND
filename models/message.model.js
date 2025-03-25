import mongoose from "mongoose";
import moment from "moment";

const messageSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  message: {
    type: String,
    required: false, // Allow null for deleted messages
  },
  messageType: {
    type: String,
    enum: ["text", "voice"],
    default: "text",
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
  deletedAt: {
    type: Date,
    default: null,
  },
  timestamp: {
    type: String,
    default: () => moment().format("MMM D, h:mm A"),
  },
});

export const Message = mongoose.model("Message", messageSchema);
