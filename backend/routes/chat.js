// ============================================================
//  GamerMind AI — Chat Routes (with URL Verification)
//  File: routes/chat.js
// ============================================================

const express = require("express");
const router = express.Router();
const { handleChat, handleChatStream } = require("../services/chatHandlers");

// POST /api/chat
// Body: { message, history, verificationUrl }
//
// verificationUrl → user pastes a link (e.g. Fandom wiki page, MapGenie, IGN guide)
// locationService will fetch that URL and verify the location exists before saving

router.post("/", handleChat);

// ─── POST /api/chat/stream ────────────────────────────────────
router.post("/stream", handleChatStream);

module.exports = router;
