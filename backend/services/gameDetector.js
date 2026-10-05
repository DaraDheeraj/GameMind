// ============================================================
//  GamerMind AI — AI-Powered Game Detector
//  File: services/gameDetector.js
//
//  OLD way → keyword matching (breaks easily)
//  NEW way → AI detects the game from full context
//
//  Examples:
//  "what sword in elden"         → elden ring ✅
//  "best ring build"             → elden ring ✅
//  "how to beat the flower lady" → elden ring (Malenia) ✅
//  "creeper explosion radius"    → minecraft ✅
//  "night city best district"    → cyberpunk 2077 ✅
// ============================================================

const axios = require("axios");

// ─── Supported games list ─────────────────────────────────────
const SUPPORTED_GAMES = [
  "minecraft",
  "fortnite",
  "elden ring",
  "dark souls",
  "dark souls 3",
  "gta v",
  "valorant",
  "league of legends",
  "cyberpunk 2077",
  "zelda breath of the wild",
  "zelda tears of the kingdom",
  "call of duty",
  "warzone",
  "pokemon",
  "overwatch 2",
  "apex legends",
  "destiny 2",
  "world of warcraft",
  "final fantasy xiv",
  "god of war",
  "red dead redemption 2",
  "halo infinite",
  "the witcher 3",
  "fallout 4",
  "skyrim",
  "diablo 4",
  "terraria",
  "roblox",
  "genshin impact",
  "honkai star rail",
  "counter strike 2",
  "dota 2",
  "hollow knight",
  "stardew valley",
  "dead by daylight",
  "among us",
  "baldurs gate 3",
  "hogwarts legacy",
];

// ─── Cache: avoid calling AI for same query twice ─────────────
const detectionCache = new Map();

// ─── OLD method: keyword matching (kept as fallback) ──────────
function keywordDetect(query) {
  const lower = query.toLowerCase();
  const KEYWORD_MAP = {
    "elden ring":      ["elden", "lands between", "malenia", "margit", "godrick", "radahn", "ranni", "limgrave", "caelid", "moonveil", "tarnished"],
    "minecraft":       ["minecraft", "creeper", "enderman", "nether", "stronghold", "herobrine", "dirt", "pickaxe", "steve", "bedrock", "overworld"],
    "gta v":           ["gta", "grand theft auto", "los santos", "trevor", "michael", "franklin", "rockstar", "maze bank", "chiliad"],
    "fortnite":        ["fortnite", "battle royale", "chapter", "llama", "storm", "zero build", "epic games"],
    "valorant":        ["valorant", "agent", "spike", "jett", "sage", "reyna", "riot games", "haven", "bind"],
    "cyberpunk 2077":  ["cyberpunk", "night city", "v ", "johnny silverhand", "arasaka", "corpo", "netrunner", "keanu"],
    "dark souls":      ["dark souls", "estus", "bonfire", "undead", "lordran", "anor londo", "praise the sun", "git gud"],
    "zelda":           ["zelda", "link", "hyrule", "ganon", "triforce", "korok", "sheikah", "botw", "totk"],
    "league of legends":["league", "lol", "champion", "rift", "baron", "nexus", "summoner", "jungler", "gank"],
    "apex legends":    ["apex", "legend", "wraith", "bloodhound", "caustic", "respawn", "kings canyon"],
    "minecraft":       [...new Set([
      "minecraft", "creeper", "enderman", "nether", "stronghold", "herobrine", "dirt", "pickaxe", "steve", "bedrock", "overworld",
      "minecraft", "creeper", "steve", "nether", "crafting", "redstone"
    ])],
    "baldurs gate 3":  ["baldur", "bg3", "larian", "astarion", "shadowheart", "gale", "faerun"],
    "hogwarts legacy": ["hogwarts", "hogwarts legacy", "wizarding", "magic spell", "expelliarmus"],
    "genshin impact":  ["genshin", "teyvat", "paimon", "mondstadt", "inazuma", "archon"],
    "pokemon":         ["pokemon", "pikachu", "pokeball", "gym", "trainer", "legendary", "evolution"],
  };

  let bestMatch = null;
  let bestScore = 0;

  for (const [game, keywords] of Object.entries(KEYWORD_MAP)) {
    const score = keywords.filter(k => lower.includes(k)).length;
    if (score > bestScore) { bestScore = score; bestMatch = game; }
  }

  return bestScore > 0 ? bestMatch : null;
}

// ─── NEW method: AI detection ─────────────────────────────────
async function aiDetect(query, conversationHistory = []) {
  try {
    // Build context from recent conversation
    const recentHistory = conversationHistory
      .slice(-4)
      .map(m => `${m.role}: ${m.content}`)
      .join("\n");

    const prompt = `You are a game detection expert.

Your job: identify which video game the user is asking about.

Supported games:
${SUPPORTED_GAMES.join(", ")}

${recentHistory ? `Recent conversation context:\n${recentHistory}\n` : ""}
User's current message: "${query}"

Rules:
- Use the conversation context to understand which game is being discussed
- Return ONLY the exact game name from the supported list
- If no game can be determined, return: null
- Do NOT explain — just return the game name or null

Examples:
"what sword should i use" + context "we were talking about elden ring" → elden ring
"how do i beat the flower lady" → elden ring
"best ring build" + context "dark souls discussion" → dark souls
"creeper explosion radius" → minecraft
"night city best district" → cyberpunk 2077
"how to get to diamond rank" + context "valorant tips" → valorant
"best jungler right now" → league of legends
"where is valhalla" → assassins creed (null - not in supported list)

Return:`;

    let text = null;

    // Try Gemini first
    if (process.env.GEMINI_API_KEY) {
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 32, temperature: 0 },
        },
        { headers: { "Content-Type": "application/json" }, timeout: 8000 }
      );
      text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase();
    }

    // Fallback to Groq
    else if (process.env.GROQ_API_KEY) {
      const res = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model: "llama3-70b-8192",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 32,
          temperature: 0,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 8000,
        }
      );
      text = res.data?.choices?.[0]?.message?.content?.trim().toLowerCase();
    }

    if (!text || text === "null") return null;

    // Clean up response — make sure it matches a supported game
    const cleaned = text.replace(/[^a-z0-9\s]/g, "").trim();
    const matched = SUPPORTED_GAMES.find(g =>
      cleaned.includes(g) || g.includes(cleaned)
    );

    return matched || null;

  } catch (err) {
    console.warn("[gameDetector] AI detection failed:", err.message);
    return null;
  }
}

// ─── MAIN: detectGame ─────────────────────────────────────────
// Tries AI first, falls back to keyword matching
// Uses cache to avoid redundant AI calls
async function detectGame(query, conversationHistory = []) {
  if (!query) return null;

  // Check cache
  const cacheKey = query.toLowerCase().trim();
  if (detectionCache.has(cacheKey)) {
    console.log(`[gameDetector] Cache hit: "${query}" → ${detectionCache.get(cacheKey)}`);
    return detectionCache.get(cacheKey);
  }

  // Step 1: Try fast keyword match first (no API call needed)
  const keywordResult = keywordDetect(query);

  // If keyword match is very confident → use it directly
  if (keywordResult) {
    console.log(`[gameDetector] Keyword hit: "${query}" → ${keywordResult}`);
    detectionCache.set(cacheKey, keywordResult);
    return keywordResult;
  }

  // Step 2: Keyword failed → use AI with conversation context
  console.log(`[gameDetector] Keyword miss — trying AI for: "${query}"`);
  const aiResult = await aiDetect(query, conversationHistory);

  if (aiResult) {
    console.log(`[gameDetector] AI detected: "${query}" → ${aiResult}`);
    detectionCache.set(cacheKey, aiResult);
    return aiResult;
  }

  // Step 3: Both failed — check if context gives us the game
  if (conversationHistory.length > 0) {
    const contextGame = extractGameFromHistory(conversationHistory);
    if (contextGame) {
      console.log(`[gameDetector] Context fallback: "${query}" → ${contextGame}`);
      return contextGame;
    }
  }

  console.warn(`[gameDetector] Could not detect game for: "${query}"`);
  return null;
}

// ─── Extract game from conversation history ───────────────────
// If user was talking about a game before, assume same game
function extractGameFromHistory(history) {
  const recentMessages = history.slice(-6).map(m => m.content).join(" ").toLowerCase();
  return keywordDetect(recentMessages);
}

// ─── Clear cache (call this periodically or on new session) ───
function clearCache() {
  detectionCache.clear();
}

module.exports = { detectGame, keywordDetect, aiDetect, clearCache, SUPPORTED_GAMES };