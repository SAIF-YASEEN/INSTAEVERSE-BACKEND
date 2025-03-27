import mongoose from "mongoose";
import { User } from "../models/user.model.js";

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("mongodb connected successfully.");
  } catch (error) {
    console.log(error);
  }
};

export const fixFeed = async () => {
  try {
    const users = await User.find({ "feed.0": { $type: "array" } }); // Find users with nested arrays
    for (const user of users) {
      const flatFeed = user.feed.flat(); // Flatten nested arrays
      await User.updateOne({ _id: user._id }, { $set: { feed: flatFeed } });
      console.log(`Fixed feed for user ${user._id}: ${flatFeed}`);
    }
    console.log("Feed fixing complete.");
  } catch (error) {
    console.error("Error fixing feed:", error);
  }
  // Removed mongoose.connection.close() to keep the connection alive
};

export default connectDB;
