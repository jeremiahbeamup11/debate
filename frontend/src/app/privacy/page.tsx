import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/LegalPage";
import { PRODUCT_NAME } from "@/config/branding";

export const metadata: Metadata = { title: `Privacy Policy — ${PRODUCT_NAME}` };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" activeHref="/privacy">
      {/* TODO: replace this placeholder with the drafted Privacy Policy. Add as
          many <Section title="…">…</Section> blocks as you need. */}
      <Section title="Draft">
        This Privacy Policy is being finalized and will appear here shortly.
      </Section>
    </LegalPage>
  );
}
