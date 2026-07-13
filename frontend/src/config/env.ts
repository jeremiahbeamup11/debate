// Required public config — throws at first import if missing (SECURITY.md §1).
// Only the anon key ever reaches the client; service keys are backend-only.

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`FATAL: missing required environment variable ${name}`);
  }
  return value;
}

export const SUPABASE_URL = required(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);
export const SUPABASE_ANON_KEY = required(
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
export const BACKEND_URL = required(
  "NEXT_PUBLIC_BACKEND_URL",
  process.env.NEXT_PUBLIC_BACKEND_URL,
);

// Analytics key is public (not a secret); absence disables analytics loudly
// in analytics.ts rather than blocking boot.
export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
export const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
