// Spacing & layout audit — measured via Playwright. READ-ONLY on the app.
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'http://localhost:8085';
const ROUTES = ['/', '/signin', '/create-account', '/onboarding', '/dashboard', '/workouts', '/workouts/active', '/calendar', '/progress', '/coach'];
const THEMES = ['light', 'dark'];

const collect = () => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const short = (el) => {
    if (!el || el === document.documentElement) return 'html';
    const cls = (typeof el.className === 'string' ? el.className : '').split(/\s+/).filter(Boolean).slice(0, 4).join('.');
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
  };
  const vis = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const out = { url: location.pathname, vw, vh };

  // (3) horizontal overflow
  const se = document.scrollingElement;
  out.overflow = { scrollWidth: se.scrollWidth, innerWidth: vw };
  out.wideEls = [];
  if (se.scrollWidth > vw + 1) {
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if ((r.right > vw + 1 || r.left < -1) && vis(el) && r.width < se.scrollWidth * 2) {
        out.wideEls.push({ sel: short(el), left: +r.left.toFixed(1), right: +r.right.toFixed(1), w: +r.width.toFixed(1) });
        if (out.wideEls.length >= 12) break;
      }
    }
  }

  // (1) content-block left edges (card-ish blocks: rounded or bg'd, decent size, not full-bleed fixed chrome)
  const edges = {};
  const nav = document.querySelector('nav.fixed');
  for (const el of document.querySelectorAll('main *, [class*="min-h-screen"] *')) {
    if (nav && nav.contains(el)) continue;
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 150 || r.width > vw || r.height < 36) continue;
    const s = getComputedStyle(el);
    const cardish = parseFloat(s.borderTopLeftRadius) >= 8 || (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent');
    if (!cardish) continue;
    const L = Math.round(r.left), R = Math.round(vw - r.right);
    const key = L + '|' + R;
    (edges[key] = edges[key] || { left: L, rightGap: R, n: 0, ex: short(el), w: Math.round(r.width) }).n++;
  }
  out.edges = Object.values(edges).sort((a, b) => b.n - a.n).slice(0, 10);

  // (2) vertical rhythm: gaps between stacked sibling blocks
  out.gaps = [];
  const seen = new Set();
  for (const parent of document.querySelectorAll('main, main *, [class*="min-h-screen"]')) {
    if (nav && nav.contains(parent)) continue;
    const kids = [...parent.children].filter((k) => vis(k) && k.getBoundingClientRect().height > 36 && k.getBoundingClientRect().width > 200);
    if (kids.length < 2) continue;
    for (let i = 1; i < kids.length; i++) {
      const a = kids[i - 1].getBoundingClientRect(), b = kids[i].getBoundingClientRect();
      const gap = +(b.top - a.bottom).toFixed(1);
      if (gap < 0) continue; // overlapping/absolute layouts — not stacked flow
      const key = short(parent) + '#' + i;
      if (seen.has(key)) continue;
      seen.add(key);
      out.gaps.push({ parent: short(parent), above: short(kids[i - 1]), below: short(kids[i]), gap });
    }
  }

  // (4) clipped text (leaf text nodes, no intended truncation)
  out.clipped = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length > 0) continue;
    const t = (el.textContent || '').trim();
    if (!t) continue;
    if (!vis(el)) continue;
    if (el.scrollWidth <= el.clientWidth + 1 || el.clientWidth === 0) continue;
    const s = getComputedStyle(el);
    const cls = typeof el.className === 'string' ? el.className : '';
    const intended = /truncate|line-clamp|ellipsis/.test(cls) || s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none';
    // only real clipping: an ancestor actually hides the excess
    let hides = false, p = el;
    while (p && p !== document.body) { const ps = getComputedStyle(p); if (/(hidden|clip|auto|scroll)/.test(ps.overflowX)) { hides = ps.overflowX === 'hidden' || ps.overflowX === 'clip'; break; } p = p.parentElement; }
    if (!hides) continue;
    out.clipped.push({ sel: short(el), text: t.slice(0, 60), scrollW: el.scrollWidth, clientW: el.clientWidth, intended });
    if (out.clipped.length >= 15) break;
  }

  // (6) tab bar hit areas
  if (nav) {
    const nr = nav.getBoundingClientRect();
    const links = [...nav.querySelectorAll('a')];
    out.tabBar = {
      rect: { top: +nr.top.toFixed(1), height: +nr.height.toFixed(1) },
      links: links.map((a) => { const r = a.getBoundingClientRect(); return { label: (a.textContent || '').trim() || 'Log(+)', x: +r.left.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; }),
    };
    const circle = nav.querySelector('a span.rounded-full, a > span');
    if (circle) { const cr = circle.getBoundingClientRect(); out.tabBar.centerCircle = { top: +cr.top.toFixed(1), h: +cr.height.toFixed(1), raisedAboveNav: +(nr.top - cr.top).toFixed(1) }; }
  }
  return out;
};

// (5) after scrolling to bottom: bottom-most interactive element vs the fixed tab bar
const clearance = () => {
  const nav = document.querySelector('nav.fixed');
  const short = (el) => {
    const cls = (typeof el.className === 'string' ? el.className : '').split(/\s+/).filter(Boolean).slice(0, 4).join('.');
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
  };
  const interactives = [...document.querySelectorAll('a,button,input,textarea,select,[role="button"]')].filter((el) => {
    if (nav && nav.contains(el)) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  let bottomEl = null, max = -1;
  for (const el of interactives) { const r = el.getBoundingClientRect(); if (r.bottom > max) { max = r.bottom; bottomEl = el; } }
  const res = { navTop: nav ? +nav.getBoundingClientRect().top.toFixed(1) : null, scrolledToBottom: Math.abs(document.scrollingElement.scrollTop + window.innerHeight - document.scrollingElement.scrollHeight) < 2 };
  if (bottomEl && nav) {
    const r = bottomEl.getBoundingClientRect();
    res.bottomMost = { sel: short(bottomEl), text: (bottomEl.textContent || '').trim().slice(0, 40), bottom: +r.bottom.toFixed(1), overlapWithNav: +(r.bottom - nav.getBoundingClientRect().top).toFixed(1) };
  }
  return res;
};

const results = [];
const browser = await chromium.launch();
for (const theme of THEMES) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: theme });
  await ctx.addInitScript((t) => localStorage.setItem('liftos-theme', t), theme);
  const page = await ctx.newPage();
  for (const route of ROUTES) {
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(1400); // let entrance animations settle
      const data = await page.evaluate(collect);
      // scroll to bottom for clearance measurement
      await page.evaluate(() => { document.scrollingElement.scrollTop = document.scrollingElement.scrollHeight; const m = document.querySelector('main'); if (m) m.scrollTop = m.scrollHeight; });
      await page.waitForTimeout(400);
      data.clearance = await page.evaluate(clearance);
      data.finalUrl = page.url().replace(BASE, '');
      data.theme = theme;
      data.route = route;
      results.push(data);
    } catch (e) {
      results.push({ route, theme, error: String(e).slice(0, 200) });
    }
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync('/private/tmp/claude-501/-Users-joshanef-dev-Jarvis-OS/4912c796-fb3d-4495-b2f0-fb69a72186e0/scratchpad/spacing-audit.json', JSON.stringify(results, null, 1));
console.log('routes captured:', results.length);
