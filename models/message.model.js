// message.model.js
import mongoose from "mongoose";

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
    required: false, // Allow null for deleted messages or media-only messages
  },
  image: {
    type: String, // Store Cloudinary URL for images
    default: null,
  },
  video: {
    type: String, // Store Cloudinary URL for videos
    default: null,
  },
  storyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Story", // Reference to Story model
    default: null,
  },
  messageType: {
    type: String,
    enum: ["text", "voice", "image", "post", "story"], // Add "post" and "story"
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
    type: Date, // Use Date instead of formatted string
    default: Date.now,
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
