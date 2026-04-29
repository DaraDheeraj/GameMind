// ============================================================
//  GamerMind AI — Location Service (with URL Verification)
//  File: services/locationService.js
//
//  Flow:
//  1. findLocation()         → check coordinates.json first
//  2. askAIForCoordinates()  → AI generates x,y if not found
//  3. verifyWithURL()        → scrape user-provided URL to confirm
//  4. saveToJSON()           → only save if verified ✅
// ============================================================

const fs   = require("fs");
const path = require("path");
const axios = require("axios");

const FILE_PATH = path.join(__dirname, "../data/coordinates.json");

// Always read fresh from disk
function readDB() {
  return JSON.parse(fs.readFileSync(FILE_PATH, "utf-8"));
}

// ─── STEP 1: findLocation ─────────────────────────────────────
function normalize(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9\s]/g, "");
}

function findGame(detectedGame) {
  if (!detectedGame) return null;
  const db   = readDB();
  const lower = normalize(detectedGame);
  if (db[lower]) return lower;
  for (const key of Object.keys(db)) {
    if (lower.includes(normalize(key)) || normalize(key).includes(lower)) return key;
  }
  return null;
}

function findLocation(gameKey, query) {
  const db   = readDB();
  const game = db[gameKey];
  if (!game) return null;

  const q = normalize(query);
  let bestMatch = null;
  let bestScore = 0;

  for (const [key, data] of Object.entries(game.locations || {})) {
    const k     = normalize(key);
    const label = normalize(data.label || "");
    let score   = 0;

    if (q.includes(k) || k.includes(q))         score += 10;
    if (q.includes(label) || label.includes(q))  score += 8;
    if (q.includes(data.type || ""))             score += 2;

    for (const w of k.split(" ")) {
      if (w.length > 3 && q.includes(w)) score += 3;
    }

    if (score > bestScore) { bestScore = score; bestMatch = { key, ...data }; }
  }

  return bestScore >= 3 ? bestMatch : null;
}

// ─── STEP 2: askAIForCoordinates ─────────────────────────────
async function askAIForCoordinates(game, query) {
  try {
    const db       = readDB();
    const gameKey  = findGame(game);
    const gameData = db[gameKey] || {};
    const W        = gameData.mapWidth  || 2048;
    const H        = gameData.mapHeight || 2048;

    const prompt = `
You are a game map expert.
Game: "${game}"
Item/Location: "${query}"
Map size: ${W} x ${H} pixels.

Return ONLY a valid JSON object — no explanation, no markdown, no code block:
{
  "x": <number between 0 and ${W}>,
  "y": <number between 0 and ${H}>,
  "label": "<official item or location name>",
  "region": "<in-game region or area name>",
  "type": "<one of: weapon, boss, secret, location, item, region, structure>"
}

If you are not confident, return exactly: null
`;

    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 256, temperature: 0.2 },
      },
      { headers: { "Content-Type": "application/json" }, timeout: 15000 }
    );

    const raw     = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleaned = raw.replace(/```json|```/g, "").trim();

    if (cleaned === "null" || !cleaned) return null;
    return JSON.parse(cleaned);

  } catch (err) {
    console.warn("[locationService] AI generation failed:", err.message);
    return null;
  }
}

// ─── STEP 3: verifyWithURL ────────────────────────────────────
// Fetches the user-provided URL and checks if the item/location
// name actually appears in the page text content.
async function verifyWithURL(url, itemName) {
  if (!url || !itemName) return false;

  try {
    console.log(`[locationService] 🔍 Verifying "${itemName}" at: ${url}`);

    const res = await axios.get(url, {
      timeout: 8000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GamerMindAI/1.0)",
        "Accept":     "text/html,application/xhtml+xml",
      },
      maxRedirects: 3,
    });

    // Strip all HTML tags → plain text
    const plainText = (res.data || "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .toLowerCase();

    // Check how many words from the item name appear on the page
    const words      = normalize(itemName).split(" ").filter(w => w.length > 2);
    const matchCount = words.filter(w => plainText.includes(w)).length;
    const ratio      = words.length > 0 ? matchCount / words.length : 0;

    console.log(`[locationService] Matched ${matchCount}/${words.length} words (${Math.round(ratio * 100)}%)`);

    // ✅ Pass if 60%+ of words found on the page
    return ratio >= 0.6;

  } catch (err) {
    console.warn("[locationService] ❌ Verification fetch failed:", err.message);
    return false; // fail safe — don't save if we can't verify
  }
}

// ─── STEP 4: saveToJSON ───────────────────────────────────────
function saveToJSON(gameKey, locationKey, data) {
  const db = readDB();

  if (!db[gameKey])           db[gameKey] = { mapImage: "", mapWidth: 2048, mapHeight: 2048, locations: {} };
  if (!db[gameKey].locations) db[gameKey].locations = {};

  db[gameKey].locations[normalize(locationKey)] = {
    x:        data.x,
    y:        data.y,
    type:     data.type   || "location",
    label:    data.label  || locationKey,
    region:   data.region || "Unknown",
    verified: true,
    addedAt:  new Date().toISOString(),
  };

  fs.writeFileSync(FILE_PATH, JSON.stringify(db, null, 2), "utf-8");
  console.log(`[locationService] ✅ Saved "${locationKey}" to coordinates.json`);
}

// ─── MAIN: getMapData ─────────────────────────────────────────
// verificationUrl → URL provided by user to verify the location
async function getMapData(detectedGame, query, verificationUrl = null) {
  const gameKey = findGame(detectedGame);
  if (!gameKey) return null;

  // Step 1 — check JSON cache first (instant)
  const existing = findLocation(gameKey, query);
  if (existing) {
    console.log(`[locationService] ✅ JSON hit: "${query}"`);
    const db = readDB();
    return {
      game:      gameKey,
      mapImage:  db[gameKey]?.mapImage  || "",
      mapWidth:  db[gameKey]?.mapWidth  || 2048,
      mapHeight: db[gameKey]?.mapHeight || 2048,
      location:  existing,
      source:    "json",
    };
  }

  // Step 2 — not in JSON → ask AI
  console.log(`[locationService] ❌ Not in JSON — asking AI for "${query}"...`);
  const aiCoords = await askAIForCoordinates(detectedGame, query);
  if (!aiCoords) {
    console.warn(`[locationService] AI returned null for "${query}"`);
    return null;
  }

  const db = readDB();
  const baseResult = {
    game:      gameKey,
    mapImage:  db[gameKey]?.mapImage  || "",
    mapWidth:  db[gameKey]?.mapWidth  || 2048,
    mapHeight: db[gameKey]?.mapHeight || 2048,
  };

  // Step 3 — verify with user-provided URL
  if (!verificationUrl) {
    // No URL provided → return AI result but do NOT save
    console.warn(`[locationService] ⚠️  No verification URL — skipping save`);
    return {
      ...baseResult,
      location: { ...aiCoords, key: query, verified: false },
      source:   "ai-unverified",
    };
  }

  const verified = await verifyWithURL(verificationUrl, aiCoords.label || query);

  if (!verified) {
    // Verification failed → return result but do NOT save
    console.warn(`[locationService] ❌ Verification FAILED — not saving "${query}"`);
    return {
      ...baseResult,
      location: { ...aiCoords, key: query, verified: false },
      source:   "ai-unverified",
    };
  }

  // Step 4 — verified ✅ → save to JSON permanently
  saveToJSON(gameKey, query, aiCoords);

  return {
    ...baseResult,
    location: { ...aiCoords, key: query, verified: true },
    source:   "ai-verified",
  };
}

// ─── UTILS ────────────────────────────────────────────────────
function listLocations(detectedGame) {
  const gameKey = findGame(detectedGame);
  if (!gameKey) return [];
  const db = readDB();
  return Object.entries(db[gameKey]?.locations || {}).map(([key, data]) => ({ key, ...data }));
}

function getSupportedGames() {
  return Object.keys(readDB());
}

module.exports = { getMapData, listLocations, getSupportedGames, findGame };
