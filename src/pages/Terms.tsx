import LegalPage from "@/components/LegalPage";

const CONTACT_EMAIL = "fernandojo3122@gmail.com";

const Terms = () => (
  <LegalPage
    eyebrow="Legal — Terms"
    title="Terms of Service"
    updated="August 6, 2026"
    intro="Short version: LiftOS is a training log, not a medical service. Use it honestly, train sensibly, and your data stays yours."
    crossLink={{ to: "/privacy", label: "Privacy Policy" }}
    sections={[
      {
        title: "The service",
        body: (
          <>
            <p>
              LiftOS is a strength-training log: it records your workouts, turns connected wearable
              activity into reviewable sessions, and surfaces coaching insights from your own data.
              By creating an account you agree to these terms.
            </p>
          </>
        ),
      },
      {
        title: "Your account",
        body: (
          <>
            <p>
              Keep your sign-in credentials to yourself and give us accurate account information. You
              are responsible for activity that happens under your account. If you believe your
              account has been compromised, contact us and we will lock it down.
            </p>
          </>
        ),
      },
      {
        title: "Not medical advice",
        body: (
          <>
            <p>
              LiftOS provides training statistics and coaching suggestions for informational purposes
              only. It is not medical advice, and no output of the app is a substitute for guidance
              from a physician or qualified professional. Consult a doctor before starting a training
              program, and stop training if something hurts. You train at your own risk.
            </p>
          </>
        ),
      },
      {
        title: "Strava and third-party services",
        body: (
          <>
            <p>
              Connecting Strava is optional and subject to Strava&apos;s own terms. LiftOS uses the
              connection only to fetch your activities for your own log. We may suspend the
              integration if Strava&apos;s API or policies require it.
            </p>
          </>
        ),
      },
      {
        title: "App Store",
        body: (
          <>
            <p>
              When you use LiftOS through the Apple App Store, Apple is not a party to these terms
              and has no obligation to provide support or maintenance for the app. Any App Store
              purchases are additionally governed by Apple&apos;s Media Services Terms.
            </p>
          </>
        ),
      },
      {
        title: "Acceptable use and termination",
        body: (
          <>
            <p>
              Do not abuse the service: no attempts to access other users&apos; data, disrupt the
              platform, or reverse the API. We may suspend accounts that do. You can leave at any
              time — request deletion and your data goes with you, as described in the Privacy
              Policy.
            </p>
          </>
        ),
      },
      {
        title: "Changes and contact",
        body: (
          <>
            <p>
              The service is provided &quot;as is&quot;, and these terms may evolve with the product;
              material changes will be reflected in the date above. Questions:{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-primary transition-colors duration-200 hover:text-primary/80"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </>
        ),
      },
    ]}
  />
);

export default Terms;
