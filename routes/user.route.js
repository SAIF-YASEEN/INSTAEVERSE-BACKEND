import express from "express";
import {
  editProfile,
  followOrUnfollow,
  getProfile,
  getSuggestedUsers,
  login,
  logout,
  register,
  getUsersByIds,
  removeFollower,
  getUserFeed,
  getLikesOfPost,
} from "../controllers/user.controller.js";
import isAuthenticated from "../middlewares/isAuthenticated.js";
import upload from "../middlewares/multer.js";
import { getFollowNotifications } from "../controllers/followNotificationsController.js";

const router = express.Router();

// User Routes
router.route("/register").post(register);
router.route("/login").post(login);
router.route("/logout").get(logout);
router.route("/:id/profile").get(isAuthenticated, getProfile);
router
  .route("/profile/edit")
  .post(isAuthenticated, upload.single("profilePhoto"), editProfile);
router.route("/suggested").get(isAuthenticated, getSuggestedUsers);
router.route("/followorunfollow/:id").post(isAuthenticated, followOrUnfollow);
router.post("/get-users-by-ids", isAuthenticated, getUsersByIds);
router.post("/remove-follower/:id", isAuthenticated, removeFollower);
router.route("/feed").get(isAuthenticated, getUserFeed);
router
  .route("/follow-notifications/:userId")
  .get(isAuthenticated, getFollowNotifications);
router.post("/getlikesofpost", isAuthenticated, getLikesOfPost);

export default router;
