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
} from "../controllers/user.controller.js";
import isAuthenticated from "../middlewares/isAuthenticated.js";
import upload from "../middlewares/multer.js";
import { getFollowNotifications } from "../controllers/followNotificationsController.js"; // Import the new controller
const router = express.Router();

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
router.post("/remove-follower/:id", isAuthenticated, removeFollower); // Added isAuthenticated
router.route("/feed").get(isAuthenticated, getUserFeed);
router
  .route("/follow-notifications/:userId")
  .get(isAuthenticated, getFollowNotifications); // New route
export default router;
