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
  const { room, players, votes, checks, error } = useRoom(roomId);
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
  const mySide = me?.role === "debater_pro" ? "pro" : me?.role === "debater_con" ? "con" : null;
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
        <h1 className="text-2xl font-extrabold tracking-tight">{PRODUCT_NAME}</h1>
        <p className="text-xs font-semibold text-brand">{POWERED_BY}</p>
      </div>

      {error && <p className="text-vfalse">{error}</p>}

      {room?.status === "lobby" && (
        <>
          <p className="text-xl">
            You&apos;re in{me ? `, ${me.display_name}` : ""}! Waiting for the host to start…
          </p>
          <p className="text-fg/50">
            {players.length} player{players.length === 1 ? "" : "s"} in the lobby:{" "}
            {players.map((p) => p.display_name).join(", ")}
          </p>
        </>
      )}

      {room?.status === "topic" && (
        <div className="flex max-w-sm flex-col gap-3">
          <p className="text-sm font-bold tracking-widest text-fg/40">THE TOPIC IS</p>
          <p className="text-2xl font-extrabold leading-snug">“{room.topic_text}”</p>
          {mySide ? (
            <p className="text-lg">
              You&apos;re{" "}
              <span className={`font-bold ${mySide === "pro" ? "text-pro" : "text-con"}`}>
                {mySide === "pro" ? "PRO" : "CON"}
              </span>{" "}
              — argue {mySide === "pro" ? "for" : "against"}{" "}it. You don&apos;t get a choice.
            </p>
          ) : (
            <p className="text-lg text-fg/70">You&apos;re a judge — listen close, vote honest.</p>
          )}
          <p className="text-fg/40">
            Debate starts in <span className="tabular-nums font-bold text-fg/70">{seconds ?? "–"}s</span>
          </p>
        </div>
      )}

      {(room?.status === "debating" || room?.status === "voting") && (
        <p className="text-sm text-fg/50">
          Round {room.current_round} of 3 — “{room.topic_text}”
        </p>
      )}

      {/* Debater: my turn — compose */}
      {myTurn && (
        <div className="flex w-full max-w-sm flex-col gap-3">
          <p className="text-lg font-bold">
            Your turn (
            <span className={mySide === "pro" ? "text-pro" : "text-con"}>
              {mySide === "pro" ? "PRO" : "CON"}
            </span>
            ) {seconds !== null && <span className="tabular-nums text-brand">{seconds}s</span>}
          </p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, TURN_CHAR_CAP))}
            rows={5}
            placeholder="Make your case…"
            className="rounded-[10px] border border-line bg-surface p-4 text-base outline-none placeholder:text-fg/30 focus:border-brand"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-fg/40">
              {draft.length}/{TURN_CHAR_CAP}
            </span>
            <button
              onClick={() => void submitTurn()}
              disabled={busy || draft.trim().length === 0}
              className="rounded-[10px] bg-brand px-6 py-3 font-bold text-brand-ink transition hover:brightness-110 disabled:opacity-40"
            >
              Submit
            </button>
          </div>
        </div>
      )}

      {/* Debater: waiting */}
      {room?.status === "debating" && mySide && !myTurn && (
        <p className="text-lg text-fg/70">
          {nameOf(room.current_turn ?? "pro")} is typing… your turn is coming.
        </p>
      )}
      {room?.status === "voting" && mySide && (
        <p className="text-lg text-fg/70">Judges are deciding round {room.current_round}…</p>
      )}

      {/* Judge */}
      {room?.status === "debating" && me?.role === "judge" && (
        <p className="text-lg text-fg/70">Watch the main screen — you vote when the round ends.</p>
      )}

      {/* Judge fact-check affordance — available all round (debating + voting) */}
      {isJudge && roundLive && (
        <div className="flex w-full max-w-sm flex-col gap-2 rounded-2xl border border-brand/30 bg-surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-brand">TruthCore fact-check</span>
            <span className="text-xs text-fg/40">{remaining} left this round</span>
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
            <p className="text-sm text-fg/40">No fact-checks left this round.</p>
          ) : checkOpen ? (
            <>
              <textarea
                value={claimDraft}
                onChange={(e) => setClaimDraft(e.target.value.slice(0, CLAIM_CHAR_CAP))}
                rows={3}
                placeholder="Type the exact claim to check…"
                className="rounded-[10px] border border-line bg-elevated p-3 text-sm outline-none placeholder:text-fg/30 focus:border-brand"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-fg/40">
                  {claimDraft.length}/{CLAIM_CHAR_CAP}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setCheckOpen(false);
                      setCheckError(null);
                    }}
                    className="rounded-lg px-3 py-2 text-sm text-fg/50 hover:text-fg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void submitCheck()}
                    disabled={busy || claimDraft.trim().length === 0}
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-ink transition hover:brightness-110 disabled:opacity-40"
                  >
                    Check it
                  </button>
                </div>
              </div>
            </>
          ) : (
            <button
              onClick={() => setCheckOpen(true)}
              className="rounded-[10px] border border-line bg-elevated px-4 py-3 text-sm font-bold hover:border-brand"
            >
              🔍 Fact-check a claim
            </button>
          )}
          {checkError && <p className="text-sm text-vfalse">{checkError}</p>}
        </div>
      )}

      {room?.status === "voting" && me?.role === "judge" && (
        <div className="flex w-full max-w-sm flex-col gap-3">
          {votedRound === room.current_round ? (
            <p className="text-lg font-bold text-vtrue">Vote locked in ✓</p>
          ) : (
            <>
              <p className="text-lg font-bold">
                Who won round {room.current_round}?{" "}
                {seconds !== null && <span className="tabular-nums">{seconds}s</span>}
              </p>
              <button
                onClick={() => void submitVote("pro")}
                disabled={busy}
                className="rounded-[10px] bg-pro px-6 py-4 text-lg font-bold text-brand-ink transition hover:brightness-110 disabled:opacity-40"
              >
                {nameOf("pro")} (PRO)
              </button>
              <button
                onClick={() => void submitVote("con")}
                disabled={busy}
                className="rounded-[10px] bg-con px-6 py-4 text-lg font-bold text-brand-ink transition hover:brightness-110 disabled:opacity-40"
              >
                {nameOf("con")} (CON)
              </button>
            </>
          )}
        </div>
      )}

      {room?.status === "complete" && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-3xl font-extrabold">
            {(() => {
              const w = gameWinner(tallyRounds(votes, 3));
              if (w === "tie") return "It's a tie!";
              return w === mySide ? "You win! 🏆" : `${nameOf(w)} wins!`;
            })()}
          </p>
          <p className="text-fg/50">Full recap on the main screen.</p>
          {room.current_game_id && (
            <a
              href={`/recap/${room.current_game_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 rounded-[10px] border border-brand px-6 py-3 font-bold text-brand hover:bg-brand hover:text-brand-ink"
            >
              View recap →
            </a>
          )}
        </div>
      )}

      {actionError && <p className="text-vfalse">{actionError}</p>}
    </main>
  );
}
