"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { track } from "@/lib/analytics";
import { apiPost } from "@/lib/api";
import { POWERED_BY, PRODUCT_NAME, TRUTHCORE_URL } from "@/config/branding";
import { useRoom, type Player } from "@/lib/room";

const MIN_PLAYERS = 3;

function roleName(player: Player | undefined): string {
  return player?.display_name ?? "?";
}

export default function ScreenPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { room, players, error } = useRoom(roomId);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  async function startGame() {
    setStarting(true);
    setStartError(null);
    try {
      await apiPost(`/rooms/${roomId}/start`);
      track("game_started", { room_id: roomId });
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "Could not start");
      setStarting(false);
    }
  }

  const pro = players.find((p) => p.role === "debater_pro");
  const con = players.find((p) => p.role === "debater_con");
  const judges = players.filter((p) => p.role === "judge");

  return (
    <main className="flex min-h-screen flex-col p-10">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-black">{PRODUCT_NAME}</h1>
        <a
          href={TRUTHCORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-emerald-400 hover:underline"
        >
          {POWERED_BY}
        </a>
      </header>

      {error && <p className="mt-10 text-center text-red-400">{error}</p>}

      {room?.status === "lobby" && (
        <section className="flex flex-1 flex-col items-center justify-center gap-10">
          <div className="text-center">
            <p className="text-lg text-zinc-400">Join on your phone with code</p>
            <p className="font-mono text-8xl font-black tracking-[0.3em] text-emerald-400">
              {room.code}
            </p>
          </div>
          <ul className="flex max-w-2xl flex-wrap justify-center gap-3">
            {players.map((p) => (
              <li
                key={p.id}
                className="rounded-full bg-zinc-800 px-5 py-2 text-lg font-semibold"
              >
                {p.display_name}
              </li>
            ))}
            {players.length === 0 && (
              <li className="text-zinc-500">Waiting for players…</li>
            )}
          </ul>
          <div className="text-center">
            <button
              onClick={() => void startGame()}
              disabled={starting || players.length < MIN_PLAYERS}
              className="rounded-xl bg-emerald-500 px-8 py-4 text-xl font-bold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40"
            >
              {starting ? "Starting…" : "Start game"}
            </button>
            {players.length < MIN_PLAYERS && (
              <p className="mt-2 text-sm text-zinc-500">
                Need at least {MIN_PLAYERS} players ({players.length} joined)
              </p>
            )}
            {startError && <p className="mt-2 text-red-400">{startError}</p>}
          </div>
        </section>
      )}

      {room?.status === "active" && (
        <section className="flex flex-1 flex-col items-center justify-center gap-10 text-center">
          <p className="max-w-3xl text-4xl font-black">“{room.topic_text}”</p>
          <div className="flex items-center gap-8 text-2xl">
            <div className="rounded-2xl bg-emerald-900/60 px-8 py-6">
              <p className="text-sm font-bold tracking-widest text-emerald-400">PRO</p>
              <p className="font-bold">{roleName(pro)}</p>
            </div>
            <span className="text-zinc-500">vs</span>
            <div className="rounded-2xl bg-rose-900/60 px-8 py-6">
              <p className="text-sm font-bold tracking-widest text-rose-400">CON</p>
              <p className="font-bold">{roleName(con)}</p>
            </div>
          </div>
          <p className="text-zinc-400">
            Judges: {judges.map((j) => j.display_name).join(", ") || "none"}
          </p>
        </section>
      )}
    </main>
  );
}
