import mongoose from "mongoose";

const postSchema = new mongoose.Schema({
  caption: { type: String, default: "" },
  image: { type: String }, // Optional: For image posts
  video: { type: String }, // Optional: For video posts
  type: { type: String, enum: ["image", "video"], required: true }, // Distinguish post type
  publicId: { type: String }, // Cloudinary public ID for image or video
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  dislikes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  comments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Comment" }],
  createdAt: { type: Date, default: Date.now },
  categories: {
    type: [String],
    required: true,
    validate: [
      {
        validator: (arr) => arr.length >= 1,
        msg: "At least one category is required",
      },
      {
        validator: (arr) => arr.length <= 10,
        msg: "Maximum of 10 categories allowed",
      },
    ],
  },
});

export const Post = mongoose.model("Post", postSchema);
