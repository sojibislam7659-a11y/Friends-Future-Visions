/*
 * OIKKO — Supabase browser client
 * Only the public anon/publishable key belongs here.
 * NEVER add service_role, secret keys, or database passwords.
 */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://ugtzmtmsfaajclftfeuz.supabase.co";
const SUPABASE_ANON_KEY = "PASTE_SUPABASE_PUBLISHABLE_OR_ANON_KEY_HERE";

const isConfigured =
  SUPABASE_URL.startsWith("https://") &&
  SUPABASE_ANON_KEY.length > 20 &&
  !SUPABASE_ANON_KEY.includes("PASTE_SUPABASE");

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

export const supabaseReady = Boolean(supabase);
