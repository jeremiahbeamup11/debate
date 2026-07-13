"use client";

import { useSyncExternalStore } from "react";

function subscribe(onTick: () => void): () => void {
  const id = setInterval(onTick, 500);
  return () => clearInterval(id);
}

/** Seconds remaining until an ISO deadline (server-set); null when no deadline. */
export function useCountdown(deadline: string | null): number | null {
  return useSyncExternalStore(
    subscribe,
    () => {
      if (!deadline) return null;
      const target = new Date(deadline).getTime();
      return Math.max(0, Math.ceil((target - Date.now()) / 1000));
    },
    () => null,
  );
}
