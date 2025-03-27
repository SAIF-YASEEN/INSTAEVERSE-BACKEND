import mongoose from "mongoose";

const postSchema = new mongoose.Schema({
  caption: { type: String, default: "" },
  image: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  comments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Comment" }],
  createdAt: { type: Date, default: Date.now },
  // New categories field
  categories: {
    type: [String], // Array of strings
    required: true, // At least one category is required
    validate: [
      {
        validator: (arr) => arr.length >= 1, // Minimum 1 category
        msg: "At least one category is required",
      },
      {
        validator: (arr) => arr.length <= 10, // Maximum 10 categories
        msg: "Maximum of 10 categories allowed",
      },
    ],
  },
});

export const Post = mongoose.model("Post", postSchema);
