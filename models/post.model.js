import mongoose from "mongoose";

// In your post model file
const postSchema = new mongoose.Schema({
  caption: { type: String, default: "" },
  image: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  dislikes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Added dislikes field
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
