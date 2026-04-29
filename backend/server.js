// ============================================================
//  GamerMind AI — Backend Server (Free APIs)
//  Uses: Google Gemini (FREE) + Groq fallback (FREE)
//  File: server.js
// ============================================================

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const rateLimit = require("express-rate-limit");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: "*" }));
app.use(express.json());

// Rate limiter
const limiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
app.use("/api/", limiter);

// ─── Routes ──────────────────────────────────────────────────
app.use("/api/chat", require("./routes/chat"));
app.use("/api/wiki", require("./routes/wiki"));
app.use("/api/map", require("./routes/map"));

// Serve frontend (so visiting http://localhost:5000/ works)
// The frontend lives at repo-root `/frontend`.
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
