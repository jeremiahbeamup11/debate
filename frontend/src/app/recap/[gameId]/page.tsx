import Link from "next/link";
import { POWERED_BY, PRODUCT_NAME, TRUTHCORE_URL } from "@/config/branding";
import { FactCheckCard } from "@/components/FactCheckCard";
import { RecapClient } from "@/components/RecapClient";
import { getServerSupabase } from "@/lib/supabaseServer";
import { gameWinner, tallyRounds } from "@/lib/scoring";
import type { Check, Turn, Vote } from "@/lib/room";

const TOTAL_ROUNDS = 3;

// UUIDs only — never leak query behaviour on arbitrary strings.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RecapGame {
  id: string;
  room_id: string;
  status: string;
  topic_text: string | null;
}

function NotAvailable() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-extrabold tracking-tight">{PRODUCT_NAME}</h1>
      <p className="text-fg/50">This recap isn&apos;t available.</p>
      <Link href="/" className="font-semibold text-brand hover:text-fg">
        Start a new game →
      </Link>
    </main>
  );
}

export default async function RecapPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!UUID_RE.test(gameId)) return <NotAvailable />;

  const supabase = getServerSupabase();
  // Public-recap RLS only exposes completed games, so a live/unknown game
  // simply returns nothing here. Each completed game is immutable, so its
  // recap is permanent regardless of later "Play again" games in the room.
  const { data: game } = await supabase
    .from("games")
    .select("id,room_id,status,topic_text")
    .eq("id", gameId)
    .maybeSingle<RecapGame>();
  if (!game || game.status !== "complete") return <NotAvailable />;

  const [{ data: gamePlayers }, { data: players }, { data: turns }, { data: votes }, { data: checks }] =
    await Promise.all([
      supabase.from("game_players").select("player_id,role").eq("game_id", gameId),
      supabase.from("players").select("id,display_name").eq("room_id", game.room_id),
      supabase.from("turns").select("id,round_number,side,content").eq("game_id", gameId).order("created_at"),
      supabase.from("votes").select("id,round_number,vote").eq("game_id", gameId).order("created_at"),
      supabase.from("checks").select("id,round_number,judge_player_id,claim,status,verdict,explanation,source_url").eq("game_id", gameId).order("created_at"),
    ]);

  const roleRows = (gamePlayers ?? []) as { player_id: string; role: string }[];
  const nameById = new Map(
    ((players ?? []) as { id: string; display_name: string }[]).map((p) => [p.id, p.display_name]),
  );
  const turnList = (turns ?? []) as Turn[];
  const voteList = (votes ?? []) as Vote[];
  const checkList = (checks ?? []) as Check[];

  const nameOf = (side: "pro" | "con") => {
    const wanted = side === "pro" ? "debater_pro" : "debater_con";
    const gp = roleRows.find((r) => r.role === wanted);
    return (gp && nameById.get(gp.player_id)) ?? "?";
  };
  const judgeNameOf = (pid: string) => nameById.get(pid) ?? "A judge";

  const results = tallyRounds(voteList, TOTAL_ROUNDS);
  const winner = gameWinner(results);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 p-6 md:p-10">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">{PRODUCT_NAME}</h1>
        <a
          href={TRUTHCORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-brand hover:text-fg"
        >
          {POWERED_BY}
        </a>
      </header>

      <section className="flex flex-col items-center gap-4 text-center">
        <p className="text-lg text-fg/50">“{game.topic_text}”</p>
        <p className="text-5xl font-extrabold">
          {winner === "tie" ? (
            "It's a tie!"
          ) : (
            <span className={winner === "pro" ? "text-pro" : "text-con"}>
              {nameOf(winner)} wins!
            </span>
          )}
        </p>
        <p className="text-sm text-fg/50">
          <span className="text-pro">{nameOf("pro")} (PRO)</span> vs{" "}
          <span className="text-con">{nameOf("con")} (CON)</span>
        </p>
        <RecapClient gameId={gameId} />
      </section>

      {Array.from({ length: TOTAL_ROUNDS }, (_, i) => i + 1).map((round) => {
        const roundTurns = turnList.filter((t) => t.round_number === round);
        const roundChecks = checkList.filter((c) => c.round_number === round);
        if (roundTurns.length === 0 && roundChecks.length === 0) return null;
        const r = results[round - 1];
        return (
          <section key={round} className="flex flex-col gap-3">
            <p className="text-xs font-bold tracking-widest text-fg/40">ROUND {round}</p>
            {roundTurns.map((t) => {
              const pro = t.side === "pro";
              return (
                <div
                  key={t.id}
                  className={`max-w-xl rounded-2xl border p-4 ${
                    pro ? "self-start border-pro/25 bg-pro/10" : "self-end border-con/25 bg-con/10"
                  }`}
                >
                  <p
                    className={`text-xs font-bold tracking-widest ${pro ? "text-pro" : "text-con"}`}
                  >
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
            <p className="self-center rounded-full border border-line bg-surface px-4 py-1 text-sm text-fg/70">
              Round {round}: <span className="text-pro">PRO {r.pro}</span> —{" "}
              <span className="text-con">{r.con} CON</span>{" "}
              {r.winner === "tie" ? "· tie" : `· ${r.winner.toUpperCase()} takes it`}
            </p>
          </section>
        );
      })}

      <footer className="mt-4 flex flex-col items-center gap-3 border-t border-line pt-8 text-center">
        <p className="text-fg/50">Fact-checks powered by TruthCore.</p>
        <a
          href={TRUTHCORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-[10px] border border-brand px-6 py-3 font-bold text-brand hover:bg-brand hover:text-brand-ink"
        >
          Try TruthCore →
        </a>
      </footer>
    </main>
  );
}
