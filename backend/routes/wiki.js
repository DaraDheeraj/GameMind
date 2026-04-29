// ============================================================
//  GamerMind AI — Wiki Routes
//  File: routes/wiki.js
// ============================================================

const express = require("express");
const router = express.Router();
const { searchWiki, getWikiSubdomain, getSupportedGames } = require("../services/fandomService");

// GET /api/wiki/search?game=minecraft&query=creeper
router.get("/search", async (req, res) => {
  const { game, query } = req.query;
  if (!game || !query)
    return res.status(400).json({ error: "Both 'game' and 'query' params required" });

  const result = await searchWiki(game, query);
  if (!result)
    return res.status(404).json({ error: `No wiki data found for "${game}"` });

  res.json(result);
});

// GET /api/wiki/games
router.get("/games", (req, res) => {
  const games = getSupportedGames();
  res.json({ count: games.length, games });
});

// GET /api/wiki/subdomain?game=elden ring
router.get("/subdomain", (req, res) => {
  const { game } = req.query;
  if (!game) return res.status(400).json({ error: "game param required" });
  const subdomain = getWikiSubdomain(game);
  res.json({ game, subdomain, wikiUrl: `https://${subdomain}.fandom.com` });
});

module.exports = router;
