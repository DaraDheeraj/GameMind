# 🎮 GamerMind AI — Full Project

A gaming assistant powered by **free APIs**: Google Gemini + Groq + Fandom Wiki.

---

## 📁 Project Structure

```
gamermind-ai/
│
├── 📂 frontend/              ← Open in browser (no build needed)
│   └── index.html            ← Full UI (chat, sidebar, quick actions)
│
├── 📂 backend/               ← Node.js Express server
│   ├── server.js             ← App entry point (port 5000)
│   ├── package.json          ← Dependencies
│   ├── .env.example          ← Copy to .env and add your keys
│   │
│   ├── 📂 routes/
│   │   ├── chat.js           ← POST /api/chat
│   │   └── wiki.js           ← GET  /api/wiki/search, /games
│   │
│   └── 📂 services/
│       ├── aiService.js      ← Gemini + Groq AI logic (FREE)
│       └── fandomService.js  ← Fandom Wiki scraping (FREE, no key)
│
└── README.md                 ← This file
```

---

## 🆓 Free APIs Used

| Service              | Free Limit                    | Get Key                                      |
|----------------------|-------------------------------|----------------------------------------------|
| Gemini Flash  2.0    | 15 req/min, 1M tokens/day     | https://aistudio.google.com/app/apikey       |
| Groq Llama3          | Generous daily limits         | https://console.groq.com                     |
| Fandom Wiki API      | Unlimited (public API)        | No key needed ✅                             |

---

## 🚀 Quick Start

### 1. Setup Backend
```bash
cd backend
npm install
cp .env.example .env
# Open .env and paste your GEMINI_API_KEY or GROQ_API_KEY
npm run dev
# → Server starts at http://localhost:5000
```

### 2. Open Frontend
Just open `frontend/index.html` in your browser — done! 🎉

> The frontend talks to `http://localhost:5000` by default.
> Change `API_BASE` at the top of `index.html` if deploying elsewhere.

---

## ⚙️ .env

```env
GEMINI_API_KEY=your_key_here   # recommended
GROQ_API_KEY=your_key_here     # fallback (optional)
PORT=5000
```

---

## 🔌 API Endpoints

| Method | URL                                       | Description                   |
|--------|-------------------------------------------|-------------------------------|
| POST   | `/api/chat`                               | Send a message, get AI reply  |
| GET    | `/api/wiki/search?game=minecraft&query=x` | Search Fandom wiki directly   |
| GET    | `/api/wiki/games`                         | List all supported games      |
| GET    | `/api/wiki/subdomain?game=elden ring`     | Resolve game → wiki subdomain |
| GET    | `/health`                                 | Server health check           |

### POST /api/chat — Request Body
```json
{
  "message": "What are the best weapons in Elden Ring?",
  "history": []
}
```

### POST /api/chat — Response
```json
{
  "reply": "## Best Weapons in Elden Ring...",
  "provider": "Google Gemini 1.5 Flash (Free)",
  "detectedGame": "elden ring",
  "wikiUsed": {
    "title": "Elden Ring Weapons",
    "url": "https://eldenring.fandom.com/wiki/Weapons"
  }
}
```
## 🏗️ How It Works

User asks a question
        ↓
Frontend (index.html → send())
POST /api/chat/stream (SSE)
        ↓
routes/chat.js (/stream)
        ↓
detectGameFromQuery()
→ Identifies game using:
   - keyword match
   - AI detection
   - history
        ↓
fandomService.searchWiki()
→ Fetches live data from Fandom Wiki (FREE)
        ↓
locationService.getMapData()
→ Gets coordinates/map OR generates & saves
        ↓
aiService.buildSystemPrompt()
→ Combines:
   - user query
   - wiki data
   - skill level
   - response structure
        ↓
aiService.chat()
        ↓
Gemini 2.0 Flash (Primary)
        ↓ (if fails: 503/429/500)
Groq LLaMA3-70B (Fallback)
        ↓
SSE Stream Response
        → meta (wiki/map)
        → delta (word-by-word)
        → status
        → done
        ↓
Frontend renders:
→ Streaming chat bubble
→ Leaflet map panel
→ Source metadata (wiki link, provider)
        ↓
User sees:
Answer + Map + Source Tags
---

## 🎮 Supported Games (40+)
Minecraft, Fortnite, Elden Ring, GTA V, Valorant, League of Legends,
Cyberpunk 2077, Zelda, Pokemon, Overwatch, Apex Legends, Destiny 2,
World of Warcraft, Final Fantasy, God of War, Red Dead, Halo, Witcher,
Fallout, Skyrim, Diablo, Terraria, Roblox, Genshin Impact, CS2, Dota 2...

---

## ✨ Key Features

- 🤖 **AI Chat** — Gemini primary, Groq fallback (auto-switching)
- ⚡ **Streaming** — word-by-word like ChatGPT via SSE
- 📖 **Live Wiki** — real-time Fandom Wiki data injection
- 🗺️ **Interactive Map** — Leaflet.js with auto-pin on locations
- 🎯 **Smart Detection** — AI detects game from context (not just keywords)
- 💾 **Auto-grow DB** — new locations verified + saved to coordinates.json
- 🧠 **Smart Prompts** — 7 question types, beginner/expert tone detection

---

## 📄 License

MIT — free to use, modify, and distribute.