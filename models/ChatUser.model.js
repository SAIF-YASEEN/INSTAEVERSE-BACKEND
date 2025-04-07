import mongoose from "mongoose";

const chatUserSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  currentUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  addedAt: {
    type: Date,
    default: Date.now,
  },
});

// Add a compound unique index for userId and currentUserId
chatUserSchema.index({ userId: 1, currentUserId: 1 }, { unique: true });

export const ChatUser = mongoose.model("ChatUser", chatUserSchema);
