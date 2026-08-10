import LegalPage from "@/components/LegalPage";

const CONTACT_EMAIL = "fernandojo3122@gmail.com";

const Privacy = () => (
  <LegalPage
    eyebrow="Legal — Privacy"
    title="Privacy Policy"
    updated="August 6, 2026"
    intro="LiftOS exists to log your training, not to monetize your data. This policy explains exactly what we collect, why we collect it, and what we will never do with it."
    crossLink={{ to: "/terms", label: "Terms of Service" }}
    sections={[
      {
        title: "What we collect",
        body: (
          <>
            <p>We collect only what the product needs to work:</p>
            <ul className="list-disc space-y-2 pl-5 marker:text-primary">
              <li>
                <span className="text-fg font-medium">Account details</span> — your email address and the
                name you provide at sign-up.
              </li>
              <li>
                <span className="text-fg font-medium">Training profile</span> — goals, experience level,
                equipment, training frequency, and preferred units.
              </li>
              <li>
                <span className="text-fg font-medium">Workout data</span> — the exercises, sets, weights,
                and reps you log or confirm in the app.
              </li>
              <li>
                <span className="text-fg font-medium">Wearable activity</span> — if you connect Strava,
                the activities LiftOS fetches so it can turn them into reviewable sessions.
              </li>
            </ul>
          </>
        ),
      },
      {
        title: "How your data is stored",
        body: (
          <>
            <p>
              Your data lives in our database (hosted on Supabase) behind row-level security, which
              means your records are only readable by your own signed-in account.
            </p>
            <p>
              Strava access tokens are stored server-side, encrypted, and are never exposed to the
              browser or to other users. They are used solely to fetch your own activities.
            </p>
          </>
        ),
      },
      {
        title: "What we never do",
        body: (
          <>
            <p>
              We do not sell your data. We do not share it with advertisers or data brokers. We do
              not use your training history for anything other than showing it back to you and
              powering your own coaching insights.
            </p>
          </>
        ),
      },
      {
        title: "Strava integration",
        body: (
          <>
            <p>
              The Strava connection is read-only: LiftOS fetches your activities so you can confirm
              them as workouts. Your Strava data is used only within your own account, is never
              shared with third parties, and is handled in line with the Strava API Agreement.
            </p>
            <p>
              You can disconnect at any time from Strava&apos;s settings (revoking LiftOS&apos;s
              access) or by contacting us — either way we stop fetching immediately.
            </p>
          </>
        ),
      },
      {
        title: "Deletion and your rights",
        body: (
          <>
            <p>
              You can request a full export or permanent deletion of your account and all associated
            data — workouts, profile, captured sessions, and tokens — by emailing{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-primary transition-colors duration-200 hover:text-primary/80"
              >
                {CONTACT_EMAIL}
              </a>
              . Deletion requests are honored within 30 days.
            </p>
          </>
        ),
      },
      {
        title: "Changes and contact",
        body: (
          <>
            <p>
              If this policy changes in a way that matters, we will note it here with a new date. For
              any privacy question, email{" "}
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

export default Privacy;
