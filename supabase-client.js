/*
 * OIKKO — Supabase browser client scaffold
 * Safe to publish: only the Supabase project URL and anon/publishable key belong here.
 * NEVER put service_role, database passwords, or private secrets in this file.
 *
 * Before enabling:
 * 1) Replace the placeholders below with the project's URL and anon/publishable key.
 * 2) Verify RLS on every table and storage bucket.
 * 3) Test with separate admin and member accounts.
 */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY";

const isConfigured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR_PROJECT_REF") &&
  SUPABASE_ANON_KEY.length > 20 &&
  !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE");

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
