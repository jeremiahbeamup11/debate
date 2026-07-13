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
  status: "lobby" | "active";
  topic_text: string | null;
}

/**
 * Live room state: reads via anon key under RLS (members only), refreshed by
 * a private-per-room realtime subscription. All writes go through the backend.
 */
export function useRoom(roomId: string | null): {
  room: Room | null;
  players: Player[];
  error: string | null;
} {
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!roomId) return;
    const supabase = getSupabase();
    const [roomRes, playersRes] = await Promise.all([
      supabase.from("rooms").select("id,code,status,topic_text").eq("id", roomId).single(),
      supabase
        .from("players")
        .select("id,display_name,role")
        .eq("room_id", roomId)
        .order("created_at"),
    ]);
    if (roomRes.error || playersRes.error) {
      setError("Could not load the room");
      return;
    }
    setRoom(roomRes.data as Room);
    setPlayers(playersRes.data as Player[]);
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
      channel = supabase
        .channel(`room:${roomId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
          () => void refresh(),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` },
          () => void refresh(),
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void getSupabase().removeChannel(channel);
    };
  }, [roomId, refresh]);

  return { room, players, error };
}
