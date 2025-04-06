import express from "express";
import {
  addChatUser,
  getChatUsers,
  deleteChatUser,
} from "../controllers/chatUser.controller.js";

const router = express.Router();

// Chat Routes
router.post("/add", addChatUser);
router.get("/", getChatUsers);
router.delete("/:userId", deleteChatUser);

export default router;