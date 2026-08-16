const { getSupportedGames } = require("../../backend/services/locationService");

module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    res.json({ games: getSupportedGames() });
  } catch (err) {
    console.error("[/api/map/games]", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
};
