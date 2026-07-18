import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/LegalPage";
import { PRODUCT_NAME } from "@/config/branding";

export const metadata: Metadata = { title: `Terms of Service — ${PRODUCT_NAME}` };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" activeHref="/terms">
      {/* TODO: replace this placeholder with the drafted Terms of Service. Add as
          many <Section title="…">…</Section> blocks as you need. */}
      <Section title="Draft">
        These Terms of Service are being finalized and will appear here shortly.
      </Section>
    </LegalPage>
  );
}
