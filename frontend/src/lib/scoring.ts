import type { Vote } from "@/lib/room";

export interface RoundResult {
  round: number;
  pro: number;
  con: number;
  winner: "pro" | "con" | "tie";
}

/** Tally revealed votes per round. Simple majority; ties (incl. no votes) stay ties. */
export function tallyRounds(votes: Vote[], totalRounds: number): RoundResult[] {
  const results: RoundResult[] = [];
  for (let round = 1; round <= totalRounds; round++) {
    const pro = votes.filter((v) => v.round_number === round && v.vote === "pro").length;
    const con = votes.filter((v) => v.round_number === round && v.vote === "con").length;
    results.push({ round, pro, con, winner: pro > con ? "pro" : con > pro ? "con" : "tie" });
  }
  return results;
}

export function gameWinner(results: RoundResult[]): "pro" | "con" | "tie" {
  const proWins = results.filter((r) => r.winner === "pro").length;
  const conWins = results.filter((r) => r.winner === "con").length;
  return proWins > conWins ? "pro" : conWins > proWins ? "con" : "tie";
}
