// ============================================================
//  GamerMind AI — User Data Routes
//  File: routes/user.js
//
//  All routes here require sign-in (requireAuth). Every query uses
//  req.supabase (the user-scoped client from middleware/auth.js),
//  so Postgres RLS policies enforce that users only ever see their
//  own rows — there is no manual "WHERE user_id = ..." to forget.
// ============================================================

const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");

router.use(requireAuth);

// ─── Saved locations ────────────────────────────────────────────

// GET /api/user/locations — list all saved locations for this user
router.get("/locations", async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from("saved_locations")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ locations: data });
  } catch (err) {
    console.error("[/api/user/locations GET]", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// POST /api/user/locations — save a new location
// Body: { game, label, region, mapData }
router.post("/locations", async (req, res) => {
  const { game, label, region, mapData } = req.body || {};
  if (!game || !label || !mapData) {
    return res.status(400).json({ error: "game, label, and mapData are required" });
  }

  try {
    const { data, error } = await req.supabase
      .from("saved_locations")
      .insert({
        user_id: req.user.id,
        game,
        label,
        region: region || null,
        map_data: mapData,
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ location: data });
  } catch (err) {
    console.error("[/api/user/locations POST]", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// DELETE /api/user/locations/:id
router.delete("/locations/:id", async (req, res) => {
  try {
    const { error } = await req.supabase
      .from("saved_locations")
      .delete()
      .eq("id", req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("[/api/user/locations DELETE]", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// ─── Chat history ────────────────────────────────────────────────

// GET /api/user/chat-history — last 100 messages for this user
router.get("/chat-history", async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from("chat_history")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) throw error;
    res.json({ messages: data });
  } catch (err) {
    console.error("[/api/user/chat-history GET]", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// POST /api/user/chat-history — append one message
// Body: { role: "user"|"assistant", content }
router.post("/chat-history", async (req, res) => {
  const { role, content } = req.body || {};
  if (!role || !content || !["user", "assistant"].includes(role)) {
    return res.status(400).json({ error: "role ('user' or 'assistant') and content are required" });
  }

  try {
    const { error } = await req.supabase
      .from("chat_history")
      .insert({ user_id: req.user.id, role, content });

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("[/api/user/chat-history POST]", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// DELETE /api/user/chat-history — clear all of this user's history
router.delete("/chat-history", async (req, res) => {
  try {
    const { error } = await req.supabase
      .from("chat_history")
      .delete()
      .eq("user_id", req.user.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("[/api/user/chat-history DELETE]", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// ─── Settings ─────────────────────────────────────────────────────

// GET /api/user/settings
router.get("/settings", async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (error) throw error;
    // No row yet (new user) — return sensible defaults instead of null
    res.json({ settings: data || { theme: "dark" } });
  } catch (err) {
    console.error("[/api/user/settings GET]", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// PUT /api/user/settings — upsert (create or update)
// Body: { theme: "dark"|"light" }
router.put("/settings", async (req, res) => {
  const { theme } = req.body || {};
  if (!theme || !["dark", "light"].includes(theme)) {
    return res.status(400).json({ error: "theme must be 'dark' or 'light'" });
  }

  try {
    const { data, error } = await req.supabase
      .from("user_settings")
      .upsert({ user_id: req.user.id, theme, updated_at: new Date().toISOString() })
      .select()
      .single();

    if (error) throw error;
    res.json({ settings: data });
  } catch (err) {
    console.error("[/api/user/settings PUT]", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

module.exports = router;
