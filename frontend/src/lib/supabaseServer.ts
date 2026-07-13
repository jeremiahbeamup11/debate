import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/config/env";

/**
 * Server-side Supabase client with the anon key and no user session. Queries
 * run under the `anon` RLS role, so it can only read what the public-recap
 * policies expose (completed rooms and their children). Never use the service
 * key here — this module is imported by a public page.
 */
export function getServerSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
