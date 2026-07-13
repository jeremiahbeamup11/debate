"use client";

import posthog from "posthog-js";
import { POSTHOG_HOST, POSTHOG_KEY } from "@/config/env";

// Event names exactly as listed in PROJECT.md — no renaming, no extras.
type EventName =
  | "room_created"
  | "player_joined"
  | "game_started"
  | "turn_submitted"
  | "card_shown"
  | "card_clicked"
  | "game_completed"
  | "recap_viewed"
  | "recap_shared_click";

let initialized = false;

function ensureInit(): boolean {
  if (!POSTHOG_KEY) {
    console.warn("PostHog disabled: NEXT_PUBLIC_POSTHOG_KEY is not set");
    return false;
  }
  if (!initialized) {
    posthog.init(POSTHOG_KEY, { api_host: POSTHOG_HOST });
    initialized = true;
  }
  return true;
}

export function track(event: EventName, properties?: Record<string, string>): void {
  if (ensureInit()) {
    posthog.capture(event, properties);
  }
}
