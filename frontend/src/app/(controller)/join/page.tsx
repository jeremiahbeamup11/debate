"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { track } from "@/lib/analytics";
import { apiPost } from "@/lib/api";
import { POWERED_BY, PRODUCT_NAME } from "@/config/branding";

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setJoining(true);
    setError(null);
    try {
      const res = await apiPost<{ room_id: string; player_id: string }>("/rooms/join", {
        code: code.trim(),
        display_name: name.trim(),
      });
      window.sessionStorage.setItem("player_id", res.player_id);
      track("player_joined", { room_id: res.room_id });
      router.push(`/play/${res.room_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join");
      setJoining(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-3xl font-extrabold tracking-tight">{PRODUCT_NAME}</h1>
        <p className="text-sm font-semibold text-brand">{POWERED_BY}</p>
      </div>
      <form onSubmit={(e) => void join(e)} className="flex w-full max-w-xs flex-col gap-4">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ROOM CODE"
          maxLength={4}
          autoCapitalize="characters"
          autoComplete="off"
          required
          className="rounded-[10px] border border-line bg-surface px-4 py-4 text-center text-2xl font-bold uppercase tracking-[0.3em] outline-none placeholder:text-fg/30 focus:border-brand"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          maxLength={24}
          required
          className="rounded-[10px] border border-line bg-surface px-4 py-4 text-center text-xl outline-none placeholder:text-fg/30 focus:border-brand"
        />
        <button
          type="submit"
          disabled={joining || code.length !== 4 || name.trim().length === 0}
          className="rounded-[10px] bg-brand px-6 py-4 text-xl font-bold text-brand-ink transition hover:brightness-110 disabled:opacity-40"
        >
          {joining ? "Joining…" : "Join"}
        </button>
        {error && <p className="text-center text-vfalse">{error}</p>}
      </form>
    </main>
  );
}
