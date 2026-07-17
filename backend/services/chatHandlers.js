const axios = require("axios");
const { chat, buildSystemPrompt, detectQuestionType, detectSkillLevel } = require("../services/aiService");
const { searchWiki } = require("../services/fandomService");
const { getMapData } = require("../services/locationService");
const { detectGame } = require("../services/gameDetector");

async function handleChat(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message, history = [], verificationUrl = null } = req.body || {};

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message is required" });
  }

  try {
    const detectedGame = await detectGame(message, history);
    const wikiContext = detectedGame
      ? await searchWiki(detectedGame, message)
      : null;
    const mapData = detectedGame
      ? await getMapData(detectedGame, message, verificationUrl)
      : null;

    const { text, provider, questionType, skillLevel } = await chat(
      message,
      history,
      wikiContext,
      detectedGame
    );

    res.json({
      reply: text,
      provider,
      detectedGame,
      questionType,
      skillLevel,
      wikiUsed: wikiContext ? { title: wikiContext.title, url: wikiContext.url } : null,
      mapData,
      mapVerified: mapData?.source === "ai-verified",
      mapSource: mapData?.source || null,
    });
  } catch (err) {
    console.error("[/api/chat]", err.message);
    res.status(500).json({ error: err.message });
  }
}

async function handleChatStream(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message, history = [], verificationUrl = null } = req.body || {};

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message is required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const keepAlive = setInterval(() => {
    res.write(": ping\n\n");
    if (res.flush) res.flush();
  }, 5000);

  res.on("close", () => clearInterval(keepAlive));

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (res.flush) res.flush();
  };

  try {
    const detectedGame = await detectGame(message, history);
    send({ type: "meta", detectedGame });

    const [wikiContext, mapData] = await Promise.all([
      detectedGame ? searchWiki(detectedGame, message) : Promise.resolve(null),
      detectedGame ? getMapData(detectedGame, message, verificationUrl) : Promise.resolve(null),
    ]);

    if (wikiContext) send({ type: "wiki", title: wikiContext.title, url: wikiContext.url });
    if (mapData) send({ type: "map", mapData });

    const questionType = detectQuestionType(message);
    const skillLevel = detectSkillLevel(message, history);
    const systemPrompt = buildSystemPrompt(wikiContext, questionType, skillLevel, detectedGame);
    send({ type: "meta", questionType, skillLevel });

    let streamed = false;

    if (process.env.GEMINI_API_KEY) {
      try {
        send({ type: "status", message: "🤖 Thinking..." });
        await streamGemini(message, history, systemPrompt, send);
        streamed = true;
      } catch (err) {
        const status = err.response?.status;
        console.warn(`[stream] Gemini failed (${status}):`, err.message);
        if (status === 503 || status === 429 || status === 500 || status === 404) {
          send({ type: "status", message: "⚡ Still working on it..." });
        } else {
          throw err;
        }
      }
    }

    if (!streamed && process.env.GROQ_API_KEY) {
      try {
        send({ type: "status", message: "🤖 Thinking..." });
        await streamGroq(message, history, systemPrompt, send);
        streamed = true;
      } catch (err) {
        const status = err.response?.status;
        console.warn(`[stream] Groq failed (${status}):`, err.message);
        if (status === 503 || status === 429 || status === 500 || status === 404) {
          send({ type: "error", message: "⚠️ The AI is temporarily unavailable. Please try again in a moment." });
        } else {
          throw err;
        }
      }
    }

    if (!streamed) {
      send({ type: "error", message: "⚠️ The AI is currently unavailable. Please try again shortly." });
    }
  } catch (err) {
    console.error("[/api/chat/stream]", err.message);
    send({ type: "error", message: `Server error: ${err.message}` });
  } finally {
    clearInterval(keepAlive);
    send({ type: "done" });
    res.end();
  }
}

async function streamGemini(message, history, systemPrompt, send) {
  const MAX_RETRIES = 2;
  const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  const contents = [
    ...history.slice(-8).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await axios.post(
        GEMINI_URL,
        {
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
        },
        {
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": process.env.GEMINI_API_KEY,
          },
          timeout: 60000,
        }
      );

      const fullText = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!fullText) throw new Error("Empty response from Gemini");

      const words = fullText.split(/(\s+)/);
      for (const word of words) {
        send({ type: "delta", text: word });
        await new Promise((r) => setTimeout(r, 10));
      }

      send({ type: "provider", name: "Google Gemini 2.0 Flash (Free)" });
      return;
    } catch (err) {
      const status = err.response?.status;
      console.warn(`[Gemini] Attempt ${attempt}/${MAX_RETRIES} failed (${status}):`, err.message);
      if (attempt < MAX_RETRIES && (status === 503 || status === 500 || status === 404 || status === 429)) {
        send({ type: "status", message: `⏳ Retrying... (attempt ${attempt + 1}/${MAX_RETRIES})` });
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }
  }
}

async function streamGroq(message, history, systemPrompt, send) {
  const MAX_RETRIES = 2;
  const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        { model: GROQ_MODEL, messages, max_tokens: 1024, temperature: 0.7, stream: true },
        {
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
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
            const json = JSON.parse(raw);
            const delta = json?.choices?.[0]?.delta?.content || "";
            if (delta) send({ type: "delta", text: delta });
          } catch {}
        }
      });

      await new Promise((resolve, reject) => {
        response.data.on("end", resolve);
        response.data.on("error", reject);
      });

      send({ type: "provider", name: "Groq Llama3-70B (Free)" });
      return;
    } catch (err) {
      const status = err.response?.status;
      console.warn(`[Groq] Attempt ${attempt}/${MAX_RETRIES} failed (${status}):`, err.message);
      if (attempt < MAX_RETRIES && (status === 503 || status === 500)) {
        send({ type: "status", message: `⏳ Retrying... (attempt ${attempt + 1}/${MAX_RETRIES})` });
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }
  }
}

module.exports = {
  handleChat,
  handleChatStream,
};
