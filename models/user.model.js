import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    profilePicture: { type: String, default: "" },
    bio: { type: String, default: "" },
    gender: { type: String, enum: ["male", "female"] },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    posts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Post" }],
    bookmarks: [{ type: mongoose.Schema.Types.ObjectId, ref: "Post" }],
    lastActive: { type: Date, default: Date.now },
    followTimestamps: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    isDisabled: {
      type: Boolean,
      default: false,
    },
    disabledAt: {
      type: Date,
    },
    // New feed field for storing categories
    feed: {
      type: [String], // Array of category strings
      default: [], // Starts empty
    },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
