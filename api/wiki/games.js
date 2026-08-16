const { getSupportedGames } = require("../../backend/services/fandomService");

module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const games = getSupportedGames();
    res.json({ count: games.length, games });
  } catch (err) {
    console.error("[/api/wiki/games]", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
};
