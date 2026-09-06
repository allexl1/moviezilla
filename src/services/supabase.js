import { createClient } from '@supabase/supabase-js';

let client = null;
let warned = false;

// Shared Supabase client. Returns null when unconfigured (rooms UI then
// explains what's missing instead of crashing). Secrets never live here —
// the anon key is public by design and gated by RLS policies.
export function getSupabase() {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    if (!warned) {
      warned = true;
      console.warn('[rooms] Supabase not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
    }
    return null;
  }
  client = createClient(url, key);
  return client;
}

export function isRoomsConfigured() {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}
