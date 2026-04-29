// ============================================================
//  GamerMind AI — Map Routes
//  File: routes/map.js
// ============================================================

const express = require("express");
const router = express.Router();
const {
  listLocations,
  getSupportedGames,
  getMapData,
} = require("../services/locationService");

// GET /api/map/games — list all games with map support
router.get("/games", (req, res) => {
  res.json({ games: getSupportedGames() });
});

// GET /api/map/locations?game=elden ring — list all locations for a game
router.get("/locations", (req, res) => {
  const { game } = req.query;
  if (!game) return res.status(400).json({ error: "game param required" });

  const locations = listLocations(game);
  if (!locations.length) {
    return res.status(404).json({ error: `No locations found for "${game}"` });
  }
  res.json({ game, count: locations.length, locations });
});

// GET /api/map/find?game=elden ring&query=moonveil katana
router.get("/find", (req, res) => {
  const { game, query } = req.query;
  if (!game || !query) {
    return res.status(400).json({ error: "game and query params required" });
  }

  const result = getMapData(game, query);
  if (!result) {
    return res
      .status(404)
      .json({ error: `Location not found for "${query}" in "${game}"` });
  }
  res.json(result);
});

module.exports = router;

