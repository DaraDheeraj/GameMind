// ============================================================
//  GamerMind AI — Enhanced AI Service
//  Improvements:
//  1. Gaming personality prompt
//  2. Structured output format (sections every time)
//  3. Context-aware prompts (location/boss/build/lore/secret)
//  4. Follow-up suggestions after every answer
//  File: services/aiService.js
// ============================================================

const axios = require("axios");

// ─── Provider configs ─────────────────────────────────────────
const PROVIDERS = {
  gemini: {
    name: "Google Gemini 1.5 Flash",
    available: () => !!process.env.GEMINI_API_KEY,
    call: callGemini,
  },
  groq: {
    name: "Groq Llama3",
    available: () => !!process.env.GROQ_API_KEY,
    call: callGroq,
  },
};

// ─── 1. DETECT QUESTION TYPE ─────────────────────────────────
// Figures out what kind of question the user is asking
// so we can use the right specialized prompt
function detectQuestionType(message) {
  const m = message.toLowerCase();

  if (/where|location|find|map|coordinates|spawn|drop/.test(m))
    return "location";

  if (/how to beat|defeat|kill|boss|strategy|weakness|cheese/.test(m))
    return "boss";

  if (/build|best weapon|best armor|loadout|stats|class|spec|tier|op|meta/.test(m))
    return "build";

  if (/lore|story|who is|what is|history|backstory|explain|meaning/.test(m))
    return "lore";

  if (/secret|easter egg|hidden|missable|unlock|glitch|exploit/.test(m))
    return "secret";

  if (/how do i|how to|tutorial|guide|steps|walkthrough/.test(m))
    return "walkthrough";

  return "general";
}

// ─── 2. DETECT PLAYER SKILL LEVEL ────────────────────────────
function detectSkillLevel(message, history = []) {
  const all = [message, ...history.slice(-4).map(m => m.content)].join(" ").toLowerCase();

  if (/noob|beginner|new to|just started|first time|help me start|what do i do/.test(all))
    return "beginner";

  if (/optimal|dps|min.?max|meta|theorycraft|spreadsheet|frame data|advanced/.test(all))
    return "expert";

  return "intermediate";
}

// ─── 3. SPECIALIZED PROMPT PER QUESTION TYPE ─────────────────
function getTypePrompt(questionType, skillLevel) {
  const skillNote = {
    beginner:     "The player is a beginner — use simple language, explain terms, be encouraging.",
    intermediate: "The player has some experience — balance detail with clarity.",
    expert:       "The player is experienced — give exact numbers, stats, and advanced techniques.",
  }[skillLevel];

  const typePrompts = {
    location: `
QUESTION TYPE: Location / Where to Find
- Start with the EXACT location immediately
- Name the region, area, and nearby landmarks
- Give step-by-step directions to reach it
- Mention coordinates or map markers if known
- Note any requirements to access the area`,

    boss: `
QUESTION TYPE: Boss Strategy
- Start with the boss's key weakness immediately
- List attack patterns to watch for
- Give the optimal strategy step by step
- Mention best weapons/spells/items to use
- Include a cheese method if one exists
- Note phase transitions`,

    build: `
QUESTION TYPE: Build / Loadout
- Start with the BEST option for current meta
- Give exact stats, levels, and numbers
- Explain why this build works (synergies)
- List required items and where to get them
- Include budget alternative if expensive
- Mention patch version if relevant`,

    lore: `
QUESTION TYPE: Lore / Story
- Tell the story engagingly like a narrator
- Name all key characters involved
- Explain motivations and connections
- Include hidden details most players miss
- Connect to broader game world lore`,

    secret: `
QUESTION TYPE: Secret / Easter Egg
- Describe exactly HOW to trigger/find it
- Give precise location with landmarks
- List any specific requirements or conditions
- Explain the reward or what happens
- Add context on why it was hidden there`,

    walkthrough: `
QUESTION TYPE: Walkthrough / How-To
- Number every step clearly
- Be specific — no vague instructions
- Mention common mistakes to avoid
- Include optional objectives
- Note if order matters`,

    general: `
QUESTION TYPE: General Gaming Question
- Answer directly and completely
- Cover all important aspects
- Use examples where helpful`,
  };

  return `${typePrompts[questionType] || typePrompts.general}\n\nSKILL LEVEL NOTE: ${skillNote}`;
}

// ─── 4. FOLLOW-UP SUGGESTIONS GENERATOR ──────────────────────
function getFollowUpPrompt(detectedGame) {
  return `
After your answer, always add this exact section at the end:

---
💡 **You might also want to know:**
→ [related question 1 specific to ${detectedGame || "this game"}]
→ [related question 2 specific to ${detectedGame || "this game"}]
→ [related question 3 specific to ${detectedGame || "this game"}]

Make the follow-up questions genuinely useful and specific to what was just asked.`;
}

// ─── 5. STRUCTURED OUTPUT FORMAT ─────────────────────────────
const STRUCTURE_PROMPT = `
RESPONSE STRUCTURE — always follow this exact format:

## 🎮 In Short Answer
[One sentence direct answer — no fluff]

## 📖 Details
[Full explanation with all important information]

## 💡 Tips & Tricks
[2-4 practical tips the player should know]

## ⚠️ Common Mistakes
[1-2 mistakes players often make — skip if not applicable]

## 🎮 Pro Tip
[One expert-level insight that most guides miss]`;

// ─── 6. GAMING PERSONALITY ────────────────────────────────────
const PERSONALITY_PROMPT = `
PERSONALITY:
- You are a veteran gamer with 10,000+ hours across all genres
- You speak like a passionate, knowledgeable friend — not a textbook
- Get genuinely excited about clever builds, hidden secrets, and lore
- Use gaming terms naturally (aggro, proc, meta, cheese, tryhard, etc.)
- Never say "I cannot" or "I don't have information" — always give your best answer
- If something is debated in the community, say so honestly
- Roast bad strategies lovingly — "That'll work but you'll suffer 😂"`;

// ─── MAIN SYSTEM PROMPT BUILDER ──────────────────────────────
function buildSystemPrompt(wikiContext = null, questionType = "general", skillLevel = "intermediate", detectedGame = null) {
  const base = `You are GamerMind AI — the world's most knowledgeable gaming assistant.
${PERSONALITY_PROMPT}

${STRUCTURE_PROMPT}

${getTypePrompt(questionType, skillLevel)}

${getFollowUpPrompt(detectedGame)}

GENERAL RULES:
- Reference specific mechanics, characters, items, and stats
- Use markdown formatting (## headers, **bold**, bullet lists)
- Always cite sources when using wiki data`;

  if (!wikiContext) return base;

  return `${base}

════════════════════════════════
📖 LIVE FANDOM WIKI DATA
Game: ${wikiContext.game}
Article: ${wikiContext.title}
Source: ${wikiContext.url}

${wikiContext.content}
════════════════════════════════

Use the wiki data above to enhance your answer.
Cite naturally: "According to the ${wikiContext.game} Fandom Wiki..."`;
}

// ─── Google Gemini (FREE tier) ────────────────────────────────
async function callGemini(userMessage, history = [], wikiContext = null, questionType = "general", skillLevel = "intermediate", detectedGame = null) {
  const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  const contents = [];
  for (const msg of history.slice(-8)) {
    contents.push({
      role:  msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    });
  }
  contents.push({ role: "user", parts: [{ text: userMessage }] });

  const payload = {
    system_instruction: {
      parts: [{ text: buildSystemPrompt(wikiContext, questionType, skillLevel, detectedGame) }],
    },
    contents,
    generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
  };

  const res = await axios.post(GEMINI_URL, payload, {
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY,
    },
    timeout: 30000,
  });

  const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from Gemini");
  return { text, provider: "Google Gemini 1.5 Flash (Free)" };
}

// ─── Groq (FREE tier — very fast) ────────────────────────────
async function callGroq(userMessage, history = [], wikiContext = null, questionType = "general", skillLevel = "intermediate", detectedGame = null) {
  const messages = [
    { role: "system", content: buildSystemPrompt(wikiContext, questionType, skillLevel, detectedGame) },
    ...history.slice(-8).map(m => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const res = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    { model: GROQ_MODEL, messages, max_tokens: 1024, temperature: 0.7 },
    {
      headers: {
        Authorization:  `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    }
  );

  const text = res.data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty response from Groq");
  return { text, provider: "Groq Llama3-70B (Free)" };
}

// ─── MAIN chat function ───────────────────────────────────────
async function chat(userMessage, history = [], wikiContext = null, detectedGame = null) {
  // Detect question type and skill level from message
  const questionType = detectQuestionType(userMessage);
  const skillLevel   = detectSkillLevel(userMessage, history);

  console.log(`[AI] Question type: ${questionType} | Skill level: ${skillLevel}`);

  const errors = [];

  for (const [name, provider] of Object.entries(PROVIDERS)) {
    if (!provider.available()) {
      errors.push(`${name}: API key not set`);
      continue;
    }

    try {
      console.log(`[AI] Trying ${provider.name}...`);
      const result = await provider.call(
        userMessage,
        history,
        wikiContext,
        questionType,
        skillLevel,
        detectedGame
      );
      console.log(`[AI] ✅ Success with ${provider.name}`);

      // Return with extra metadata
      return {
        ...result,
        questionType,
        skillLevel,
      };
    } catch (err) {
      console.warn(`[AI] ❌ ${provider.name} failed:`, err.message);
      errors.push(`${name}: ${err.message}`);
    }
  }

  throw new Error(
    `All AI providers failed:\n${errors.join("\n")}\n\nPlease set GEMINI_API_KEY or GROQ_API_KEY in your .env file.`
  );
}

module.exports = { chat, buildSystemPrompt, detectQuestionType, detectSkillLevel };
