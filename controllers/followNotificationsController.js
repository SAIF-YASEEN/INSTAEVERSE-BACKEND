import { User } from "../models/user.model.js";

// Fetch follow notifications for a user
export const getFollowNotifications = async (req, res) => {
  try {
    const userId = req.params.userId;

    // Find the user and populate followTimestamps
    const user = await User.findById(userId).select("followTimestamps");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Map followTimestamps to notification format
    const followNotifications = user.followTimestamps.map((ft) => ({
      type: "follow",
      userId: ft.userId,
      timestamp: ft.timestamp,
    }));

    // Fetch user details for each follower
    const userIds = followNotifications.map((n) => n.userId);
    if (userIds.length > 0) {
      const users = await User.find({ _id: { $in: userIds } })
        .select("_id username profilePicture")
        .lean();
      const userMap = new Map(users.map((u) => [u._id.toString(), u]));

      const enrichedFollowNotifications = followNotifications.map((n) => ({
        ...n,
        userDetails: {
          username: userMap.get(n.userId.toString())?.username || "Unknown",
          profilePicture:
            userMap.get(n.userId.toString())?.profilePicture ||
            "https://example.com/default-avatar.jpg",
        },
      }));

      return res.status(200).json({
        success: true,
        followNotifications: enrichedFollowNotifications,
      });
    }

    return res.status(200).json({
      success: true,
      followNotifications: [],
    });
  } catch (error) {
    console.error("Get Follow Notifications Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
