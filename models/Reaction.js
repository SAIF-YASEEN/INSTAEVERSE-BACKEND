import mongoose from "mongoose";

const reactionSchema = new mongoose.Schema({
  messageId: { type: mongoose.Schema.Types.ObjectId, required: true }, // ID of the message being reacted to
  userId: { type: mongoose.Schema.Types.ObjectId, required: true }, // ID of the user who reacted
  emoji: { type: String, required: true }, // The emoji used in the reaction
  timestamp: { type: Date, default: Date.now }, // Timestamp of the reaction
  user: {
    username: String,
    profilePicture: String,
  },
});

// Create and export the Reaction model
const Reaction = mongoose.model("Reaction", reactionSchema);
export default Reaction;
