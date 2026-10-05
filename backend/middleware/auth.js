// ============================================================
//  GamerMind AI — Auth Middleware
//  File: middleware/auth.js
//
//  Verifies the Supabase access token sent by the frontend
//  (Authorization: Bearer <token>) and attaches req.user +
//  req.supabase (a client scoped to that user, for RLS-safe queries).
// ============================================================

const { supabaseAdmin, createUserScopedClient } = require("../services/supabaseClient");

// Use on routes that REQUIRE a signed-in user — rejects with 401 if
// there's no valid token.
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Sign in required" });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }

    req.user = data.user;
    req.supabase = createUserScopedClient(token);
    next();
  } catch (err) {
    console.error("[auth] Token verification failed:", err.message);
    res.status(401).json({ error: "Invalid or expired session" });
  }
}

// Use on routes where sign-in is OPTIONAL — attaches req.user/req.supabase
// if a valid token is present, but never blocks the request either way.
// Useful for endpoints that behave differently for logged-in vs anonymous
// users without requiring an account.
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) return next();

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (!error && data?.user) {
      req.user = data.user;
      req.supabase = createUserScopedClient(token);
    }
  } catch (err) {
    // Silently ignore — this is optional auth, an invalid token just
    // means the request proceeds as anonymous.
  }
  next();
}

module.exports = { requireAuth, optionalAuth };
