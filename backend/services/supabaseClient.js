// ============================================================
//  GamerMind AI — Supabase Client (Backend)
//  File: services/supabaseClient.js
//
//  Single shared Supabase client, using the SECRET key (server-side
//  only — never expose this to the frontend). This client can pass
//  through a user's own access token per-request so that Postgres
//  Row Level Security policies still apply correctly, rather than
//  using the secret key's full-bypass privileges for every query.
// ============================================================

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SECRET_KEY) {
  console.warn(
    "[supabaseClient] ⚠️  SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SECRET_KEY not set — " +
    "user accounts features (saved locations, chat history, settings) will not work."
  );
}

// Admin client — uses the SECRET key, bypasses RLS entirely. Only used
// for verifying a user's access token (auth.getUser), never for reading
// or writing user data directly.
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Creates a client scoped to a specific user's access token for actual
// data queries. IMPORTANT: this must use the ANON/PUBLISHABLE key as the
// base API key, not the secret key — Postgres RLS checks auth.uid() based
// on the Authorization Bearer token, but Supabase only enforces RLS at
// all when the request's API key tier is "anon" (or "authenticated").
// Using the secret key here would make every query run as service_role,
// silently bypassing every RLS policy regardless of whose token is attached.
function createUserScopedClient(accessToken) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

module.exports = { supabaseAdmin, createUserScopedClient };
