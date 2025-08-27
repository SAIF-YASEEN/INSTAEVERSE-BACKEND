import express from "express";
import isAuthenticated from "../middlewares/isAuthenticated.js";
import upload from "../middlewares/multer.js";
import {
  addNewPost,
  getAllPost,
  getUserPost,
  likePost,
  dislikePost,
  addComment,
  getMaxMetrics,
  getCommentsOfPost,
  deletePost,
  bookmarkPost,
  getDislikesOfPost,
  getPostStats,
  sharePost,
  recordPostView,
  getAllReels,
  getFriendsReels,
  getFollowingReels,
  getLikesOfPost,
  getRelevantReels,
  reportPost,
} from "../controllers/post.controller.js";

const router = express.Router();

// Post creation and management
router
  .route("/addpost")
  .post(isAuthenticated, upload.single("media"), addNewPost);
// router.route("/all").get(isAuthenticated, getAllPost);
// router.route("/userpost/all").get(isAuthenticated, getUserPost);
router.route("/reels").get(isAuthenticated, getAllReels);
router
  .route("/reels/following/:userId")
  .get(isAuthenticated, getFollowingReels);
router.route("/reels/friends/:userId").get(isAuthenticated, getFriendsReels);
router.route("/delete/:id").delete(isAuthenticated, deletePost);

// Engagement routes
router.route("/:id/like").post(isAuthenticated, likePost);
router.route("/getlikesofpost/:postId").get(isAuthenticated, getLikesOfPost);
router.route("/:id/dislike").post(isAuthenticated, dislikePost);
router
  .route("/getdislikesofpost/:postId")
  .get(isAuthenticated, getDislikesOfPost);
router.route("/:id/bookmark").get(isAuthenticated, bookmarkPost);

// Comment routes
router.route("/:id/comment").post(isAuthenticated, addComment);
router.route("/:id/comment/all").post(isAuthenticated, getCommentsOfPost);

// View, share, and report routes
router.route("/:id/stats").post(isAuthenticated, getPostStats);
router.route("/share").post(isAuthenticated, sharePost);
router.route("/view").post(isAuthenticated, recordPostView);
router.route("/:id/report").post(isAuthenticated, reportPost);

// Reel-specific routes
router.route("/reels").get(isAuthenticated, getAllReels);
router
  .route("/reels/following/:userId")
  .get(isAuthenticated, getFollowingReels);
router.route("/reels/relevant").get(isAuthenticated, getRelevantReels);
router.route("/max-metrics").get(isAuthenticated, getMaxMetrics);

export default router;
