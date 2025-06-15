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
    closeFriends: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: [] },
    ],
    conexmate: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: [] },
    ],
    posts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Post" }],
    bookmarks: [{ type: mongoose.Schema.Types.ObjectId, ref: "Post" }],
    isPrivate: { type: Boolean, default: false },
    lastActive: { type: Date, default: Date.now },
    followTimestamps: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    chatUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: [],
      },
    ],
    isDisabled: { type: Boolean, default: false },
    disabledAt: { type: Date },
    feed: { type: [String], default: [] },
    activityStatus: { type: Boolean, default: true },
    hideProfilePosts: { type: Boolean, default: false },
    hideProfileLikedPosts: { type: Boolean, default: false },
    hideProfileDislikedPosts: { type: Boolean, default: false },
    hideProfileSavedPosts: { type: Boolean, default: false },
    blueTick: { type: Boolean, default: false },
    accountChoice: {
      type: String,
      enum: ["normal", "professional"],
      default: "normal",
    },
    chatTabs: { type: Boolean, default: true },
    note: { type: String, maxlength: 280, default: "" },
    noteCreatedAt: { type: Date }, // New field to track note creation time
    notePresent: { type: Boolean, defualt: false },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
