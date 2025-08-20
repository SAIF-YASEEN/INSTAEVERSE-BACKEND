// controllers/explore.controller.js
import { Post } from "../models/post.model.js";
import SearchTerm from "../models/SearchTerm.model.js";
import { User } from "../models/user.model.js";
// Fetch all posts with pagination
export const getAllExplorePosts = async (req, res) => {
  try {
    console.log("getAllExplorePosts route hit", req.query);
    const { page = 1, limit = 20, category } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let query = {};
    if (category && category.trim()) {
      query.categories = { $in: [category.trim().toLowerCase()] };
    }

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select(
        "author caption image video type categories likes viewCount comments createdAt" // Changed 'views' to 'viewCount'
      )
      .populate({ path: "author", select: "username profilePicture blueTick" });

    const totalPosts = await Post.countDocuments(query);
    console.log("getAllExplorePosts response", {
      posts: posts.length,
      totalPosts,
      hasMore: skip + posts.length < totalPosts,
    });

    return res.status(200).json({
      posts,
      totalPosts,
      hasMore: skip + posts.length < totalPosts,
      success: true,
    });
  } catch (error) {
    console.error("Error in getAllExplorePosts:", error);
    return res
      .status(500)
      .json({ message: "Server error while fetching posts", success: false });
  }
};

// Fetch trending searches
export const getTrendingSearches = async (req, res) => {
  try {
    console.log("getTrendingSearches route hit", req.query);
    const trendingSearches = await SearchTerm.find()
      .sort({ count: -1, lastSearched: -1 })
      .limit(5)
      .select("term count");
    console.log("getTrendingSearches response", { trending: trendingSearches });
    res.status(200).json({ success: true, trending: trendingSearches });
  } catch (error) {
    console.error("Error fetching trending searches:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Save search term
export const saveSearchTerm = async (req, res) => {
  try {
    console.log("saveSearchTerm route hit", req.body);
    const { searchTerm } = req.body;
    if (!searchTerm || searchTerm.trim() === "") {
      console.log("saveSearchTerm: Missing search term");
      return res
        .status(400)
        .json({ success: false, message: "Search term is required" });
    }

    const term = searchTerm.trim().toLowerCase();
    let searchDoc = await SearchTerm.findOne({ term });

    if (searchDoc) {
      searchDoc.count += 1;
      searchDoc.lastSearched = Date.now();
      await searchDoc.save();
      console.log("saveSearchTerm: Updated existing term", {
        term,
        count: searchDoc.count,
      });
    } else {
      searchDoc = new SearchTerm({ term });
      await searchDoc.save();
      console.log("saveSearchTerm: Created new term", { term });
    }

    console.log("saveSearchTerm response", { message: "Search term saved" });
    res.status(200).json({ success: true, message: "Search term saved" });
  } catch (error) {
    console.error("Error saving search term:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Fetch user feed
export const getUserFeed = async (req, res) => {
  try {
    console.log("getUserFeed route hit", req.query);
    const { userId } = req.query;
    if (!userId) {
      console.log("getUserFeed: Missing userId");
      return res
        .status(400)
        .json({ success: false, message: "User ID is required" });
    }

    const user = await User.findById(userId).select("feed");
    if (!user) {
      console.log("getUserFeed: User not found", { userId });
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    console.log("getUserFeed response", { feed: user.feed || [] });
    res.status(200).json({ success: true, feed: user.feed || [] });
  } catch (error) {
    console.error("Error fetching user feed:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Update user feed
export const updateUserFeed = async (req, res) => {
  try {
    console.log("updateUserFeed route hit", req.body);
    const { userId, searchTerm } = req.body;
    if (!userId) {
      console.log("updateUserFeed: Missing userId");
      return res
        .status(400)
        .json({ message: "User ID is required", success: false });
    }

    if (!searchTerm || typeof searchTerm !== "string") {
      console.log("updateUserFeed: Invalid search term");
      return res
        .status(400)
        .json({ message: "Valid search term required", success: false });
    }

    const trimmedSearchTerm = searchTerm.trim().toLowerCase();
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $addToSet: { feed: trimmedSearchTerm } },
      { new: true, select: "feed" }
    );

    if (!updatedUser) {
      console.log("updateUserFeed: User not found", { userId });
      return res
        .status(404)
        .json({ message: "User not found", success: false });
    }

    console.log("updateUserFeed response", {
      message: "Feed updated with search term",
      feed: updatedUser.feed,
    });
    return res.status(200).json({
      message: "Feed updated with search term",
      feed: updatedUser.feed,
      success: true,
    });
  } catch (error) {
    console.error("Error in updateUserFeed:", error);
    return res.status(500).json({
      message: "Something went wrong",
      success: false,
    });
  }
};
