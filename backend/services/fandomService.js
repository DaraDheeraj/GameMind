// ============================================================
//  GamerMind AI — Fandom Wiki Service (No API Key Needed!)
//  Uses the public Fandom MediaWiki API — completely FREE
//  File: services/fandomService.js
// ============================================================

const axios = require("axios");

const GAME_WIKI_MAP = {
  minecraft: "minecraft",
  fortnite: "fortnite",
  "elden ring": "eldenring",
  "dark souls": "darksouls",
  "dark souls 3": "darksouls",
  "gta v": "gta",
  "gta 5": "gta",
  "grand theft auto": "gta",
  valorant: "valorant",
  "league of legends": "leagueoflegends",
  lol: "leagueoflegends",
  cyberpunk: "cyberpunk",
  "cyberpunk 2077": "cyberpunk",
  zelda: "zelda",
  "breath of the wild": "zelda",
  "tears of the kingdom": "zelda",
  "call of duty": "callofduty",
  warzone: "callofduty",
  pokemon: "pokemon",
  overwatch: "overwatch",
  "overwatch 2": "overwatch",
  "apex legends": "apexlegends",
  "destiny 2": "destiny",
  "world of warcraft": "wowpedia",
  wow: "wowpedia",
  "final fantasy": "finalfantasy",
  "god of war": "godofwar",
  "red dead": "reddead",
  rdr2: "reddead",
  halo: "halo",
  "the witcher": "witcher",
  fallout: "fallout",
  skyrim: "elderscrolls",
  "elder scrolls": "elderscrolls",
  diablo: "diablo",
  terraria: "terraria",
  roblox: "roblox",
  "hollow knight": "hollowknight",
  "stardew valley": "stardewvalley",
  "dead by daylight": "deadbydaylight",
  "among us": "among-us",
  "genshin impact": "genshin-impact",
  genshin: "genshin-impact",
  "honkai star rail": "honkai-star-rail",
  "counter strike": "counterstrike",
  "cs2": "counterstrike",
  dota: "dota2",
  "dota 2": "dota2",
};

const WIKI_CACHE_TTL_MS = 30 * 60 * 1000;
const wikiCache = new Map();

function getCacheKey(gameName, query) {
  return `${gameName.toLowerCase().trim()}::${query.toLowerCase().trim()}`;
}

function getFromCache(key) {
  const entry = wikiCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    wikiCache.delete(key);
    return undefined;
  }
  return entry.data;
}

function setCache(key, data) {
  wikiCache.set(key, { data, expiresAt: Date.now() + WIKI_CACHE_TTL_MS });
}

function getWikiSubdomain(gameName) {
  const lower = gameName.toLowerCase().trim();
  if (GAME_WIKI_MAP[lower]) return GAME_WIKI_MAP[lower];
  for (const [key, val] of Object.entries(GAME_WIKI_MAP)) {
    if (lower.includes(key) || key.includes(lower)) return val;
  }
  return lower.replace(/\s+/g, "").replace(/[^a-z0-9-]/g, "");
}

function detectGameFromQuery(query) {
  const lower = query.toLowerCase();
  let bestMatch = null;
  let bestLen = 0;
  for (const key of Object.keys(GAME_WIKI_MAP)) {
    if (lower.includes(key) && key.length > bestLen) {
      bestMatch = key;
      bestLen = key.length;
    }
  }
  return bestMatch;
}

function extractText(sections = [], maxSections = 4, maxChars = 2500) {
  let text = "";
  for (const section of sections.slice(0, maxSections)) {
    const title = section.title ? `\n## ${section.title}\n` : "\n";
    const body = (section.content || [])
      .filter((c) => c.type === "paragraph")
      .map((c) => c.text)
      .join(" ");
    text += title + body;
    if (text.length >= maxChars) break;
  }
  return text.slice(0, maxChars);
}

async function searchWiki(gameName, query) {
  const cacheKey = getCacheKey(gameName, query);
  const cached = getFromCache(cacheKey);
  if (cached !== undefined) {
    console.log(`[Fandom] Cache hit: "${gameName}" / "${query}"`);
    return cached;
  }

  const subdomain = getWikiSubdomain(gameName);
  try {
    const searchURL =
      `https://${subdomain}.fandom.com/api/v1/Search/List` +
      `?query=${encodeURIComponent(query)}&limit=3&namespaces=0`;

    const searchRes = await axios.get(searchURL, {
      timeout: 6000,
      headers: { "User-Agent": "GamerMindAI/1.0" },
    });

    const items = searchRes.data?.items || [];
    if (!items.length) {
      setCache(cacheKey, null);
      return null;
    }

    const articleURL =
      `https://${subdomain}.fandom.com/api/v1/Articles/AsSimpleJson?id=${items[0].id}`;

    const articleRes = await axios.get(articleURL, {
      timeout: 6000,
      headers: { "User-Agent": "GamerMindAI/1.0" },
    });

    const content = extractText(articleRes.data?.sections || []);
    if (!content) {
      setCache(cacheKey, null);
      return null;
    }

    const result = {
      game: gameName,
      title: items[0].title,
      url: items[0].url,
      wikiBase: `https://${subdomain}.fandom.com`,
      content,
      relatedArticles: items.slice(1).map((i) => ({ title: i.title, url: i.url })),
    };
    setCache(cacheKey, result);
    return result;
  } catch (err) {
    // A transient failure should not be remembered as "no data exists" for the next 30 minutes.
    console.warn(`[Fandom] Failed for "${gameName}":`, err.message);
    return null;
  }
}

function getSupportedGames() {
  return [...new Set(Object.keys(GAME_WIKI_MAP))].sort();
}

module.exports = { searchWiki, detectGameFromQuery, getWikiSubdomain, getSupportedGames };
