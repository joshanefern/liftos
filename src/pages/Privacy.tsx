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
                <span className="text-fg font-medium">Wearable activity</span> — if you connect Apple
                Health on iOS, the workouts and overnight metrics (heart rate, HRV, sleep) LiftOS
                reads so it can turn them into reviewable sessions and a recovery readout.
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
              Apple Health data is read on your device and only the workout summaries you choose to
              review are stored in your account. Overnight recovery metrics are processed on-device
              and never leave your phone.
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
        title: "Apple Health integration",
        body: (
          <>
            <p>
              The Apple Health connection is read-only: LiftOS reads your workouts so you can
              confirm them as sessions, and your overnight vitals to compute recovery. Nothing is
              written back to Health, and nothing leaves your account.
            </p>
            <p>
              You can revoke access at any time in iOS Settings → Health → Data Access &amp;
              Devices → LiftOS — reading stops immediately.
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
