// routes/explore.route.js
import express from "express";
import isAuthenticated from "../middlewares/isAuthenticated.js";
import {
  getAllExplorePosts,
  getTrendingSearches,
  saveSearchTerm,
  getUserFeed,
  updateUserFeed,
} from "../controllers/Explore.controller.js";

const router = express.Router();

// Post route
router.route("/posts/all").get(isAuthenticated, getAllExplorePosts);

// Search routes
router.route("/search").post(isAuthenticated, saveSearchTerm);
router.route("/search/trending").get(isAuthenticated, getTrendingSearches);

// User feed routes
router.route("/user/feed").get(isAuthenticated, getUserFeed);
router.route("/user/feed/update").post(isAuthenticated, updateUserFeed);

export default router;
