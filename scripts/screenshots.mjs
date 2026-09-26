// Full-app screenshot sweep for handoff (Codex, designers, App Store prep).
// Runs against the QA dev server (mock auth, no writes) at an iPhone
// viewport, dark and light, and writes PNGs + a README index to
// docs/screenshots/. Usage: THEME_KEY=<localStorage key> node scripts/screenshots.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:8085";
const THEME_KEY = process.env.THEME_KEY ?? "liftos-theme-v2";
const OUT = "docs/screenshots";

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

/** Each shot: route, optional actions, optional seeds. `full` = full page. */
const SHOTS = [
  { name: "sign-in", path: "/sign-in", authed: false },
  { name: "create-account", path: "/create-account", authed: false },
  { name: "onboarding", path: "/onboarding", authed: false },
  { name: "home-first-run", path: "/dashboard", full: true },
  { name: "home-split-intake", path: "/dashboard", actions: async (p) => {
      await p.getByRole("button", { name: /build my split/i }).click();
      for (const d of ["Monday", "Wednesday", "Friday"]) await p.getByRole("button", { name: d, exact: true }).click();
    } },
  { name: "workouts-library", path: "/workouts", full: true },
  { name: "workout-builder", path: "/workouts?new=1" },
  { name: "workout-builder-ai", path: "/workouts?new=1", actions: async (p) => {
      await p.getByRole("button", { name: "Build with AI" }).click();
    } },
  { name: "active-session", path: "/workouts/active", full: true,
    seeds: { liftos_active_workout_session: SESSION, "liftos-voice-dev": "1" } },
  { name: "active-session-vest", path: "/workouts/active",
    seeds: { liftos_active_workout_session: SESSION },
    actions: async (p) => { await p.getByRole("button", { name: /^vest$/i }).click(); } },
  { name: "active-session-vitals", path: "/workouts/active",
    seeds: { liftos_active_workout_session: SESSION },
    actions: async (p) => { await p.locator('button[aria-label^="Live vitals"]').click(); } },
  { name: "active-session-voice-card", path: "/workouts/active",
    seeds: { liftos_active_workout_session: SESSION, "liftos-voice-dev": "1", "liftos-voice-dev-phase": "applied" } },
  { name: "tab-chooser", path: "/dashboard", actions: async (p) => {
      await p.getByRole("button", { name: /start or create a workout/i }).click();
    } },
  { name: "progress", path: "/progress", full: true },
  { name: "calendar", path: "/calendar", full: true },
  { name: "coach", path: "/coach" },
];

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
    await context.addInitScript(({ key, theme, seeds }) => {
      try {
        localStorage.setItem(key, theme); // ThemeContext stores the raw preference
        for (const [k, v] of Object.entries(seeds ?? {})) localStorage.setItem(k, v);
      } catch {}
    }, { key: THEME_KEY, theme, seeds: shot.seeds ?? {} });
    const page = await context.newPage();
    try {
      await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1200);
      if (shot.actions) { await shot.actions(page); await page.waitForTimeout(900); }
      // Mock auth redirects the auth screens to the app — skip those shots then.
      if (shot.authed === false && !/sign-in|create-account|onboarding/.test(page.url())) {
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

iPhone viewport (393×852 @2x), captured from the QA build (fixture account,
no real data). Regenerate with \`node scripts/screenshots.mjs\` while the
\`liftos-qa\` dev server is running.

## Dark
${byTheme("dark")}

## Light
${byTheme("light")}
`);
console.log(`\n${index.length} screenshots → ${OUT}/`);
