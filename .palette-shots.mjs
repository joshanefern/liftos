// Screenshots the REAL LiftOS app (QA server on 8085) with each palette
// direction injected into the live token system — exactly what a token-swap
// implementation would produce.
import { chromium } from "@playwright/test";

const DIRECTIONS = {
  "A-slate-ember": {
    mode: "dark",
    vars: {
      "--background": "220 39% 9%", "--foreground": "220 30% 96%",
      "--card": "218 31% 14%", "--card-foreground": "220 33% 93%",
      "--popover": "218 31% 14%", "--popover-foreground": "220 33% 93%",
      "--primary": "14 100% 62%", "--primary-foreground": "0 0% 100%",
      "--secondary": "220 37% 12%", "--secondary-foreground": "220 15% 75%",
      "--muted": "220 37% 12%", "--muted-foreground": "220 12% 54%",
      "--accent": "14 100% 62%", "--accent-foreground": "0 0% 100%",
      "--border": "219 27% 19%", "--input": "219 27% 19%", "--ring": "14 100% 62%",
      "--sidebar-background": "220 41% 7%", "--sidebar-foreground": "220 12% 54%",
      "--sidebar-primary": "14 100% 62%", "--sidebar-primary-foreground": "0 0% 100%",
      "--sidebar-accent": "219 30% 13%", "--sidebar-accent-foreground": "220 33% 93%",
      "--sidebar-border": "219 27% 16%", "--sidebar-ring": "14 100% 62%",
      "--gold": "14 100% 62%", "--gold-dim": "14 60% 45%", "--gold-glow": "14 100% 62%",
      "--surface-1": "218 31% 14%", "--surface-2": "219 29% 16%", "--surface-3": "219 27% 19%",
      "--text-primary": "220 33% 93%", "--text-secondary": "220 14% 63%", "--text-tertiary": "220 12% 54%",
      "--chart-line": "14 100% 62%",
    },
  },
  "B-graphite-volt": {
    mode: "dark",
    vars: {
      "--background": "220 11% 5%", "--foreground": "210 12% 93%",
      "--card": "210 9% 9%", "--card-foreground": "210 12% 93%",
      "--popover": "210 9% 9%", "--popover-foreground": "210 12% 93%",
      "--primary": "74 87% 58%", "--primary-foreground": "66 75% 5%",
      "--secondary": "214 10% 14%", "--secondary-foreground": "210 8% 75%",
      "--muted": "214 10% 14%", "--muted-foreground": "216 4% 51%",
      "--accent": "74 87% 58%", "--accent-foreground": "66 75% 5%",
      "--border": "210 8% 15%", "--input": "210 8% 15%", "--ring": "74 87% 58%",
      "--sidebar-background": "220 12% 4%", "--sidebar-foreground": "216 4% 51%",
      "--sidebar-primary": "74 87% 58%", "--sidebar-primary-foreground": "66 75% 5%",
      "--sidebar-accent": "212 9% 12%", "--sidebar-accent-foreground": "210 12% 93%",
      "--sidebar-border": "210 8% 13%", "--sidebar-ring": "74 87% 58%",
      "--gold": "74 87% 58%", "--gold-dim": "74 50% 40%", "--gold-glow": "74 87% 58%",
      "--surface-1": "210 9% 9%", "--surface-2": "212 9% 11%", "--surface-3": "210 8% 15%",
      "--text-primary": "210 12% 93%", "--text-secondary": "213 6% 63%", "--text-tertiary": "216 4% 51%",
      "--chart-line": "74 87% 58%",
    },
  },
  "C-porcelain": {
    mode: "light",
    vars: {
      "--background": "220 16% 96%", "--foreground": "223 13% 10%",
      "--card": "0 0% 100%", "--card-foreground": "223 13% 10%",
      "--popover": "0 0% 100%", "--popover-foreground": "223 13% 10%",
      "--primary": "7 80% 55%", "--primary-foreground": "0 0% 100%",
      "--secondary": "220 19% 92%", "--secondary-foreground": "223 10% 35%",
      "--muted": "220 19% 92%", "--muted-foreground": "222 6% 55%",
      "--accent": "7 80% 55%", "--accent-foreground": "0 0% 100%",
      "--border": "223 14% 90%", "--input": "223 14% 90%", "--ring": "7 80% 55%",
      "--sidebar-background": "220 18% 94%", "--sidebar-foreground": "222 6% 55%",
      "--sidebar-primary": "7 80% 55%", "--sidebar-primary-foreground": "0 0% 100%",
      "--sidebar-accent": "220 17% 90%", "--sidebar-accent-foreground": "223 13% 10%",
      "--sidebar-border": "223 14% 88%", "--sidebar-ring": "7 80% 55%",
      "--gold": "7 80% 55%", "--gold-dim": "7 50% 42%", "--gold-glow": "7 80% 55%",
      "--surface-1": "0 0% 100%", "--surface-2": "220 19% 94%", "--surface-3": "220 17% 90%",
      "--text-primary": "223 13% 10%", "--text-secondary": "222 8% 40%", "--text-tertiary": "222 6% 55%",
      "--chart-line": "7 80% 55%",
    },
  },
  "D-deep-forest": {
    mode: "dark",
    vars: {
      "--background": "146 25% 6%", "--foreground": "85 16% 92%",
      "--card": "140 19% 9%", "--card-foreground": "85 16% 92%",
      "--popover": "140 19% 9%", "--popover-foreground": "85 16% 92%",
      "--primary": "84 52% 58%", "--primary-foreground": "88 41% 7%",
      "--secondary": "142 17% 12%", "--secondary-foreground": "90 10% 75%",
      "--muted": "142 17% 12%", "--muted-foreground": "129 5% 51%",
      "--accent": "84 52% 58%", "--accent-foreground": "88 41% 7%",
      "--border": "135 16% 15%", "--input": "135 16% 15%", "--ring": "84 52% 58%",
      "--sidebar-background": "148 27% 4%", "--sidebar-foreground": "129 5% 51%",
      "--sidebar-primary": "84 52% 58%", "--sidebar-primary-foreground": "88 41% 7%",
      "--sidebar-accent": "141 18% 11%", "--sidebar-accent-foreground": "85 16% 92%",
      "--sidebar-border": "135 16% 13%", "--sidebar-ring": "84 52% 58%",
      "--gold": "84 52% 58%", "--gold-dim": "84 35% 42%", "--gold-glow": "84 52% 58%",
      "--surface-1": "140 19% 9%", "--surface-2": "141 18% 11%", "--surface-3": "135 16% 15%",
      "--text-primary": "85 16% 92%", "--text-secondary": "97 8% 63%", "--text-tertiary": "129 5% 51%",
      "--chart-line": "84 52% 58%",
    },
  },
};

const PAGES = [
  ["dashboard", "http://localhost:8085/dashboard"],
  ["workouts", "http://localhost:8085/workouts"],
];
const OUT = process.argv[2] ?? ".";

const browser = await chromium.launch();
for (const [key, dir] of Object.entries(DIRECTIONS)) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true, hasTouch: true,
    colorScheme: dir.mode === "dark" ? "dark" : "light",
  });
  await context.addInitScript((mode) => {
    localStorage.setItem("liftos-theme", mode);
  }, dir.mode);
  const page = await context.newPage();
  const css =
    `:root, .dark { ${Object.entries(dir.vars).map(([k, v]) => `${k}: ${v} !important;`).join(" ")} }`;
  for (const [name, url] of PAGES) {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.addStyleTag({ content: css });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${key}--${name}.png` });
  }
  await context.close();
}
await browser.close();
console.log("done");
