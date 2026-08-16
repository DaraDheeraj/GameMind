
// ── Config ────────────────────────────────────────────────────
// Use relative API path in deployments (Vercel will host both frontend and API)
const API_BASE = "";

let loading = false;
let history = [];
let leafletMap = null;
let currentMarker = null;
window.__mapDataStore = [];

function showMapByIndex(idx) {
  const data = window.__mapDataStore[idx];
  if (data) showMap(data);
}

const messagesEl = document.getElementById("messages");
const welcomeEl = document.getElementById("welcome");
const inp = document.getElementById("inp");
const sendBtn = document.getElementById("sendBtn");

function resize(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 120) + "px";
}

function onKey(e) {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
}

function ask(q) { inp.value = q; resize(inp); send(); }

function scroll() { messagesEl.scrollTop = messagesEl.scrollHeight; }

function esc(t) {
  return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// Simple markdown → HTML converter
function md(text) {
  return text
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h2>$1</h2>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/^[\-\*] (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>")
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");
}

function addMsg(role, content, meta = {}) {
  if (welcomeEl) welcomeEl.style.display = "none";
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  const avatar = role === "ai" ? "🤖" : "👾";

  let extra = "";
  if (role === "ai" && meta.wikiUsed) {
    extra += `<a class="wiki-tag" href="${esc(meta.wikiUsed.url)}" target="_blank">📖 ${esc(meta.wikiUsed.title)}</a>`;
  }

  const html = role === "ai" ? `<p>${md(content)}</p>${extra}` : esc(content);
  div.innerHTML = `<div class="msg-avatar">${avatar}</div><div class="msg-bubble">${html}</div>`;
  messagesEl.appendChild(div);
  scroll();
}

function addTyping() {
  if (welcomeEl) welcomeEl.style.display = "none";
  const div = document.createElement("div");
  div.className = "msg ai"; div.id = "typing";
  div.innerHTML = `<div class="msg-avatar">🤖</div><div class="msg-bubble"><div class="typing"><span></span><span></span><span></span></div></div>`;
  messagesEl.appendChild(div); scroll();
}

function removeTyping() {
  const t = document.getElementById("typing");
  if (t) t.remove();
}

function showMap(mapData) {
  if (!mapData || !window.L) return;

  const panel = document.getElementById("mapPanel");
  const emptyEl = document.getElementById("mapEmpty");
  const mapEl = document.getElementById("leaflet-map");
  const infoEl = document.getElementById("mapInfo");

  panel.classList.remove("hidden");

  document.getElementById("mapTitle").textContent = `🗺️ ${String(mapData.game || "Game").toUpperCase()}`;
  document.getElementById("mapGame").textContent = String(mapData.game || "").toUpperCase();
  document.getElementById("mapLocationName").textContent = mapData.location?.label || "Location";
  document.getElementById("mapRegion").textContent = mapData.location?.region ? `📍 ${mapData.location.region}` : "";

  infoEl.style.display = "block";
  emptyEl.style.display = "none";
  mapEl.style.display = "block";

  if (leafletMap) {
    leafletMap.remove();
    leafletMap = null;
    currentMarker = null;
  }

  const W = mapData.mapWidth || 2048;
  const H = mapData.mapHeight || 2048;
  const bounds = [[0, 0], [H, W]];

  leafletMap = L.map("leaflet-map", {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: 2,
    zoomControl: true,
  });

  if (mapData.mapImage) L.imageOverlay(mapData.mapImage, bounds).addTo(leafletMap);
  leafletMap.fitBounds(bounds);

  const x = mapData.location?.x ?? Math.round((mapData.location?.pinX ?? 0.5) * W);
  const y = mapData.location?.y ?? Math.round((mapData.location?.pinY ?? 0.5) * H);

  const pinY = H - y;
  const pinX = x;

  currentMarker = L.marker([pinY, pinX]).addTo(leafletMap);
  currentMarker.bindPopup(`<strong>${esc(mapData.location?.label || "Location")}</strong><br>${esc(mapData.location?.region || "")}`).openPopup();
  leafletMap.setView([pinY, pinX], 0);
}

function closeMap() {
  document.getElementById("mapPanel").classList.add("hidden");
  if (leafletMap) {
    leafletMap.remove();
    leafletMap = null;
  }
}

async function send() {
  const msg = inp.value.trim();
  if (!msg || loading) return;

  loading = true;
  sendBtn.disabled = true;
  inp.value = ""; inp.style.height = "auto";

  addMsg("user", msg);
  addTyping();

  // Streaming state
  let fullText   = "";
  let streamDiv  = null;
  let bubbleEl   = null;
  let metaInfo   = {};
  const bubbleId = `stream-bubble-${Date.now()}`; // Moved here

  try {
    const response = await fetch(`${API_BASE}/api/chat/stream`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ message: msg, history }),
    });

    if (!response.ok) throw new Error(`Server error: ${response.status}`);

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = "";

    // Remove typing indicator and create streaming bubble
    removeTyping();
    if (welcomeEl) welcomeEl.style.display = "none";

    streamDiv = document.createElement("div");
    streamDiv.className = "msg ai";
    streamDiv.innerHTML = `<div class="msg-avatar">🤖</div><div class="msg-bubble" id="${bubbleId}"><span class="cursor">▊</span></div>`;
    messagesEl.appendChild(streamDiv); // Append to DOM first
    bubbleEl = document.getElementById(bubbleId); // Now finds it correctly
    scroll();

    // Read SSE stream
    while (true) {
      let done, value;
      try {
        ({ done, value } = await reader.read());
      } catch (readErr) {
        console.warn("Stream read error:", readErr);
        break;
      }
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;

        try {
          const event = JSON.parse(line.slice(5).trim());

          // ── delta: new text token ──────────────────────
          if (event.type === "delta") {
            fullText += event.text;
            bubbleEl.innerHTML = `<p>${md(fullText)}</p><span class="cursor">▊</span>`;
            scroll();
          }

          // ── meta: game detected ────────────────────────
          if (event.type === "meta") {
            if (event.detectedGame) metaInfo.detectedGame = event.detectedGame;
            if (event.questionType) metaInfo.questionType = event.questionType;
            if (event.skillLevel)   metaInfo.skillLevel   = event.skillLevel;
          }

          // ── wiki: wiki source used ─────────────────────
          if (event.type === "wiki") {
            metaInfo.wikiUsed = { title: event.title, url: event.url };
          }

          // ── map: location found ────────────────────────
          if (event.type === "map") {
            metaInfo.mapData = event.mapData;
            // Auto-show map when location detected
            if (event.mapData) showMap(event.mapData);
          }

          // ── provider: which AI was used ────────────────
          if (event.type === "provider") {
            metaInfo.provider = event.name;
          }

          // ── status: status message ─────────────────────
          if (event.type === "status") {
            bubbleEl.innerHTML = `<span style="color:var(--muted);font-size:12px;font-family:'Share Tech Mono',monospace">${esc(event.message)}</span><span class="cursor">▊</span>`;
          }

          // ── done: stream complete ──────────────────────
          if (event.type === "done") {
            // Remove cursor, add metadata tags
            let extras = "";
            if (metaInfo.mapData) {
              const idx = window.__mapDataStore.push(metaInfo.mapData) - 1;
              extras += `<br><button class="map-btn" onclick="showMapByIndex(${idx})">🗺️ VIEW ON MAP — ${esc(metaInfo.mapData.location.label)}</button>`;
            }

            bubbleEl.innerHTML = `<p>${md(fullText)}</p>${extras}`;
            scroll();
          }

          // ── error ──────────────────────────────────────
          if (event.type === "error") {
            bubbleEl.innerHTML = `<p>⚠️ <strong>Error:</strong> ${esc(event.message)}</p>`;
          }

        } catch (parseErr) {
          console.warn("SSE parse error:", parseErr);
        }
      }
    }

    // Save to history
    history.push({ role: "user",      content: msg      });
    history.push({ role: "assistant", content: fullText  });
    if (history.length > 20) history = history.slice(-20);

} catch (err) {
  removeTyping();
  if (bubbleEl) {
    bubbleEl.innerHTML = `<p>⚠️ <strong>Error:</strong> ${esc(err.message)}</p>`;
  } else {
    addMsg("ai", `⚠️ Error: ${err.message}`);
  }
} finally {
  loading = false;
  sendBtn.disabled = false;
  inp.focus();
}
}

