"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { apiPost } from "@/lib/api";
import { POWERED_BY, PRODUCT_NAME, TRUTHCORE_URL } from "@/config/branding";
import { useCountdown } from "@/lib/countdown";
import { useRoom, type Player, type Turn } from "@/lib/room";
import { gameWinner, tallyRounds, type RoundResult } from "@/lib/scoring";

const MIN_PLAYERS = 3;
const TOTAL_ROUNDS = 3;

function TurnBubble({ turn, name }: { turn: Turn; name: string }) {
  const pro = turn.side === "pro";
  return (
    <div className={`max-w-xl rounded-2xl p-4 ${pro ? "self-start bg-emerald-900/50" : "self-end bg-rose-900/50"}`}>
      <p className={`text-xs font-bold tracking-widest ${pro ? "text-emerald-400" : "text-rose-400"}`}>
        {pro ? "PRO" : "CON"} — {name}
      </p>
      {/* User text rendered as plain text only (SECURITY.md §5) */}
      <p className="mt-1 whitespace-pre-wrap break-words">{turn.content}</p>
    </div>
  );
}

function RoundVotes({ result }: { result: RoundResult }) {
  return (
    <p className="self-center rounded-full bg-zinc-800 px-4 py-1 text-sm text-zinc-300">
      Round {result.round}: PRO {result.pro} — {result.con} CON{" "}
      {result.winner === "tie" ? "· tie" : `· ${result.winner.toUpperCase()} takes it`}
    </p>
  );
}

export default function ScreenPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { room, players, turns, votes, error } = useRoom(roomId);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const seconds = useCountdown(room?.phase_deadline ?? null);
  const advancing = useRef(false);
  const completedTracked = useRef(false);

  // Advance driver: when the server-set deadline has clearly passed, poke the
  // backend. The server re-checks its own clock, so this can never rush a phase.
  useEffect(() => {
    if (!room || (room.status !== "debating" && room.status !== "voting")) return;
    if (seconds !== 0 || advancing.current) return;
    const timer = setTimeout(() => {
      if (advancing.current) return;
      advancing.current = true;
      apiPost(`/rooms/${roomId}/advance`)
        .catch(() => undefined) // 409 = someone else advanced or not due yet
        .finally(() => {
          advancing.current = false;
        });
    }, 1500);
    return () => clearTimeout(timer);
  }, [room, seconds, roomId]);

  useEffect(() => {
    if (room?.status === "complete" && !completedTracked.current) {
      completedTracked.current = true;
      track("game_completed", { room_id: roomId });
    }
  }, [room?.status, roomId]);

  async function act(path: string, eventName?: "game_started") {
    setBusy(true);
    setActionError(null);
    try {
      await apiPost(path);
      if (eventName) track(eventName, { room_id: roomId });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const nameOf = (side: "pro" | "con") =>
    players.find((p) => p.role === (side === "pro" ? "debater_pro" : "debater_con"))
      ?.display_name ?? "?";
  const judges = players.filter((p: Player) => p.role === "judge");
  const results = tallyRounds(votes, room?.status === "complete" ? TOTAL_ROUNDS : (room?.current_round ?? 1) - 1);
  const canReroll =
    room?.status === "debating" && room.current_round === 1 && !room.reroll_used && turns.length === 0;

  return (
    <main className="flex min-h-screen flex-col p-10">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-black">{PRODUCT_NAME}</h1>
        <a href={TRUTHCORE_URL} target="_blank" rel="noopener noreferrer"
           className="text-sm font-medium text-emerald-400 hover:underline">
          {POWERED_BY}
        </a>
      </header>

      {error && <p className="mt-10 text-center text-red-400">{error}</p>}
      {actionError && <p className="mt-2 text-center text-red-400">{actionError}</p>}

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
              <li key={p.id} className="rounded-full bg-zinc-800 px-5 py-2 text-lg font-semibold">
                {p.display_name}
              </li>
            ))}
            {players.length === 0 && <li className="text-zinc-500">Waiting for players…</li>}
          </ul>
          <div className="text-center">
            <button
              onClick={() => void act(`/rooms/${roomId}/start`, "game_started")}
              disabled={busy || players.length < MIN_PLAYERS}
              className="rounded-xl bg-emerald-500 px-8 py-4 text-xl font-bold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40"
            >
              Start game
            </button>
            {players.length < MIN_PLAYERS && (
              <p className="mt-2 text-sm text-zinc-500">
                Need at least {MIN_PLAYERS} players ({players.length} joined)
              </p>
            )}
          </div>
        </section>
      )}

      {(room?.status === "debating" || room?.status === "voting") && (
        <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 pt-8">
          <div className="text-center">
            <p className="text-2xl font-black">“{room.topic_text}”</p>
            <p className="mt-1 text-sm text-zinc-400">
              <span className="text-emerald-400">{nameOf("pro")} (PRO)</span> vs{" "}
              <span className="text-rose-400">{nameOf("con")} (CON)</span>
            </p>
            {canReroll && (
              <button
                onClick={() => void act(`/rooms/${roomId}/reroll`)}
                disabled={busy}
                className="mt-2 rounded-full bg-zinc-800 px-4 py-1 text-sm text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
              >
                ↻ Re-roll topic (once)
              </button>
            )}
          </div>

          <div className="flex flex-1 flex-col gap-3">
            {Array.from({ length: room.current_round }, (_, i) => i + 1).map((round) => (
              <div key={round} className="flex flex-col gap-3">
                <p className="self-center text-xs font-bold tracking-widest text-zinc-500">
                  ROUND {round}
                </p>
                {turns
                  .filter((t) => t.round_number === round)
                  .map((t) => (
                    <TurnBubble key={t.id} turn={t} name={nameOf(t.side)} />
                  ))}
                {results[round - 1] && <RoundVotes result={results[round - 1]} />}
              </div>
            ))}
          </div>

          <div className="sticky bottom-6 self-center rounded-full bg-zinc-800 px-6 py-3 text-lg font-bold">
            {room.status === "debating" ? (
              <>
                Round {room.current_round} —{" "}
                <span className={room.current_turn === "pro" ? "text-emerald-400" : "text-rose-400"}>
                  {nameOf(room.current_turn ?? "pro")}
                </span>{" "}
                is typing… {seconds !== null && <span className="font-mono">{seconds}s</span>}
              </>
            ) : (
              <>
                Judges are voting ({judges.length}){" "}
                {seconds !== null && <span className="font-mono">{seconds}s</span>}
              </>
            )}
          </div>
        </section>
      )}

      {room?.status === "complete" && (
        <section className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
          <p className="text-xl text-zinc-400">“{room.topic_text}”</p>
          <p className="text-6xl font-black">
            {(() => {
              const w = gameWinner(results);
              return w === "tie" ? "It's a tie!" : `${nameOf(w)} wins!`;
            })()}
          </p>
          <div className="flex flex-col gap-2">
            {results.map((r) => (
              <RoundVotes key={r.round} result={r} />
            ))}
          </div>
          <div className="flex max-w-3xl flex-col gap-3">
            {turns.map((t) => (
              <TurnBubble key={t.id} turn={t} name={nameOf(t.side)} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
