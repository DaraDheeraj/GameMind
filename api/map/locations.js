const { listLocations } = require("../../backend/services/locationService");

module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { game } = req.query || {};
    if (!game) return res.status(400).json({ error: "game param required" });

    const locations = listLocations(game);
    if (!locations.length) {
      return res.status(404).json({ error: `No locations found for "${game}"` });
    }
    res.json({ game, count: locations.length, locations });
  } catch (err) {
    console.error("[/api/map/locations]", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
};
