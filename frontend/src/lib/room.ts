"use client";

import { useCallback, useEffect, useState } from "react";
import { ensureSignedIn, getSupabase } from "@/lib/supabase";

export interface Player {
  id: string;
  display_name: string;
  role: "debater_pro" | "debater_con" | "judge" | null;
}

// Merged room+current-game view the pages consume. `status` is 'lobby' when no
// game is active, otherwise the current game's status.
export interface Room {
  id: string;
  code: string;
  current_game_id: string | null;
  status: "lobby" | "topic" | "debating" | "voting" | "complete";
  topic_text: string | null;
  current_round: number;
  current_turn: "pro" | "con" | null;
  phase_deadline: string | null;
  reroll_used: boolean;
}

export interface Turn {
  id: string;
  round_number: number;
  side: "pro" | "con";
  content: string;
}

// Votes are only readable once their round is revealed (RLS-enforced).
export interface Vote {
  id: string;
  round_number: number;
  vote: "pro" | "con";
}

// TruthCore fact-check card. Pending until the Perplexity call returns.
export interface Check {
  id: string;
  round_number: number;
  judge_player_id: string;
  claim: string;
  status: "pending" | "done" | "failed";
  verdict: "True" | "False" | "Misleading" | "Unverifiable" | null;
  explanation: string | null;
  source_url: string | null;
}

interface RoomRow {
  id: string;
  code: string;
  current_game_id: string | null;
}
interface GameRow {
  id: string;
  status: "topic" | "debating" | "voting" | "complete";
  topic_text: string | null;
  current_round: number;
  current_turn: "pro" | "con" | null;
  phase_deadline: string | null;
  reroll_used: boolean;
}

/**
 * Live room state. Reads the room, resolves its current game (M5: a room hosts
 * many games), and merges the game's state into a single `room` view plus the
 * current game's turns/votes/checks and per-game roles. All reads go via the
 * anon key under RLS; all writes go through the backend. Realtime channels are
 * filtered by room_id (turns/votes/checks carry room_id purely for this).
 */
export function useRoom(roomId: string | null): {
  room: Room | null;
  players: Player[];
  turns: Turn[];
  votes: Vote[];
  checks: Check[];
  error: string | null;
} {
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!roomId) return;
    const supabase = getSupabase();
    const [roomRes, playersRes] = await Promise.all([
      supabase.from("rooms").select("id,code,current_game_id").eq("id", roomId).single(),
      supabase.from("players").select("id,display_name").eq("room_id", roomId).order("created_at"),
    ]);
    if (roomRes.error || playersRes.error) {
      setError("Could not load the room");
      return;
    }
    const roomRow = roomRes.data as RoomRow;
    const roomPlayers = playersRes.data as { id: string; display_name: string }[];

    if (!roomRow.current_game_id) {
      setRoom({
        id: roomRow.id,
        code: roomRow.code,
        current_game_id: null,
        status: "lobby",
        topic_text: null,
        current_round: 0,
        current_turn: null,
        phase_deadline: null,
        reroll_used: false,
      });
      setPlayers(roomPlayers.map((p) => ({ ...p, role: null })));
      setTurns([]);
      setVotes([]);
      setChecks([]);
      return;
    }

    const gameId = roomRow.current_game_id;
    const [gameRes, rolesRes, turnsRes, votesRes, checksRes] = await Promise.all([
      supabase
        .from("games")
        .select("id,status,topic_text,current_round,current_turn,phase_deadline,reroll_used")
        .eq("id", gameId)
        .single(),
      supabase.from("game_players").select("player_id,role").eq("game_id", gameId),
      supabase.from("turns").select("id,round_number,side,content").eq("game_id", gameId).order("created_at"),
      supabase.from("votes").select("id,round_number,vote").eq("game_id", gameId).order("created_at"),
      supabase
        .from("checks")
        .select("id,round_number,judge_player_id,claim,status,verdict,explanation,source_url")
        .eq("game_id", gameId)
        .order("created_at"),
    ]);
    if (gameRes.error || rolesRes.error || turnsRes.error || votesRes.error || checksRes.error) {
      setError("Could not load the game");
      return;
    }
    const game = gameRes.data as GameRow;
    const roleByPlayer = new Map(
      (rolesRes.data as { player_id: string; role: Player["role"] }[]).map((r) => [
        r.player_id,
        r.role,
      ]),
    );
    setRoom({
      id: roomRow.id,
      code: roomRow.code,
      current_game_id: gameId,
      status: game.status,
      topic_text: game.topic_text,
      current_round: game.current_round,
      current_turn: game.current_turn,
      phase_deadline: game.phase_deadline,
      reroll_used: game.reroll_used,
    });
    setPlayers(roomPlayers.map((p) => ({ ...p, role: roleByPlayer.get(p.id) ?? null })));
    setTurns(turnsRes.data as Turn[]);
    setVotes(votesRes.data as Vote[]);
    setChecks(checksRes.data as Check[]);
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    let channel: ReturnType<ReturnType<typeof getSupabase>["channel"]> | null = null;
    let cancelled = false;

    void (async () => {
      try {
        await ensureSignedIn();
      } catch {
        if (!cancelled) setError("Could not connect");
        return;
      }
      if (cancelled) return;
      await refresh();
      const supabase = getSupabase();
      channel = supabase.channel(`room:${roomId}`);
      for (const table of ["rooms", "players", "games", "turns", "votes", "checks"] as const) {
        const filter = table === "rooms" ? `id=eq.${roomId}` : `room_id=eq.${roomId}`;
        channel = channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter },
          () => void refresh(),
        );
      }
      channel.subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void getSupabase().removeChannel(channel);
    };
  }, [roomId, refresh]);

  return { room, players, turns, votes, checks, error };
}
