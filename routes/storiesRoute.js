import express from "express";
import {
  createStory,
  deleteStory,
  getStoryByUser,
  updateStoryVisibility,
  likeStory,
  commentStory,
  getStoryViewers,
} from "../controllers/StoriesController.js";
import multer from "multer";

const router = express.Router();

// Configure multer for memory storage (for Cloudinary)
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only images are allowed"), false);
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

router.post("/", upload.single("image"), createStory);
router.delete("/delete-story", deleteStory);
router.get("/user/:userId", getStoryByUser);
router.post("/:storyId/like", likeStory);
router.post("/:storyId/comment", commentStory);
router.get("/viewers/:userId", getStoryViewers);
router.patch("/visibility/:userId", updateStoryVisibility);

export default router;
