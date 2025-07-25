import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    name: { type: String, trim: true },
    email: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    profilePicture: { type: String, default: "/defaultAvatar/img1.png" },
    bio: { type: String, default: "", trim: true },
    gender: { type: String, enum: ["male", "female", "other"] },
    dob: { type: Date },
    city: { type: String, trim: true },
    country: { type: String, trim: true },
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
      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: [] },
    ],
    isDisabled: { type: Boolean, default: false },
    profession: { type: String },
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
      required: true,
    },
    chatTabs: { type: Boolean, default: true },
    storyVisibility: {
      type: String,
      enum: ["everyone", "conexmate", "closeConex"],
      default: "conexmate",
    },
    storyPresent: { type: Boolean, default: false },
    storyCreatedAt: { type: Date },
    reports: [
      {
        reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        reason: { type: String, required: true },
        reportedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
