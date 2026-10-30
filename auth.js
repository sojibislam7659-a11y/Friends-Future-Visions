/*
 * OIKKO — Authentication helpers
 * These helpers do not grant admin privileges. Database RLS remains authoritative.
 */
import { supabase, supabaseReady } from "./supabase-client.js";

function requireClient() {
  if (!supabaseReady || !supabase) {
    throw new Error("Supabase is not configured yet. Add the public project URL and anon/publishable key first.");
  }
  return supabase;
}

export async function signIn(email, password) {
  const client = requireClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const client = requireClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const client = requireClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function onAuthStateChange(callback) {
  const client = requireClient();
  const { data } = client.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  return () => data.subscription.unsubscribe();
}
