import mongoose from "mongoose";
import { User } from "../models/user.model.js";
async function resetAllBlueTicks() {
  try {
    await mongoose.connect(
      "mongodb+srv://saifurrehman0708:saifurrehman0708@instagramclone.ec0iq.mongodb.net/InstagramClone?retryWrites=true&w=majority&appName=InstagramClone",
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }
    );

    const updateResult = await User.updateMany(
      {}, // Empty filter to match all users
      { $set: { blueTick: false } }
    );

    console.log("BlueTick reset complete:", {
      updatedCount: updateResult.modifiedCount,
    });

    mongoose.disconnect();
  } catch (error) {
    console.error("Error resetting blueTick:", error);
  }
}

resetAllBlueTicks();
