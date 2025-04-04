import express from "express";
import {
  addChatUser,
  getChatUsers,
  deleteChatUser,
  
} from "../controllers/chatUser.controller.js"; // Moved to a separate controller file
import isAuthenticated from "../middlewares/isAuthenticated.js";

const router = express.Router();

// Chat Routes
router.post("/chat-users", addChatUser);
router.get("/chat-users", getChatUsers);
router.delete("/chat-users/:userId", deleteChatUser);
router.post("/chat-user/add", addChatUser);
export default router;
