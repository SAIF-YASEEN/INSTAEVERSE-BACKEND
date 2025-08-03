import mongoose from "mongoose";

const reelSchema = new mongoose.Schema({
  post: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true },
  video: { type: String, required: true }, // Cloudinary video URL
  publicId: { type: String, required: true }, // Cloudinary public ID
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
});

export const Reel = mongoose.model("Reel", reelSchema);