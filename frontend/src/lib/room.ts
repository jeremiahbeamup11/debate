"use client";

import { useCallback, useEffect, useState } from "react";
import { ensureSignedIn, getSupabase } from "@/lib/supabase";

export interface Player {
  id: string;
  display_name: string;
  role: "debater_pro" | "debater_con" | "judge" | null;
}

export interface Room {
  id: string;
  code: string;
  status: "lobby" | "debating" | "voting" | "complete";
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

/**
 * Live room state: reads via anon key under RLS (members only), refreshed by
 * a private-per-room realtime subscription. All writes go through the backend.
 */
export function useRoom(roomId: string | null): {
  room: Room | null;
  players: Player[];
  turns: Turn[];
  votes: Vote[];
  error: string | null;
} {
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!roomId) return;
    const supabase = getSupabase();
    const [roomRes, playersRes, turnsRes, votesRes] = await Promise.all([
      supabase
        .from("rooms")
        .select("id,code,status,topic_text,current_round,current_turn,phase_deadline,reroll_used")
        .eq("id", roomId)
        .single(),
      supabase
        .from("players")
        .select("id,display_name,role")
        .eq("room_id", roomId)
        .order("created_at"),
      supabase
        .from("turns")
        .select("id,round_number,side,content")
        .eq("room_id", roomId)
        .order("created_at"),
      supabase
        .from("votes")
        .select("id,round_number,vote")
        .eq("room_id", roomId)
        .order("created_at"),
    ]);
    if (roomRes.error || playersRes.error || turnsRes.error || votesRes.error) {
      setError("Could not load the room");
      return;
    }
    setRoom(roomRes.data as Room);
    setPlayers(playersRes.data as Player[]);
    setTurns(turnsRes.data as Turn[]);
    setVotes(votesRes.data as Vote[]);
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
      for (const [table, filter] of [
        ["rooms", `id=eq.${roomId}`],
        ["players", `room_id=eq.${roomId}`],
        ["turns", `room_id=eq.${roomId}`],
        ["votes", `room_id=eq.${roomId}`],
      ] as const) {
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

  return { room, players, turns, votes, error };
}
