"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { track } from "@/lib/analytics";
import { apiPost } from "@/lib/api";
import { POWERED_BY, PRODUCT_NAME, TRUTHCORE_URL } from "@/config/branding";

export default function HomePage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createRoom() {
    setCreating(true);
    setError(null);
    try {
      const room = await apiPost<{ room_id: string; code: string }>("/rooms");
      track("room_created", { room_id: room.room_id });
      router.push(`/screen/${room.room_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create a room");
      setCreating(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 p-8 text-center">
      {/* Landing-only neon flourish (item 4): white "Debate Night", purple TruthCore. */}
      <div className="flex flex-col items-center gap-4">
        <h1 className="neon-white neon-flicker text-6xl font-extrabold tracking-tight sm:text-8xl">
          {PRODUCT_NAME}
        </h1>
        <a
          href={TRUTHCORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="neon-purple text-2xl font-bold tracking-wide sm:text-3xl"
        >
          {POWERED_BY}
        </a>
      </div>
      <p className="max-w-md text-lg text-fg/50">
        Two friends debate. Everyone else judges. TruthCore drops fact-checks live.
      </p>
      <button
        onClick={() => void createRoom()}
        disabled={creating}
        className="rounded-[10px] bg-brand px-8 py-4 text-xl font-bold text-brand-ink transition hover:brightness-110 disabled:opacity-50"
      >
        {creating ? "Creating…" : "Create a room"}
      </button>
      {error && <p className="text-vfalse">{error}</p>}
      <p className="text-sm text-fg/40">
        Put this screen on the TV. Players join at{" "}
        <span className="font-semibold text-fg/70">/join</span> on their phones.
      </p>
    </main>
  );
}
