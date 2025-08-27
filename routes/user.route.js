import express from "express";
import {
  register,
  login,
  logout,
  getProfile,
  editProfile,
  getSuggestedUsers,
  followOrUnfollow,
  getUsersByIds,
  getConexmateUsers,
  removeFollower,
  getUserFeed,
  addChatUser,
  removeChatUser,
  getChatUsers,
  checkFollowRequest,
  updatePrivacy,
  acceptFollowRequest,
  declineFollowRequest,
} from "../controllers/user.controller.js";
import { getFollowNotifications } from "../controllers/followNotificationsController.js";
import isAuthenticated from "../middlewares/isAuthenticated.js";
import upload from "../middlewares/multer.js";

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
router
  .route("/accept-follow-request/:id")
  .post(isAuthenticated, acceptFollowRequest);
router
  .route("/decline-follow-request/:id")
  .post(isAuthenticated, declineFollowRequest);
router.post("/get-users-by-ids", isAuthenticated, getUsersByIds);
router.post("/get-conexmate-users", isAuthenticated, getConexmateUsers);
router.get("/check-follow-request", isAuthenticated, checkFollowRequest);
router.post("/remove-follower/:id", isAuthenticated, removeFollower);
router.route("/feed").get(isAuthenticated, getUserFeed);
router
  .route("/follow-notifications/:userId")
  .get(isAuthenticated, getFollowNotifications);
router.post("/chat-user/add", isAuthenticated, addChatUser);
router.post("/chat-user/remove", isAuthenticated, removeChatUser);
router.get("/chat-user", isAuthenticated, getChatUsers);
router.post("/update-privacy", isAuthenticated, updatePrivacy);

export default router;
