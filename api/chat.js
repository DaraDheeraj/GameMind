const { chat } = require('../backend/services/aiService');
const { searchWiki } = require('../backend/services/fandomService');
const { getMapData } = require('../backend/services/locationService');
const { detectGame } = require('../backend/services/gameDetector');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { message, history = [], verificationUrl = null } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const detectedGame = await detectGame(message, history);
    const wikiContext = detectedGame ? await searchWiki(detectedGame, message) : null;
    const mapData = detectedGame ? await getMapData(detectedGame, message, verificationUrl) : null;

    const result = await chat(message, history, wikiContext, detectedGame);

    res.json({
      reply: result.text || null,
      provider: result.provider || null,
      detectedGame,
      questionType: result.questionType || null,
      skillLevel: result.skillLevel || null,
      wikiUsed: wikiContext ? { title: wikiContext.title, url: wikiContext.url } : null,
      mapData,
      mapVerified: mapData?.source === 'ai-verified',
      mapSource: mapData?.source || null,
    });
  } catch (err) {
    console.error('[api/chat]', err?.message || err);
    res.status(500).json({ error: err?.message || 'Server error' });
  }
};
