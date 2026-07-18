import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/LegalPage";
import { PRODUCT_NAME } from "@/config/branding";

export const metadata: Metadata = { title: `Acceptable Use Policy — ${PRODUCT_NAME}` };

export default function AcceptableUsePage() {
  return (
    <LegalPage title="Acceptable Use Policy" activeHref="/acceptable-use">
      {/* TODO: replace this placeholder with the drafted Acceptable Use Policy.
          Add as many <Section title="…">…</Section> blocks as you need. */}
      <Section title="Draft">
        This Acceptable Use Policy is being finalized and will appear here shortly.
      </Section>
    </LegalPage>
  );
}
