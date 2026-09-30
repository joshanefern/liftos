// Full-app screenshot sweep for handoff (Codex, designers, App Store prep).
// Runs against the QA dev server (mock auth, no writes) at an iPhone
// viewport, dark and light, and writes PNGs + a README index to
// docs/screenshots/. Usage: THEME_KEY=<localStorage key> node scripts/screenshots.mjs
//
// Two accounts are captured: the QA fixture user as-is (no history — the
// first-run experience), and a returning lifter (`returning: true`) whose
// six weeks of history are served by scripts/screenshot-fixtures.mjs from
// intercepted requests. Coach replies in the returning set are canned text
// rendered through the real streaming path, not model output.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  buildReturningFixture,
  installFixtureRoutes,
  sessionFromTemplate,
  sessionSeed,
  supabaseUrl,
} from "./screenshot-fixtures.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:8085";
const THEME_KEY = process.env.THEME_KEY ?? "liftos-theme-v2";
const OUT = process.env.OUT_DIR ?? "docs/screenshots";

const SESSION = JSON.stringify({
  name: "Push Day",
  templateId: null,
  startedAt: new Date(Date.now() - 14 * 60_000).toISOString(),
  exercises: [
    { id: "e1", name: "Bench Press", category: "", target: "4 × 8", sets: [
      { id: "s1", reps: 8, weight: 135 }, { id: "s2", reps: 8, weight: 135 }, { id: "s3", reps: 8, weight: 135 } ] },
    { id: "e2", name: "Treadmill", kind: "cardio", category: "", target: "", sets: [{ id: "s4", reps: "", weight: "" }] },
    { id: "e3", name: "Pull Up", kind: "bodyweight", category: "", target: "", sets: [{ id: "s5", reps: "", weight: "" }] },
  ],
});

/** The lifter's rest timer setting, turned on (it is off by default). */
const REST_ON = JSON.stringify({ on: true, seconds: 120 });

const EMPTY_SESSION = JSON.stringify({
  name: "Quick start",
  templateId: null,
  startedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
  exercises: [],
});

/** Each shot: route, optional actions, optional seeds. `full` = full page. */
const SHOTS = [
  { name: "sign-in", path: "/sign-in", authed: false },
  { name: "create-account", path: "/create-account", authed: false },
  { name: "onboarding", path: "/onboarding", authed: false },
  { name: "home-first-run", path: "/dashboard", full: true },
  // The sheet opens with the onboarding day count already selected.
  { name: "home-weekly-plan", path: "/dashboard", actions: async (p) => {
      await p.getByRole("button", { name: /build my weekly plan/i }).click();
    } },
  { name: "workouts-library", path: "/workouts", full: true },
  { name: "workout-builder", path: "/workouts?new=1" },
  { name: "workout-builder-ai", path: "/workouts?new=1", actions: async (p) => {
      await p.getByRole("button", { name: "Design with AI" }).click();
    } },
  { name: "workout-builder-discard", path: "/workouts?new=1", actions: async (p) => {
      await p.getByPlaceholder(/push day/i).fill("Upper Body");
      await p.getByRole("button", { name: "Close" }).click();
    } },
  { name: "active-session", path: "/workouts/active", full: true,
    seeds: { liftos_active_workout_session: SESSION, "liftos-voice-dev": "1" } },
  { name: "active-session-vest", path: "/workouts/active",
    seeds: { liftos_active_workout_session: SESSION },
    actions: async (p) => {
      await focusExercise(p, "Treadmill");
      await p.getByRole("button", { name: /vest or pack weight/i }).click();
    } },
  { name: "active-session-vitals", path: "/workouts/active",
    seeds: { liftos_active_workout_session: SESSION },
    actions: async (p) => {
      await focusExercise(p, "Treadmill");
      await p.locator('button[aria-label^="Live vitals"]').click();
    } },
  { name: "active-session-voice-card", path: "/workouts/active",
    seeds: { liftos_active_workout_session: SESSION, "liftos-voice-dev": "1", "liftos-voice-dev-phase": "applied" } },
  { name: "tab-chooser", path: "/dashboard", actions: async (p) => {
      await p.getByRole("button", { name: /start or create a workout/i }).click();
    } },
  { name: "progress", path: "/progress", full: true },
  { name: "calendar", path: "/calendar", full: true },
  { name: "coach", path: "/coach" },
  { name: "coach-starting-point", path: "/coach", actions: async (p) => {
      await p.getByRole("button", { name: /build my first workout/i }).click();
    } },
  { name: "coach-voice-answer", path: "/coach", full: true, actions: async (p) => {
      await p.getByRole("button", { name: /how does voice logging work/i }).click();
    } },
  { name: "forgot-password", path: "/forgot-password", authed: false },
  { name: "onboarding-step-2", path: "/onboarding", authed: false, actions: async (p) => { await advance(p, 1); } },
  { name: "onboarding-step-4", path: "/onboarding", authed: false, actions: async (p) => { await advance(p, 3); } },
  // Connections drawer: iOS-native only (healthKitAvailable) — not capturable on web.
  { name: "workouts-library-preview", path: "/workouts", actions: async (p) => {
      await p.getByRole("button", { name: /full body foundations/i }).first().click();
    } },
  { name: "workout-builder-ai-chips", path: "/workouts?new=1", actions: async (p) => {
      await p.getByRole("button", { name: "Design with AI" }).click();
      await p.getByRole("button", { name: /^45 min$/i }).click();
      await p.getByRole("button", { name: /dumbbells only/i }).click();
    } },
  // The rest timer is off until the lifter adds it — seeded on here so the
  // rest block under "Complete set" is in the shot.
  { name: "active-session-set-done", path: "/workouts/active", full: true,
    seeds: { liftos_active_workout_session: SESSION, "liftos-voice-dev": "1", "liftos-rest-timer": REST_ON },
    actions: async (p) => { await p.getByRole("button", { name: /^complete set$/i }).click(); } },
  { name: "active-session-menu", path: "/workouts/active",
    seeds: { liftos_active_workout_session: SESSION },
    actions: async (p) => { await p.getByRole("button", { name: /more session options/i }).click(); } },
  // ⋯ → Rest timer: the ⋯ sheet closes first, then this one rises.
  { name: "active-session-rest-timer", path: "/workouts/active",
    seeds: { liftos_active_workout_session: SESSION, "liftos-rest-timer": REST_ON },
    actions: async (p) => {
      await p.getByRole("button", { name: /more session options/i }).click();
      await p.waitForTimeout(600);
      await p.getByRole("button", { name: /^rest timer/i }).click();
      await p.getByRole("dialog", { name: "Rest timer" }).waitFor({ timeout: 5000 });
    } },
  // Every set logged: Finish lives in its own card, never in the exercise's.
  { name: "active-session-finish-card", path: "/workouts/active",
    seeds: { liftos_active_workout_session: SESSION, "liftos-voice-dev": "1" },
    actions: async (p) => {
      const complete = p.getByRole("button", { name: /^complete set$/i });
      for (let i = 0; i < 10 && (await complete.count()); i += 1) {
        await complete.first().click();
        await p.waitForTimeout(600);
      }
      await p.waitForTimeout(1200);
    } },
  { name: "active-session-quick-start-empty", path: "/workouts/active",
    seeds: { liftos_active_workout_session: EMPTY_SESSION, "liftos-voice-dev": "1" } },
  { name: "active-session-add-exercise", path: "/workouts/active",
    seeds: { liftos_active_workout_session: EMPTY_SESSION, "liftos-voice-dev": "1" },
    actions: async (p) => {
      await p.getByRole("toolbar", { name: "Workout controls" }).getByRole("button", { name: "Add exercise" }).click();
      await p.waitForTimeout(900);
    } },
  { name: "privacy", path: "/privacy", full: true },
  { name: "terms", path: "/terms", full: true },

  // ── Returning lifter (fixture history) ──
  { name: "returning-home", path: "/dashboard", full: true, returning: true },
  { name: "returning-workouts-library", path: "/workouts", full: true, returning: true },
  { name: "returning-active-session", path: "/workouts/active", full: true, returning: true,
    session: "Push Day" },
  // Finishing with new records opens the celebration first; Done reveals the recap.
  { name: "returning-workout-records", path: "/workouts/active", returning: true,
    session: "Push Day", actions: finishWorkout },
  { name: "returning-workout-recap", path: "/workouts/active", full: true, returning: true,
    session: "Push Day", actions: async (p) => {
      await finishWorkout(p);
      await p.getByRole("button", { name: /^done$/i }).click();
      await p.waitForTimeout(1800);
    } },
  { name: "returning-home-week-overview", path: "/dashboard", returning: true, actions: async (p) => {
      await p.getByRole("button", { name: /^This week:/ }).click();
      await p.getByRole("dialog", { name: "This week" }).waitFor({ timeout: 5000 });
      await p.waitForTimeout(600);
    } },
  { name: "returning-progress", path: "/progress", full: true, returning: true },
  { name: "returning-progress-improvement", path: "/progress", returning: true, actions: async (p) => {
      await p.getByRole("button", { name: /^improvement/i }).click();
      await p.getByRole("dialog", { name: "Improvement" }).waitFor({ timeout: 5000 });
      await p.waitForTimeout(800);
    } },
  { name: "returning-calendar", path: "/calendar", full: true, returning: true },
  { name: "returning-calendar-day", path: "/calendar", returning: true, actions: async (p) => {
      await p
        .locator('button[aria-label*="workout" i]:not([disabled]):not([aria-label*="no workout" i])')
        .last()
        .click();
    } },
  { name: "returning-coach", path: "/coach", returning: true },
  { name: "returning-coach-reply", path: "/coach", full: true, returning: true, actions: async (p) => {
      const box = p.locator("textarea").first();
      await box.fill("I only have 30 minutes today. What should I keep from Push Day?");
      await box.press("Enter");
      await p.getByText("Skip the pushdowns today", { exact: false }).waitFor({ timeout: 15_000 });
    } },
];

/** Point the session's focus card at another exercise via the list below it. */
async function focusExercise(p, name) {
  await p
    .locator('section[aria-labelledby="session-exercise-list"]')
    .getByRole("button", { name: new RegExp(name, "i") })
    .click();
  await p.waitForTimeout(500);
}

/** Log every set of the seeded session, then finish — lands on the recap. */
async function finishWorkout(p) {
  const complete = p.getByRole("button", { name: /^complete set$/i });
  for (let i = 0; i < 40; i += 1) {
    if (!(await complete.count())) break;
    await complete.first().click();
    await p.waitForTimeout(140);
  }
  await p.getByRole("button", { name: /finish workout/i }).first().click();
  await p.waitForTimeout(1600);
}

/** Onboarding: pick the first choice on each step and continue N times. */
async function advance(p, times) {
  for (let i = 0; i < times; i += 1) {
    const choice = p.locator("button").filter({ hasNotText: /continue|next|back|skip|finish/i }).first();
    if (await choice.count()) await choice.click();
    await p.waitForTimeout(250);
    const next = p.getByRole("button", { name: /continue|next|finish/i }).first();
    if (await next.count()) await next.click();
    await p.waitForTimeout(450);
  }
}

const browser = await chromium.launch();
const index = [];
for (const theme of ["dark", "light"]) {
  mkdirSync(`${OUT}/${theme}`, { recursive: true });
  let n = 0;
  for (const shot of SHOTS) {
    const context = await browser.newContext({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      colorScheme: theme,
    });
    const seeds = { ...(shot.seeds ?? {}) };
    if (shot.returning) {
      const fixture = buildReturningFixture();
      await installFixtureRoutes(context, fixture);
      Object.assign(seeds, sessionSeed(supabaseUrl()));
      if (shot.session) {
        const template = fixture.templates.find((t) => t.name === shot.session);
        seeds.liftos_active_workout_session = sessionFromTemplate(template);
      }
    }
    await context.addInitScript(({ key, theme, seeds }) => {
      try {
        localStorage.setItem(key, theme); // ThemeContext stores the raw preference
        for (const [k, v] of Object.entries(seeds ?? {})) localStorage.setItem(k, v);
      } catch {}
    }, { key: THEME_KEY, theme, seeds });
    const page = await context.newPage();
    try {
      await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1200);
      if (shot.actions) { await shot.actions(page); await page.waitForTimeout(900); }
      // Mock auth redirects the auth screens to the app — skip those shots then.
      if (shot.authed === false && !/sign-in|create-account|onboarding|forgot-password/.test(page.url())) {
        console.log(`skip ${shot.name} (redirected to ${new URL(page.url()).pathname})`);
        await context.close();
        continue;
      }
      n += 1;
      const file = `${theme}/${String(n).padStart(2, "0")}-${shot.name}.png`;
      await page.screenshot({ path: `${OUT}/${file}`, fullPage: !!shot.full });
      index.push({ theme, file, path: shot.path, name: shot.name });
      console.log(`✓ ${file}`);
    } catch (err) {
      console.log(`✗ ${theme}/${shot.name}: ${err.message.split("\n")[0]}`);
    }
    await context.close();
  }
}
await browser.close();

const byTheme = (t) => index.filter((i) => i.theme === t).map((i) => `- \`${i.file}\` — ${i.name} (\`${i.path}\`)`).join("\n");
writeFileSync(`${OUT}/README.md`, `# LiftOS screenshots

iPhone viewport (393×852 @2x), captured from the QA build. Regenerate with
\`node scripts/screenshots.mjs\` while the \`liftos-qa\` dev server is running.

Two accounts, neither real:
- **New lifter** — the QA fixture user with no history (first-run screens).
- **Returning lifter** (\`returning-*\`) — six weeks of Push / Pull / Legs
  served from \`scripts/screenshot-fixtures.mjs\`. Every number on those
  screens is computed by the app from that history. The Coach reply and the
  Coach Insight bullets are canned text rendered through the app's real
  streaming and markdown path — they show how a reply looks, they are not
  model output.

## Dark
${byTheme("dark")}

## Light
${byTheme("light")}
`);
console.log(`\n${index.length} screenshots → ${OUT}/`);
