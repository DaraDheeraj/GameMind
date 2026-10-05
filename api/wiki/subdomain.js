const { getWikiSubdomain } = require("../../backend/services/fandomService");

module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { game } = req.query || {};
    if (!game) return res.status(400).json({ error: "game param required" });

    const subdomain = getWikiSubdomain(game);
    res.json({ game, subdomain, wikiUrl: `https://${subdomain}.fandom.com` });
  } catch (err) {
    console.error("[/api/wiki/subdomain]", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
};
