import Link from "next/link";
import { POWERED_BY, PRODUCT_NAME } from "@/config/branding";

// Shared shell for the legal pages (privacy / terms / acceptable-use). Matches
// TruthCore's policy layout — sticky cross-nav, Syne, muted prose on #0a0a0c.
export const POLICIES = [
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
  { label: "Acceptable Use", href: "/acceptable-use" },
] as const;

export function LegalPage({
  title,
  effectiveDate,
  activeHref,
  children,
}: {
  title: string;
  effectiveDate?: string;
  activeHref: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-bg/85 px-6 py-3 backdrop-blur">
        <Link href="/" className="text-sm font-extrabold tracking-tight hover:text-fg">
          {PRODUCT_NAME}
        </Link>
        <div className="flex gap-1">
          {POLICIES.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                p.href === activeHref ? "bg-surface text-fg" : "text-fg/30 hover:text-fg/70"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </nav>
      <main className="mx-auto w-full max-w-2xl px-6 py-14">
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-fg/40">
          {POWERED_BY}
          {effectiveDate ? ` · Effective ${effectiveDate}` : ""}
        </p>
        <div className="mt-10 flex flex-col gap-8">{children}</div>
      </main>
    </div>
  );
}

/** A titled prose section, for use inside LegalPage. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs font-bold uppercase tracking-wider text-fg">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-fg/50">{children}</div>
    </section>
  );
}

/** Bullet list matching TruthCore's policy-page list styling. */
export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="mt-2 h-[3px] w-[3px] shrink-0 rounded-full bg-brand/60" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
