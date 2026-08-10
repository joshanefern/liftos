// First-time-user audit: screenshots + text dumps of every route with zero data.
import { chromium } from "playwright";
import fs from "node:fs";

const OUT = "/private/tmp/claude-501/-Users-joshanef-dev-Jarvis-OS/4912c796-fb3d-4495-b2f0-fb69a72186e0/scratchpad";
fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:8085";

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  colorScheme: "light",
});
await ctx.addInitScript(() => {
  try { localStorage.setItem("liftos-theme", "light"); } catch {}
});
const page = await ctx.newPage();
const logs = [];
page.on("console", (m) => { if (m.type() === "error") logs.push("console.error: " + m.text()); });
page.on("pageerror", (e) => logs.push("pageerror: " + e.message));

const dump = async (name) => {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const text = await page.evaluate(() => document.body.innerText);
  fs.writeFileSync(`${OUT}/${name}.txt`, text);
  console.log(`\n===== ${name} (${page.url()}) =====\n${text.slice(0, 2000)}`);
};

// 1. Landing
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await dump("01-landing");

// 2. Onboarding (fixture auth should allow direct visit)
await page.goto(BASE + "/onboarding", { waitUntil: "networkidle" });
await dump("02-onboarding");

// 3. Dashboard zero data
await page.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
await dump("03-dashboard");

// 4. Workouts
await page.goto(BASE + "/workouts", { waitUntil: "networkidle" });
await dump("04-workouts");

// 5. Log(+) tab: active workout w/ no session
await page.goto(BASE + "/workouts/active", { waitUntil: "networkidle" });
await dump("05-active-empty");

// 6. Calendar
await page.goto(BASE + "/calendar", { waitUntil: "networkidle" });
await dump("06-calendar");

// 7. Progress
await page.goto(BASE + "/progress", { waitUntil: "networkidle" });
await dump("07-progress");

// 8. Coach — initial, then try sending a prompt to see the offline path
await page.goto(BASE + "/coach", { waitUntil: "networkidle" });
await dump("08-coach-initial");
const ta = page.locator("textarea").first();
if (await ta.count()) {
  await ta.fill("What should I train today?");
  await ta.press("Enter");
  await page.waitForTimeout(6000);
  await dump("09-coach-after-send");
}

console.log("\n===== console/page errors =====\n" + logs.join("\n"));
await browser.close();
