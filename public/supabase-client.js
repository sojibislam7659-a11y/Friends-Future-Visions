/*
 * OIKKO — Supabase browser client
 * Development branch must use the isolated Development Supabase project.
 * Only the public anon/publishable key belongs here.
 * NEVER add service_role, secret keys, or database passwords.
 */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://tvdxbyzvkjiebwslmnvj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_uHCRkBNpkJNNoIB_Egjpkw_eX5QW2YI";

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
