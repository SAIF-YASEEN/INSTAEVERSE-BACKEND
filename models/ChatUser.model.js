import mongoose from "mongoose";

const chatUserSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "User", 
        required: true,
        unique: true 
    },
    addedAt: { 
        type: Date, 
        default: Date.now 
    }
});

export const ChatUser = mongoose.model("ChatUser", chatUserSchema);