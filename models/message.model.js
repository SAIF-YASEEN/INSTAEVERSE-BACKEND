import mongoose from "mongoose";
import moment from "moment"; // For timestamp formatting

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
    required: true,
  },
  timestamp: {
    type: String,
    default: () => moment().format("MMM D, h:mm A"), // Include date and time
  },
});

export const Message = mongoose.model("Message", messageSchema);
