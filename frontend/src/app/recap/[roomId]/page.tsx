import Link from "next/link";
import { POWERED_BY, PRODUCT_NAME, TRUTHCORE_URL } from "@/config/branding";
import { FactCheckCard } from "@/components/FactCheckCard";
import { RecapClient } from "@/components/RecapClient";
import { getServerSupabase } from "@/lib/supabaseServer";
import { gameWinner, tallyRounds } from "@/lib/scoring";
import type { Check, Player, Turn, Vote } from "@/lib/room";

const TOTAL_ROUNDS = 3;

// UUIDs only — never leak query behaviour on arbitrary strings.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RecapRoom {
  id: string;
  status: string;
  topic_text: string | null;
}

function NotAvailable() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-black">{PRODUCT_NAME}</h1>
      <p className="text-zinc-400">This recap isn&apos;t available.</p>
      <Link href="/" className="text-emerald-400 hover:underline">
        Start a new game →
      </Link>
    </main>
  );
}

export default async function RecapPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  if (!UUID_RE.test(roomId)) return <NotAvailable />;

  const supabase = getServerSupabase();
  // Public-recap RLS only exposes completed rooms, so a live/unknown room
  // simply returns nothing here.
  const { data: room } = await supabase
    .from("rooms")
    .select("id,status,topic_text")
    .eq("id", roomId)
    .maybeSingle<RecapRoom>();
  if (!room || room.status !== "complete") return <NotAvailable />;

  const [{ data: players }, { data: turns }, { data: votes }, { data: checks }] =
    await Promise.all([
      supabase.from("players").select("id,display_name,role").eq("room_id", roomId).order("created_at"),
      supabase.from("turns").select("id,round_number,side,content").eq("room_id", roomId).order("created_at"),
      supabase.from("votes").select("id,round_number,vote").eq("room_id", roomId).order("created_at"),
      supabase.from("checks").select("id,round_number,judge_player_id,claim,status,verdict,explanation,source_url").eq("room_id", roomId).order("created_at"),
    ]);

  const playerList = (players ?? []) as Player[];
  const turnList = (turns ?? []) as Turn[];
  const voteList = (votes ?? []) as Vote[];
  const checkList = (checks ?? []) as Check[];

  const nameOf = (side: "pro" | "con") =>
    playerList.find((p) => p.role === (side === "pro" ? "debater_pro" : "debater_con"))
      ?.display_name ?? "?";
  const judgeNameOf = (pid: string) =>
    playerList.find((p) => p.id === pid)?.display_name ?? "A judge";

  const results = tallyRounds(voteList, TOTAL_ROUNDS);
  const winner = gameWinner(results);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 p-6 md:p-10">
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

      <section className="flex flex-col items-center gap-4 text-center">
        <p className="text-lg text-zinc-400">“{room.topic_text}”</p>
        <p className="text-5xl font-black">
          {winner === "tie" ? "It's a tie!" : `${nameOf(winner)} wins!`}
        </p>
        <p className="text-sm text-zinc-400">
          <span className="text-emerald-400">{nameOf("pro")} (PRO)</span> vs{" "}
          <span className="text-rose-400">{nameOf("con")} (CON)</span>
        </p>
        <RecapClient roomId={roomId} />
      </section>

      {Array.from({ length: TOTAL_ROUNDS }, (_, i) => i + 1).map((round) => {
        const roundTurns = turnList.filter((t) => t.round_number === round);
        const roundChecks = checkList.filter((c) => c.round_number === round);
        if (roundTurns.length === 0 && roundChecks.length === 0) return null;
        const r = results[round - 1];
        return (
          <section key={round} className="flex flex-col gap-3">
            <p className="text-xs font-bold tracking-widest text-zinc-500">ROUND {round}</p>
            {roundTurns.map((t) => {
              const pro = t.side === "pro";
              return (
                <div
                  key={t.id}
                  className={`max-w-xl rounded-2xl p-4 ${pro ? "self-start bg-emerald-900/50" : "self-end bg-rose-900/50"}`}
                >
                  <p className={`text-xs font-bold tracking-widest ${pro ? "text-emerald-400" : "text-rose-400"}`}>
                    {pro ? "PRO" : "CON"} — {nameOf(t.side)}
                  </p>
                  {/* Hostile input rendered as plain text (SECURITY.md §5) */}
                  <p className="mt-1 whitespace-pre-wrap break-words">{t.content}</p>
                </div>
              );
            })}
            {roundChecks.map((c) => (
              <FactCheckCard key={c.id} check={c} judgeName={judgeNameOf(c.judge_player_id)} />
            ))}
            <p className="self-center rounded-full bg-zinc-800 px-4 py-1 text-sm text-zinc-300">
              Round {round}: PRO {r.pro} — {r.con} CON{" "}
              {r.winner === "tie" ? "· tie" : `· ${r.winner.toUpperCase()} takes it`}
            </p>
          </section>
        );
      })}

      <footer className="mt-4 flex flex-col items-center gap-3 border-t border-zinc-800 pt-8 text-center">
        <p className="text-zinc-400">Fact-checks powered by TruthCore.</p>
        <a
          href={TRUTHCORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl border border-emerald-500 px-6 py-3 font-bold text-emerald-400 hover:bg-emerald-500 hover:text-zinc-950"
        >
          Try TruthCore →
        </a>
      </footer>
    </main>
  );
}
