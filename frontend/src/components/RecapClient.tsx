"use client";

import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";

/** Fires recap_viewed once on mount and renders a copy-link share button. */
export function RecapClient({ roomId }: { roomId: string }) {
  const [copied, setCopied] = useState(false);
  const viewed = useRef(false);

  useEffect(() => {
    if (!viewed.current) {
      viewed.current = true;
      track("recap_viewed", { room_id: roomId });
    }
  }, [roomId]);

  async function share() {
    track("recap_shared_click", { room_id: roomId });
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the URL is in the address bar regardless.
    }
  }

  return (
    <button
      onClick={() => void share()}
      className="rounded-xl bg-emerald-500 px-6 py-3 font-bold text-zinc-950 hover:bg-emerald-400"
    >
      {copied ? "Link copied ✓" : "Share this recap"}
    </button>
  );
}
