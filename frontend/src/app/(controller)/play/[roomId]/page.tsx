"use client";

import { useParams } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { track } from "@/lib/analytics";
import { apiPost } from "@/lib/api";
import { POWERED_BY, PRODUCT_NAME } from "@/config/branding";
import { useCountdown } from "@/lib/countdown";
import { useRoom } from "@/lib/room";
import { gameWinner, tallyRounds } from "@/lib/scoring";
import { FactCheckCard } from "@/components/FactCheckCard";

const TURN_CHAR_CAP = 500;
const CLAIM_CHAR_CAP = 200;
const CHECKS_PER_ROUND = 3;
const noopSubscribe = () => () => {};

export default function PlayPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { room, players, turns, votes, checks, error } = useRoom(roomId);
  const playerId = useSyncExternalStore(
    noopSubscribe,
    () => window.sessionStorage.getItem("player_id"),
    () => null,
  );
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [votedRound, setVotedRound] = useState(0);
  const [claimDraft, setClaimDraft] = useState("");
  const [checkOpen, setCheckOpen] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const seconds = useCountdown(room?.phase_deadline ?? null);

  const me = players.find((p) => p.id === playerId);
  const mySide =
    me?.role === "debater_pro" ? "pro" : me?.role === "debater_con" ? "con" : null;
  const myTurn = room?.status === "debating" && mySide !== null && room.current_turn === mySide;

  async function submitTurn() {
    setBusy(true);
    setActionError(null);
    try {
      await apiPost(`/rooms/${roomId}/turns`, { content: draft.trim() });
      track("turn_submitted", { room_id: roomId });
      setDraft("");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  }

  async function submitVote(vote: "pro" | "con") {
    if (!room) return;
    setBusy(true);
    setActionError(null);
    try {
      await apiPost(`/rooms/${roomId}/votes`, { vote });
      track("vote_cast", { room_id: roomId });
      setVotedRound(room.current_round);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not vote");
    } finally {
      setBusy(false);
    }
  }

  async function submitCheck() {
    setBusy(true);
    setCheckError(null);
    try {
      await apiPost(`/rooms/${roomId}/checks`, { claim: claimDraft.trim() });
      track("check_requested", { room_id: roomId });
      setClaimDraft("");
      setCheckOpen(false);
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : "Could not request check");
    } finally {
      setBusy(false);
    }
  }

  const nameOf = (side: "pro" | "con") =>
    players.find((p) => p.role === (side === "pro" ? "debater_pro" : "debater_con"))
      ?.display_name ?? "?";
  const judgeNameOf = (pid: string) =>
    players.find((p) => p.id === pid)?.display_name ?? "A judge";

  const currentRound = room?.current_round ?? 0;
  const roundChecks = checks.filter((c) => c.round_number === currentRound);
  const myRoundChecks = roundChecks.filter((c) => c.judge_player_id === playerId);
  const remaining = Math.max(0, CHECKS_PER_ROUND - roundChecks.length);
  const iAlreadyChecked = myRoundChecks.length > 0;
  const isJudge = me?.role === "judge";
  const roundLive = room?.status === "debating" || room?.status === "voting";

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

      {(room?.status === "debating" || room?.status === "voting") && (
        <p className="text-sm text-zinc-400">
          Round {room.current_round} of 3 — “{room.topic_text}”
        </p>
      )}

      {/* Debater: my turn — compose */}
      {myTurn && (
        <div className="flex w-full max-w-sm flex-col gap-3">
          <p className="text-lg font-bold">
            Your turn ({mySide === "pro" ? "PRO" : "CON"}){" "}
            {seconds !== null && <span className="font-mono text-emerald-400">{seconds}s</span>}
          </p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, TURN_CHAR_CAP))}
            rows={5}
            placeholder="Make your case…"
            className="rounded-xl bg-zinc-800 p-4 text-base placeholder:text-zinc-600"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">
              {draft.length}/{TURN_CHAR_CAP}
            </span>
            <button
              onClick={() => void submitTurn()}
              disabled={busy || draft.trim().length === 0}
              className="rounded-xl bg-emerald-500 px-6 py-3 font-bold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40"
            >
              Submit
            </button>
          </div>
        </div>
      )}

      {/* Debater: waiting */}
      {room?.status === "debating" && mySide && !myTurn && (
        <p className="text-lg text-zinc-300">
          {nameOf(room.current_turn ?? "pro")} is typing… your turn is coming.
        </p>
      )}
      {room?.status === "voting" && mySide && (
        <p className="text-lg text-zinc-300">Judges are deciding round {room.current_round}…</p>
      )}

      {/* Judge */}
      {room?.status === "debating" && me?.role === "judge" && (
        <p className="text-lg text-zinc-300">
          Watch the main screen — you vote when the round ends.
        </p>
      )}

      {/* Judge fact-check affordance — available all round (debating + voting) */}
      {isJudge && roundLive && (
        <div className="flex w-full max-w-sm flex-col gap-2 rounded-2xl border border-emerald-500/30 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-emerald-400">TruthCore fact-check</span>
            <span className="text-xs text-zinc-500">{remaining} left this round</span>
          </div>

          {iAlreadyChecked ? (
            myRoundChecks.map((c) => (
              <FactCheckCard
                key={c.id}
                check={c}
                judgeName={judgeNameOf(c.judge_player_id)}
                size="small"
              />
            ))
          ) : remaining === 0 ? (
            <p className="text-sm text-zinc-500">No fact-checks left this round.</p>
          ) : checkOpen ? (
            <>
              <textarea
                value={claimDraft}
                onChange={(e) => setClaimDraft(e.target.value.slice(0, CLAIM_CHAR_CAP))}
                rows={3}
                placeholder="Type the exact claim to check…"
                className="rounded-xl bg-zinc-800 p-3 text-sm placeholder:text-zinc-600"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">
                  {claimDraft.length}/{CLAIM_CHAR_CAP}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setCheckOpen(false);
                      setCheckError(null);
                    }}
                    className="rounded-lg px-3 py-2 text-sm text-zinc-400"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void submitCheck()}
                    disabled={busy || claimDraft.trim().length === 0}
                    className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40"
                  >
                    Check it
                  </button>
                </div>
              </div>
            </>
          ) : (
            <button
              onClick={() => setCheckOpen(true)}
              className="rounded-xl bg-zinc-800 px-4 py-3 text-sm font-bold hover:bg-zinc-700"
            >
              🔍 Fact-check a claim
            </button>
          )}
          {checkError && <p className="text-sm text-red-400">{checkError}</p>}
        </div>
      )}

      {room?.status === "voting" && me?.role === "judge" && (
        <div className="flex w-full max-w-sm flex-col gap-3">
          {votedRound === room.current_round ? (
            <p className="text-lg font-bold text-emerald-400">Vote locked in ✓</p>
          ) : (
            <>
              <p className="text-lg font-bold">
                Who won round {room.current_round}?{" "}
                {seconds !== null && <span className="font-mono">{seconds}s</span>}
              </p>
              <button
                onClick={() => void submitVote("pro")}
                disabled={busy}
                className="rounded-xl bg-emerald-600 px-6 py-4 text-lg font-bold hover:bg-emerald-500 disabled:opacity-40"
              >
                {nameOf("pro")} (PRO)
              </button>
              <button
                onClick={() => void submitVote("con")}
                disabled={busy}
                className="rounded-xl bg-rose-600 px-6 py-4 text-lg font-bold hover:bg-rose-500 disabled:opacity-40"
              >
                {nameOf("con")} (CON)
              </button>
            </>
          )}
        </div>
      )}

      {room?.status === "complete" && (
        <div className="flex flex-col gap-2">
          <p className="text-3xl font-black">
            {(() => {
              const w = gameWinner(tallyRounds(votes, 3));
              if (w === "tie") return "It's a tie!";
              return w === mySide ? "You win! 🏆" : `${nameOf(w)} wins!`;
            })()}
          </p>
          <p className="text-zinc-400">Full recap on the main screen.</p>
          <a
            href={`/recap/${roomId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 rounded-xl border border-emerald-500 px-6 py-3 font-bold text-emerald-400 hover:bg-emerald-500 hover:text-zinc-950"
          >
            View recap →
          </a>
        </div>
      )}

      {actionError && <p className="text-red-400">{actionError}</p>}
      {turns.length === 0 && null}
    </main>
  );
}
