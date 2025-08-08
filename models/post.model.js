import mongoose from "mongoose";

const postSchema = new mongoose.Schema({
  caption: { type: String, default: "" },
  media: { type: String }, // Optional: Kept for backward compatibility
  image: { type: String }, // Field for image URL
  video: { type: String }, // Field for video URL
  publicId: { type: String, required: true },
  type: { type: String, enum: ["image", "video"], required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  dislikes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  comments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Comment" }],
  viewCount: { type: Number, default: 0 },
  shareCount: { type: Number, default: 0 },
  reports: [
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reason: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
    },
  ],
  createdAt: { type: Date, default: Date.now },
  categories: {
    type: [String],
    required: true,
    validate: [
      {
        validator: (arr) => arr.length >= 1,
        message: "At least one category is required",
      },
      {
        validator: (arr) => arr.length <= 10,
        message: "Maximum of 10 categories allowed",
      },
    ],
  },
});

export const Post = mongoose.model("Post", postSchema);
