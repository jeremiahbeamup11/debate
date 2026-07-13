"use client";

import { useParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import { POWERED_BY, PRODUCT_NAME } from "@/config/branding";
import { useRoom } from "@/lib/room";

const noopSubscribe = () => () => {};

export default function PlayPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { room, players, error } = useRoom(roomId);
  const playerId = useSyncExternalStore(
    noopSubscribe,
    () => window.sessionStorage.getItem("player_id"),
    () => null,
  );

  const me = players.find((p) => p.id === playerId);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <div>
        <h1 className="text-2xl font-black">{PRODUCT_NAME}</h1>
        <p className="text-xs text-emerald-400">{POWERED_BY}</p>
      </div>

      {error && <p className="text-red-400">{error}</p>}

      {room?.status === "lobby" && (
        <>
          <p className="text-xl">
            You&apos;re in{me ? `, ${me.display_name}` : ""}! Waiting for the host to start…
          </p>
          <p className="text-zinc-400">
            {players.length} player{players.length === 1 ? "" : "s"} in the lobby:{" "}
            {players.map((p) => p.display_name).join(", ")}
          </p>
        </>
      )}

      {room?.status === "active" && me?.role === "debater_pro" && (
        <div className="rounded-2xl bg-emerald-900/60 p-8">
          <p className="text-sm font-bold tracking-widest text-emerald-400">
            YOU&apos;RE DEBATING — PRO
          </p>
          <p className="mt-3 text-2xl font-bold">“{room.topic_text}”</p>
          <p className="mt-3 text-zinc-300">Argue FOR it. You don&apos;t get a choice.</p>
        </div>
      )}

      {room?.status === "active" && me?.role === "debater_con" && (
        <div className="rounded-2xl bg-rose-900/60 p-8">
          <p className="text-sm font-bold tracking-widest text-rose-400">
            YOU&apos;RE DEBATING — CON
          </p>
          <p className="mt-3 text-2xl font-bold">“{room.topic_text}”</p>
          <p className="mt-3 text-zinc-300">Argue AGAINST it. You don&apos;t get a choice.</p>
        </div>
      )}

      {room?.status === "active" && me?.role === "judge" && (
        <div className="rounded-2xl bg-zinc-800 p-8">
          <p className="text-sm font-bold tracking-widest text-zinc-400">YOU&apos;RE A JUDGE</p>
          <p className="mt-3 text-2xl font-bold">“{room.topic_text}”</p>
          <p className="mt-3 text-zinc-300">Watch the main screen. You vote after each round.</p>
        </div>
      )}

      {room?.status === "active" && !me && (
        <p className="text-zinc-400">Game in progress on the main screen.</p>
      )}
    </main>
  );
}
