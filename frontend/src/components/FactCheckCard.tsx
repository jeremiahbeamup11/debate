"use client";

import { track } from "@/lib/analytics";
import { POWERED_BY, TRUTHCORE_URL } from "@/config/branding";
import type { Check } from "@/lib/room";

// TruthCore's exact verdict palette (from truthcore-frontend): colored text on a
// faint tint, matching the fact-check cards users see on truthcore.ai.
const VERDICT_STYLE: Record<string, { badge: string; card: string }> = {
  True: { badge: "text-vtrue bg-vtrue/10 border-vtrue/30", card: "border-vtrue/25" },
  False: { badge: "text-vfalse bg-vfalse/10 border-vfalse/30", card: "border-vfalse/25" },
  Misleading: {
    badge: "text-vmisleading bg-vmisleading/10 border-vmisleading/30",
    card: "border-vmisleading/25",
  },
  Unverifiable: {
    badge: "text-vunverifiable bg-vunverifiable/10 border-vunverifiable/30",
    card: "border-vunverifiable/25",
  },
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
  const verdict = check.status === "done" && check.verdict ? VERDICT_STYLE[check.verdict] : null;

  return (
    <div
      className={`rounded-2xl border bg-surface ${verdict ? verdict.card : "border-line"} ${
        large ? "p-6" : "p-4"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`font-extrabold tracking-tight text-brand ${large ? "text-lg" : "text-sm"}`}
        >
          TruthCore
        </span>
        {verdict && (
          <span
            className={`rounded-full border px-3 py-1 font-bold ${verdict.badge} ${
              large ? "text-base" : "text-xs"
            }`}
          >
            {check.verdict}
          </span>
        )}
      </div>

      {/* Judge attribution + the claim, both rendered as plain text (§5). */}
      <p className={`mt-3 text-fg/70 ${large ? "text-base" : "text-sm"}`}>
        <span className="font-semibold text-fg">{judgeName} challenged:</span>{" "}
        “{check.claim}”
      </p>

      {check.status === "pending" && (
        <p className={`mt-3 animate-pulse text-fg/50 ${large ? "text-lg" : "text-sm"}`}>
          TruthCore is checking…
        </p>
      )}

      {check.status === "failed" && (
        <p className={`mt-3 text-fg/40 ${large ? "text-base" : "text-sm"}`}>
          TruthCore couldn&apos;t verify this one — try another claim.
        </p>
      )}

      {check.status === "done" && (
        <>
          {check.explanation && (
            <p className={`mt-3 font-medium ${large ? "text-xl" : "text-base"}`}>
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
              className={`font-semibold text-brand hover:text-fg ${large ? "text-sm" : "text-xs"}`}
            >
              {POWERED_BY} →
            </a>
            {check.source_url && (
              <a
                href={check.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-fg/40 hover:text-fg/70 ${large ? "text-sm" : "text-xs"}`}
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
