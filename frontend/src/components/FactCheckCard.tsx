"use client";

import { track } from "@/lib/analytics";
import { POWERED_BY, TRUTHCORE_URL } from "@/config/branding";
import type { Check } from "@/lib/room";

const VERDICT_STYLE: Record<string, string> = {
  True: "bg-emerald-500 text-zinc-950",
  False: "bg-red-500 text-zinc-950",
  Misleading: "bg-amber-400 text-zinc-950",
  Unverifiable: "bg-zinc-500 text-zinc-950",
};

/** A TruthCore fact-check card. `size` tunes it for the Main Screen vs phones. */
export function FactCheckCard({
  check,
  judgeName,
  size = "large",
}: {
  check: Check;
  judgeName: string;
  size?: "large" | "small";
}) {
  const large = size === "large";

  return (
    <div
      className={`rounded-2xl border border-emerald-500/40 bg-zinc-900 ${
        large ? "p-6" : "p-4"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={`font-black tracking-tight ${large ? "text-lg" : "text-sm"}`}>
          TruthCore
        </span>
        {check.status === "done" && check.verdict && (
          <span
            className={`rounded-full px-3 py-1 font-bold ${large ? "text-base" : "text-xs"} ${
              VERDICT_STYLE[check.verdict] ?? "bg-zinc-500 text-zinc-950"
            }`}
          >
            {check.verdict}
          </span>
        )}
      </div>

      {/* Judge attribution + the claim, both rendered as plain text (§5). */}
      <p className={`mt-3 ${large ? "text-base" : "text-sm"} text-zinc-300`}>
        <span className="font-semibold text-emerald-400">{judgeName} challenged:</span>{" "}
        “{check.claim}”
      </p>

      {check.status === "pending" && (
        <p className={`mt-3 animate-pulse text-zinc-400 ${large ? "text-lg" : "text-sm"}`}>
          TruthCore is checking…
        </p>
      )}

      {check.status === "failed" && (
        <p className={`mt-3 text-zinc-500 ${large ? "text-base" : "text-sm"}`}>
          TruthCore couldn&apos;t verify this one — try another claim.
        </p>
      )}

      {check.status === "done" && (
        <>
          {check.explanation && (
            <p className={`mt-3 ${large ? "text-xl" : "text-base"} font-medium`}>
              {check.explanation}
            </p>
          )}
          <div className="mt-4 flex items-center justify-between">
            <a
              href={TRUTHCORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                track("card_clicked", { verdict: check.verdict ?? "", check_id: check.id })
              }
              className={`font-medium text-emerald-400 hover:underline ${
                large ? "text-sm" : "text-xs"
              }`}
            >
              {POWERED_BY} →
            </a>
            {check.source_url && (
              <a
                href={check.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-zinc-500 hover:underline ${large ? "text-sm" : "text-xs"}`}
              >
                source
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}
