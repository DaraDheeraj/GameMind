const { searchWiki } = require("../../backend/services/fandomService");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { game, query } = req.query || {};
    if (!game || !query) {
      return res.status(400).json({ error: "Both 'game' and 'query' params required" });
    }

    const result = await searchWiki(game, query);
    if (!result) {
      return res.status(404).json({ error: `No wiki data found for "${game}"` });
    }

    res.json(result);
  } catch (err) {
    console.error("[/api/wiki/search]", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
};
