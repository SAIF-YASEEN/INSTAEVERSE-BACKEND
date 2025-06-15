import mongoose from "mongoose";
import { User } from "../models/user.model";

async function initializeCloseFriends() {
  try {
    await mongoose.connect("mongodb://localhost:27017/yourDatabaseName", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    await User.updateMany(
      { closeFriends: { $exists: false } },
      { $set: { closeFriends: [] } }
    );
    console.log("Updated users with closeFriends field");
    await mongoose.disconnect();
  } catch (error) {
    console.error("Error updating users:", error);
  }
}

initializeCloseFriends();
