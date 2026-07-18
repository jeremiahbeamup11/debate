import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, LegalPage, Section } from "@/components/LegalPage";
import { PRODUCT_NAME } from "@/config/branding";

export const metadata: Metadata = { title: `Acceptable Use Policy — ${PRODUCT_NAME}` };

const CONTACT = "policies@truthcore.ai";

export default function AcceptableUsePage() {
  return (
    <LegalPage
      title="Acceptable Use Policy"
      effectiveDate="July 18, 2026"
      activeHref="/acceptable-use"
    >
      <div className="space-y-3 text-sm leading-relaxed text-fg/50">
        <p>
          This Acceptable Use Policy (&ldquo;AUP&rdquo;) applies to everyone who uses Debate Night
          at debate.truthcore.ai, operated by TruthCore AI Inc. (&ldquo;TruthCore&rdquo;). It is
          part of our{" "}
          <Link href="/terms" className="text-brand hover:text-fg">
            Terms of Service
          </Link>
          . Debate Night is built for spirited disagreement — debating a controversial topic in
          good faith is the point of the game and is always allowed. This policy is about how you
          play, not what positions you argue.
        </p>
      </div>

      <Section title="1. Prohibited Content">
        <p>
          Do not submit display names, topics, arguments, claims, or any other content that:
        </p>
        <Bullets
          items={[
            "Is illegal or promotes illegal activity;",
            "Harasses, threatens, bullies, or incites violence against any person or group;",
            "Contains hate speech — content attacking people based on race, ethnicity, national origin, religion, sex, gender identity, sexual orientation, disability, or similar characteristics;",
            "Is sexually explicit, or sexualizes or endangers minors in any way (we report child exploitation content to the National Center for Missing & Exploited Children and relevant authorities);",
            "Discloses another person’s private or personally identifying information without their consent (doxxing);",
            "Impersonates any person or entity, or misrepresents your affiliation with anyone;",
            "Infringes any copyright, trademark, or other intellectual property or proprietary right;",
            "Contains malware, spam, phishing links, or advertising.",
          ]}
        />
      </Section>

      <Section title="2. Prohibited Conduct">
        <p>Do not:</p>
        <Bullets
          items={[
            "Use the Service if you are under 13;",
            "Attempt to probe, scan, breach, or test the vulnerability of the Service or circumvent any security or access controls;",
            "Scrape, harvest, or collect data from the Service, or access it with bots or automated means;",
            "Abuse the fact-checking feature, including flooding it with requests, using it as a general-purpose API, or attempting to extract, resell, or repackage fact-check results outside the game;",
            "Interfere with other players’ use of the Service, including disrupting games you were not invited to, spoofing room codes, or manipulating judging;",
            "Reverse engineer, decompile, or attempt to extract the source code of the Service;",
            "Use the Service to develop a competing product;",
            "Attempt to overload, disrupt, or degrade the Service or its infrastructure.",
          ]}
        />
      </Section>

      <Section title="3. Fact-Checking Feature">
        <p>
          The fact-check feature exists so judges can check claims made during a live game. Use it
          for that purpose. Fact-check results are AI-generated and may be wrong; do not present
          them as authoritative determinations, and do not use the feature to generate content
          intended to harass or defame any person.
        </p>
      </Section>

      <Section title="4. Enforcement">
        <p>
          We may investigate suspected violations and take any action we consider appropriate,
          including removing content, ending game sessions, blocking access to the Service, and
          reporting activity to law enforcement. We may do so without prior notice. We are not
          obligated to monitor content, but we reserve the right to.
        </p>
      </Section>

      <Section title="5. Reporting Violations">
        <p>
          To report content or behavior that violates this policy, email{" "}
          <a href={`mailto:${CONTACT}`} className="text-brand hover:text-fg">
            {CONTACT}
          </a>{" "}
          with a description of the issue and, if possible, the room code and approximate time.
        </p>
      </Section>

      <Section title="6. Changes">
        <p>
          We may update this AUP from time to time. The current version will always be posted at
          debate.truthcore.ai. Continued use of the Service after changes take effect constitutes
          acceptance.
        </p>
      </Section>
    </LegalPage>
  );
}
