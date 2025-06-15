// message.model.js
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
    required: false, // Allow null for deleted messages or image-only messages
  },
  image: {
    type: String, // Store Cloudinary URL for images
    default: null,
  },
  messageType: {
    type: String,
    enum: ["text", "voice", "image"], // Add 'image' type
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
  isEdited: {
    type: Boolean,
    default: false,
  },
  editedAt: {
    type: Date,
    default: null,
  },
});

export const Message = mongoose.model("Message", messageSchema);
