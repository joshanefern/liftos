import { chromium } from "playwright";

const BASE = "http://localhost:8085";
const out = (o) => console.log(JSON.stringify(o));

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  colorScheme: "light",
});
const page = await ctx.newPage();

// theme before load
await page.addInitScript(() => {
  try { localStorage.setItem("liftos-theme", "light"); } catch {}
});

async function inspect(route) {
  await page.goto(BASE + route, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  const data = await page.evaluate(() => {
    const nav = document.querySelector("nav.fixed"); // mobile tab bar
    const sidebar = document.querySelector("aside");
    const vis = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { display: cs.display, w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
    };
    const tabs = nav
      ? [...nav.querySelectorAll("a")].map((a) => {
          const label = a.textContent.trim() || "(icon-only)";
          const cs = getComputedStyle(a);
          return {
            label,
            href: a.getAttribute("href"),
            ariaCurrent: a.getAttribute("aria-current"),
            color: cs.color,
          };
        })
      : null;
    const calLinks = [...document.querySelectorAll('a[href="/calendar"]')].map((a) => {
      const r = a.getBoundingClientRect();
      const cs = getComputedStyle(a);
      // visible = has box AND no hidden ancestor
      let el = a, hidden = false;
      while (el) { if (getComputedStyle(el).display === "none") { hidden = true; break; } el = el.parentElement; }
      return { visible: !hidden && r.width > 0 && r.height > 0, w: Math.round(r.width) };
    });
    // any back-affordance in top 120px?
    const backish = [...document.querySelectorAll("a,button")].filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.top > 120 || r.width === 0) return false;
      const t = (el.textContent + " " + (el.getAttribute("aria-label") || "")).toLowerCase();
      return /back|close|←|chevron|arrow-left/.test(t) || el.querySelector("svg.lucide-arrow-left, svg.lucide-chevron-left, svg.lucide-x");
    }).map((el) => el.textContent.trim().slice(0, 30));
    const h1 = document.querySelector("h1")?.textContent?.trim().slice(0, 60) || null;
    return {
      url: location.pathname,
      h1,
      tabBar: vis(nav),
      sidebar: vis(sidebar),
      tabs,
      calendarLinksVisible: calLinks,
      backAffordances: backish,
      scrollHeight: document.documentElement.scrollHeight,
    };
  });
  out({ route, ...data });
  return data;
}

// need auth? try dashboard first
const d = await inspect("/dashboard");
if (d.url.includes("sign-in") || d.h1?.toLowerCase().includes("sign")) {
  out({ note: "redirected to sign-in; fixture auth not active", landedOn: d.url });
}

await inspect("/workouts");
await inspect("/workouts/active");
await inspect("/calendar");
await inspect("/progress");
await inspect("/coach");
await inspect("/workouts/review/some-fake-id");
await inspect("/");

await browser.close();
