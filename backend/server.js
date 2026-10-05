// ============================================================
//  GamerMind AI — Backend Server (Free APIs)
//  Uses: Google Gemini (FREE) + Groq fallback (FREE)
//  File: server.js
// ============================================================

const dns = require("dns");
dns.setDefaultResultOrder("ipv4first"); // Fix ENOTFOUND on Windows/IPv6-flaky networks

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const rateLimit = require("express-rate-limit");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: "*" }));
app.use(express.json());

// Rate limiter
const limiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
app.use("/api/", limiter);

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 8,
  message: { error: "You're sending messages too quickly. Please wait a moment." },
});

// In-memory daily budget cap for chat requests. This is only reliable on a
// persistent local/traditional server and may reset more often on Vercel.
let chatDailyCount = 0;
let chatDailyResetAt = Date.now() + 24 * 60 * 60 * 1000;

function chatDailyBudgetMiddleware(req, res, next) {
  const now = Date.now();
  const limit = Number(process.env.DAILY_CHAT_LIMIT || 300);

  if (now >= chatDailyResetAt) {
    chatDailyCount = 0;
    chatDailyResetAt = now + 24 * 60 * 60 * 1000;
  }

  if (chatDailyCount >= limit) {
    return res.status(429).json({ error: "Daily message limit reached. Please try again tomorrow." });
  }

  chatDailyCount += 1;
  return next();
}

// ─── Routes ──────────────────────────────────────────────────
app.use("/api/chat", chatLimiter);
app.use("/api/chat", chatDailyBudgetMiddleware);
app.use("/api/chat", require("./routes/chat"));
app.use("/api/wiki", require("./routes/wiki"));
app.use("/api/map", require("./routes/map"));

// Serve frontend (so visiting http://localhost:5000/ works)
// The frontend lives at repo-root `/frontend`.
app.use("/maps", express.static(path.join(__dirname, "public/maps")));
const frontendDir = path.join(__dirname, "..", "frontend");
app.use(express.static(frontendDir));
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    ai: process.env.GEMINI_API_KEY ? "Gemini (Free)" : process.env.GROQ_API_KEY ? "Groq (Free)" : "No AI key set",
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`🎮 GamerMind AI running on http://localhost:${PORT}`);
  console.log(`🤖 AI Provider: ${process.env.GEMINI_API_KEY ? "Google Gemini (FREE)" : process.env.GROQ_API_KEY ? "Groq (FREE)" : "⚠️  No API key found!"}`);
});
