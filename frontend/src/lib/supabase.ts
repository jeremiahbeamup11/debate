"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/config/env";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // sessionStorage: each tab gets its own anonymous identity, which is
        // what a party game wants (and makes multi-tab testing honest).
        storage: typeof window !== "undefined" ? window.sessionStorage : undefined,
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return client;
}

/** Anonymous sign-in (real Supabase JWTs — SECURITY.md §4). Idempotent per tab. */
export async function ensureSignedIn(): Promise<string> {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.access_token;
  const { data: signIn, error } = await supabase.auth.signInAnonymously();
  if (error || !signIn.session) {
    throw new Error("Could not sign in");
  }
  return signIn.session.access_token;
}
