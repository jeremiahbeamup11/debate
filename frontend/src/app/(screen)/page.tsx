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
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8 text-center">
      <div>
        <h1 className="text-5xl font-black tracking-tight">{PRODUCT_NAME}</h1>
        <a
          href={TRUTHCORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block text-sm font-medium text-emerald-400 hover:underline"
        >
          {POWERED_BY}
        </a>
      </div>
      <p className="max-w-md text-lg text-zinc-400">
        Two friends debate. Everyone else judges. TruthCore drops fact-checks live.
      </p>
      <button
        onClick={() => void createRoom()}
        disabled={creating}
        className="rounded-xl bg-emerald-500 px-8 py-4 text-xl font-bold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
      >
        {creating ? "Creating…" : "Create a room"}
      </button>
      {error && <p className="text-red-400">{error}</p>}
      <p className="text-sm text-zinc-500">
        Put this screen on the TV. Players join at <span className="font-mono">/join</span> on
        their phones.
      </p>
    </main>
  );
}
