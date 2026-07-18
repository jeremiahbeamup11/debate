import type { Metadata } from "next";
import { Bullets, LegalPage, Section } from "@/components/LegalPage";
import { PRODUCT_NAME } from "@/config/branding";

export const metadata: Metadata = { title: `Privacy Policy — ${PRODUCT_NAME}` };

const CONTACT = "policies@truthcore.ai";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" effectiveDate="July 18, 2026" activeHref="/privacy">
      <div className="space-y-3 text-sm leading-relaxed text-fg/50">
        <p>
          This Privacy Policy describes how TruthCore AI Inc., a Delaware corporation
          (&ldquo;TruthCore,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;), collects, uses, and shares
          information when you use Debate Night at debate.truthcore.ai (the
          &ldquo;Service&rdquo;). This policy applies only to Debate Night. Other TruthCore
          products are covered by their own privacy policies.
        </p>
        <p>
          <span className="font-semibold text-fg/70">The short version:</span>{" "}Debate Night has no
          accounts and no sign-up. We don&rsquo;t ask for your name, email, or payment information.
          We collect the content you type into the game, technical data your device sends
          automatically, and product analytics. Claims submitted for fact-checking are sent to a
          third-party AI provider to generate results.
        </p>
      </div>

      <Section title="1. Information We Collect">
        <p>
          <span className="font-semibold text-fg/70">Content you provide.</span>{" "}When you play, you
          may submit a display name, debate topics, debate arguments or messages, and claims for
          fact-checking. Anything you type into the Service is processed by us to run the game.
          Display names and content are visible to other players in your room. Please don&rsquo;t
          include personal information (yours or anyone else&rsquo;s) in display names, topics,
          arguments, or claims.
        </p>
        <p>
          <span className="font-semibold text-fg/70">Game data.</span>{" "}Room codes, game state
          (rounds, judging results, winners), and session recaps, associated with the room rather
          than with any identified person.
        </p>
        <p>
          <span className="font-semibold text-fg/70">Automatic technical data.</span>{" "}Like most web
          services, our servers and infrastructure providers automatically receive your IP address,
          browser and device type, operating system, referring pages, and timestamps, and may log
          this information for security and operations.
        </p>
        <p>
          <span className="font-semibold text-fg/70">Analytics and cookies.</span>{" "}We use analytics
          tools (currently PostHog) and browser storage (cookies and/or localStorage) to understand
          how the Service is used — for example, page views, feature usage, session length, and
          approximate location derived from IP address. We use this to fix problems and improve the
          game.
        </p>
        <p>
          We do not collect your legal name, email address, phone number, payment information, or
          precise geolocation, and we do not knowingly link game activity to your real-world
          identity.
        </p>
      </Section>

      <Section title="2. How We Use Information">
        <p>We use the information above to:</p>
        <Bullets
          items={[
            "Operate the game (create rooms, sync players, run rounds, show recaps);",
            "Generate fact-check results for claims submitted by judges;",
            "Maintain security, prevent abuse, and enforce our Terms of Service and Acceptable Use Policy;",
            "Understand usage and improve the Service;",
            "Comply with legal obligations.",
          ]}
        />
        <p>
          We do not sell your personal information, and we do not use it for third-party
          advertising.
        </p>
      </Section>

      <Section title="3. How We Share Information">
        <p>
          <span className="font-semibold text-fg/70">With other players.</span>{" "}Your display name
          and the content you submit in a room are shown to the other players in that room, and may
          appear in the end-of-game recap.
        </p>
        <p>
          <span className="font-semibold text-fg/70">Service providers.</span>{" "}We share information
          with vendors that help us run the Service, who may process it only on our behalf,
          including:
        </p>
        <Bullets
          items={[
            "AI fact-checking: claims submitted by judges are sent to our fact-checking provider (currently Perplexity) to generate results;",
            "Hosting and infrastructure providers that run our servers, database, and realtime game connections;",
            "Analytics: PostHog, for usage analytics.",
          ]}
        />
        <p>
          <span className="font-semibold text-fg/70">Legal and safety.</span>{" "}We may disclose
          information if we believe it is reasonably necessary to comply with law or legal process,
          enforce our terms, or protect the rights, safety, or property of TruthCore, our users, or
          others.
        </p>
        <p>
          <span className="font-semibold text-fg/70">Business transfers.</span>{" "}If TruthCore is
          involved in a merger, acquisition, financing, or sale of assets, information may be
          transferred as part of that transaction.
        </p>
      </Section>

      <Section title="4. Data Retention">
        <p>
          Game content and room data are retained only as long as needed to operate the Service and
          for a reasonable period afterward for security, debugging, and product improvement, after
          which they are deleted or anonymized. Analytics data is retained according to our
          analytics provider&rsquo;s settings. Server logs are retained for a limited period for
          security and operations.
        </p>
      </Section>

      <Section title="5. Children">
        <p>
          The Service is not directed to children under 13, and we do not knowingly collect
          personal information from children under 13. If you believe a child under 13 has provided
          personal information through the Service, contact us at{" "}
          <a href={`mailto:${CONTACT}`} className="text-brand hover:text-fg">
            {CONTACT}
          </a>{" "}
          and we will delete it.
        </p>
      </Section>

      <Section title="6. Your Rights and Choices">
        <p>
          Because the Service has no accounts, we generally cannot identify which game data belongs
          to you. Still, depending on where you live (for example, the EEA, UK, or California), you
          may have rights to access, correct, or delete personal information, to object to or
          restrict certain processing, or to lodge a complaint with a supervisory authority. To
          exercise any right, email{" "}
          <a href={`mailto:${CONTACT}`} className="text-brand hover:text-fg">
            {CONTACT}
          </a>
          ; note that we may be unable to fulfill requests where we cannot verifiably link data to
          you. We do not sell or &ldquo;share&rdquo; personal information as those terms are defined
          under the California Consumer Privacy Act, and we treat browser-based opt-out preference
          signals (such as Global Privacy Control) accordingly.
        </p>
        <p>
          You can also limit collection by using your browser&rsquo;s cookie controls, though parts
          of the Service may not function without browser storage.
        </p>
      </Section>

      <Section title="7. International Users">
        <p>
          The Service is operated from the United States, and information is processed in the
          United States and other countries where our service providers operate, which may have
          different data protection laws than your jurisdiction. By using the Service, you
          understand your information will be processed as described in this policy.
        </p>
      </Section>

      <Section title="8. Security">
        <p>
          We use reasonable technical and organizational safeguards to protect information. No
          method of transmission or storage is completely secure, so we cannot guarantee absolute
          security.
        </p>
      </Section>

      <Section title="9. Changes to This Policy">
        <p>
          We may update this Privacy Policy from time to time. We will post the updated version at
          debate.truthcore.ai with a revised effective date. Material changes will be indicated by
          the updated date and, where appropriate, additional notice within the Service.
        </p>
      </Section>

      <Section title="10. Contact">
        <p>
          Questions or requests:{" "}
          <a href={`mailto:${CONTACT}`} className="text-brand hover:text-fg">
            {CONTACT}
          </a>
        </p>
        <p>TruthCore AI Inc.</p>
      </Section>
    </LegalPage>
  );
}
