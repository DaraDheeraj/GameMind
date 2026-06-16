const { detectGame } = require('../../backend/services/gameDetector');
const { searchWiki } = require('../../backend/services/fandomService');
const { getMapData } = require('../../backend/services/locationService');
const { buildSystemPrompt, detectQuestionType, detectSkillLevel } = require('../../backend/services/aiService');
const axios = require('axios');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { message, history = [], verificationUrl = null } = req.body || {};
  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message is required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders?.();

  const send = (data) => {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch (e) {}
  };

  const keepAlive = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 5000);
  res.on('close', () => clearInterval(keepAlive));

  try {
    const detectedGame = await detectGame(message, history);
    send({ type: 'meta', detectedGame });

    const [wikiContext, mapData] = await Promise.all([
      detectedGame ? searchWiki(detectedGame, message) : Promise.resolve(null),
      detectedGame ? getMapData(detectedGame, message, verificationUrl) : Promise.resolve(null),
    ]);

    if (wikiContext) send({ type: 'wiki', title: wikiContext.title, url: wikiContext.url });
    if (mapData) send({ type: 'map', mapData });

    const questionType = detectQuestionType(message);
    const skillLevel = detectSkillLevel(message, history);
    const systemPrompt = buildSystemPrompt(wikiContext, questionType, skillLevel, detectedGame);
    send({ type: 'meta', questionType, skillLevel });

    if (process.env.GEMINI_API_KEY) {
      try {
        send({ type: 'status', message: '🤖 Connecting to Gemini...' });
        const geminiRes = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || 'gemini-2.0-flash'}:generateContent`,
          { system_instruction: { parts: [{ text: systemPrompt }] }, contents: [{ role: 'user', parts: [{ text: message }] }], generationConfig: { maxOutputTokens: 1024 } },
          { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, timeout: 30000 }
        );
        const fullText = geminiRes.data?.candidates?.[0]?.content?.parts?.0?.text || geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        for (const token of fullText.split(/(\s+)/)) send({ type: 'delta', text: token });
        send({ type: 'provider', name: 'Google Gemini' });
      } catch (err) {
        console.warn('[stream] Gemini failed:', err?.message || err);
        send({ type: 'status', message: 'Gemini failed, trying fallback' });
      }
    }

    if (!process.env.GEMINI_API_KEY && process.env.GROQ_API_KEY) {
      try {
        send({ type: 'status', message: '🤖 Connecting to Groq...' });
        const groqRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', { model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: message }], max_tokens: 1024, temperature: 0.7 }, { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 30000 });
        const text = groqRes.data?.choices?.[0]?.message?.content || '';
        for (const token of text.split(/(\s+)/)) send({ type: 'delta', text: token });
        send({ type: 'provider', name: 'Groq Llama3' });
      } catch (err) {
        console.warn('[stream] Groq failed:', err?.message || err);
        send({ type: 'status', message: 'Groq failed' });
      }
    }

    send({ type: 'done' });
  } catch (err) {
    console.error('[api/chat/stream]', err?.message || err);
    send({ type: 'error', message: err?.message || 'Server error' });
    send({ type: 'done' });
  } finally {
    clearInterval(keepAlive);
    try { res.end(); } catch (e) {}
  }
};
