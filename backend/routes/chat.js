// ============================================================
//  GamerMind AI — Chat Routes (with URL Verification)
//  File: routes/chat.js
// ============================================================

const express = require("express");
const router  = express.Router();
const axios   = require("axios");
const { chat, buildSystemPrompt, detectQuestionType, detectSkillLevel } = require("../services/aiService");
const { searchWiki }  = require("../services/fandomService");
const { getMapData }  = require("../services/locationService");
const { detectGame }  = require("../services/gameDetector");

// POST /api/chat
// Body: { message, history, verificationUrl }
//
// verificationUrl → user pastes a link (e.g. Fandom wiki page, MapGenie, IGN guide)
// locationService will fetch that URL and verify the location exists before saving

router.post("/", async (req, res) => {
  const { message, history = [], verificationUrl = null } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message is required" });
  }

  try {
    // 1. Detect game (AI-powered with conversation context)
    const detectedGame = await detectGame(message, history);

    // 2. Fandom wiki context for AI answer
    const wikiContext = detectedGame
      ? await searchWiki(detectedGame, message)
      : null;

    // 3. Map coordinates with URL verification
    //    verificationUrl comes from the frontend (user pastes a link)
    const mapData = detectedGame
      ? await getMapData(detectedGame, message, verificationUrl)
      : null;

    // 4. AI chat answer — now passes detectedGame for better prompting
    const { text, provider, questionType, skillLevel } = await chat(
      message,
      history,
      wikiContext,
      detectedGame   // ← NEW: passed so prompt is game-specific
    );

    // 5. Send response
    res.json({
      reply:        text,
      provider,
      detectedGame,
      questionType,  // ← NEW: "location" | "boss" | "build" | "lore" etc.
      skillLevel,    // ← NEW: "beginner" | "intermediate" | "expert"
      wikiUsed:     wikiContext ? { title: wikiContext.title, url: wikiContext.url } : null,
      mapData,
      // Tell frontend whether it was verified or not
      mapVerified:  mapData?.source === "ai-verified",
      mapSource:    mapData?.source || null,
    });

  } catch (err) {
    console.error("[/api/chat]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/chat/stream ────────────────────────────────────
router.post("/stream", async (req, res) => {
  const { message, history = [], verificationUrl = null } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message is required" });
  }

  // SSE Headers
  res.setHeader("Content-Type",                "text/event-stream");
  res.setHeader("Cache-Control",               "no-cache");
  res.setHeader("Connection",                  "keep-alive");
  res.setHeader("X-Accel-Buffering",           "no");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  // Keep-alive ping every 5s
  const keepAlive = setInterval(() => {
    res.write(": ping\n\n");
    if (res.flush) res.flush();
  }, 5000);

  res.on("close", () => clearInterval(keepAlive));

  // Send helper — force flush
  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (res.flush) res.flush();
  };

  try {
    // Step 1: Detect game
    const detectedGame = await detectGame(message, history);
    send({ type: "meta", detectedGame });

    // Step 2: Fetch wiki + map in parallel
    const [wikiContext, mapData] = await Promise.all([
      detectedGame ? searchWiki(detectedGame, message)                      : Promise.resolve(null),
      detectedGame ? getMapData(detectedGame, message, verificationUrl)     : Promise.resolve(null),
    ]);

    if (wikiContext) send({ type: "wiki", title: wikiContext.title, url: wikiContext.url });
    if (mapData)     send({ type: "map",  mapData });

    // Step 3: Build prompt
    const questionType = detectQuestionType(message);
    const skillLevel   = detectSkillLevel(message, history);
    const systemPrompt = buildSystemPrompt(wikiContext, questionType, skillLevel, detectedGame);
    send({ type: "meta", questionType, skillLevel });

    // Step 4: Stream AI with auto fallback
    let streamed = false;

    // Try Gemini first
    if (process.env.GEMINI_API_KEY) {
      try {
        send({ type: "status", message: "🤖 Connecting to Gemini..." });
        await streamGemini(message, history, systemPrompt, send);
        streamed = true;
      } catch (err) {
        const status = err.response?.status;
        console.warn(`[stream] Gemini failed (${status}):`, err.message);
        if (status === 503 || status === 429 || status === 500 || status === 404) {
          send({ type: "status", message: "⚡ Gemini unavailable — switching to Groq..." });
        } else {
          throw err;
        }
      }
    }

    // Fallback to Groq
    if (!streamed && process.env.GROQ_API_KEY) {
      try {
        send({ type: "status", message: "🤖 Connecting to Groq..." });
        await streamGroq(message, history, systemPrompt, send);
        streamed = true;
      } catch (err) {
        const status = err.response?.status;
        console.warn(`[stream] Groq failed (${status}):`, err.message);
        if (status === 503 || status === 429 || status === 500 || status === 404) {
          send({ type: "error", message: "⚠️ Both Gemini and Groq are unavailable. Please try again in a moment." });
        } else {
          throw err;
        }
      }
    }

    if (!streamed) {
      send({ type: "error", message: "⚠️ No AI provider available. Check your API keys in .env" });
    }

  } catch (err) {
    console.error("[/api/chat/stream]", err.message);
    send({ type: "error", message: `Server error: ${err.message}` });
  } finally {
    clearInterval(keepAlive);
    send({ type: "done" });
    res.end();
  }
});

// ─── Gemini Streaming with retry ─────────────────────────────
async function streamGemini(message, history, systemPrompt, send) {
  const MAX_RETRIES  = 2;
  const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  const contents = [
    ...history.slice(-8).map(m => ({
      role:  m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Use non-streaming API and manually stream the response
      const res = await axios.post(GEMINI_URL, {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
      }, {
        headers: {
          "Content-Type":   "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
        timeout: 60000,
      });

      // Extract full response
      const fullText = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!fullText) throw new Error("Empty response from Gemini");

      // Stream word by word
      const words = fullText.split(/(\s+)/);
      for (const word of words) {
        send({ type: "delta", text: word });
        // Small delay for streaming effect
        await new Promise(r => setTimeout(r, 10));
      }

      send({ type: "provider", name: "Google Gemini 2.0 Flash (Free)" });
      return; // success

    } catch (err) {
      const status = err.response?.status;
      console.warn(`[Gemini] Attempt ${attempt}/${MAX_RETRIES} failed (${status}):`, err.message);
      if (attempt < MAX_RETRIES && (status === 503 || status === 500 || status === 404 || status === 429)) {
        send({ type: "status", message: `⏳ Retrying... (attempt ${attempt + 1}/${MAX_RETRIES})` });
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }
  }
}

// ─── Groq Streaming with retry ────────────────────────────────
async function streamGroq(message, history, systemPrompt, send) {
  const MAX_RETRIES = 2;
  const GROQ_MODEL  = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-8).map(m => ({ role: m.role, content: m.content })),
    { role: "user",   content: message },
  ];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        { model: GROQ_MODEL, messages, max_tokens: 1024, temperature: 0.7, stream: true },
        {
          headers: {
            Authorization:  `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          responseType: "stream",
          timeout: 60000,
        }
      );

      let buffer = "";
      response.data.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (raw === "[DONE]") continue;
          try {
            const json  = JSON.parse(raw);
            const delta = json?.choices?.[0]?.delta?.content || "";
            if (delta) send({ type: "delta", text: delta });
          } catch {}
        }
      });

      await new Promise((resolve, reject) => {
        response.data.on("end",   resolve);
        response.data.on("error", reject);
      });

      send({ type: "provider", name: "Groq Llama3-70B (Free)" });
      return; // success

    } catch (err) {
      const status = err.response?.status;
      console.warn(`[Groq] Attempt ${attempt}/${MAX_RETRIES} failed (${status}):`, err.message);
      if (attempt < MAX_RETRIES && (status === 503 || status === 500)) {
        send({ type: "status", message: `⏳ Retrying Groq... (attempt ${attempt + 1}/${MAX_RETRIES})` });
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }
  }
}

module.exports = router;
