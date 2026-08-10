// Contrast audit: computes WCAG contrast for every visible text node on each route.
// Walks ancestors for composited backgrounds, handles alpha + opacity, checks
// placeholders and disabled states. DELETE after run.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8085';
const ROUTES = ['/', '/signin', '/create-account', '/onboarding', '/dashboard',
  '/workouts', '/workouts/active', '/calendar', '/progress', '/coach'];

const auditPage = () => {
  const parseColor = (str) => {
    if (!str) return { r: 0, g: 0, b: 0, a: 0 };
    const m = str.match(/rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[,/ ]+([\d.]+%?))?\)/);
    if (!m) return { r: 0, g: 0, b: 0, a: 0 };
    let a = m[4] === undefined ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
    return { r: +m[1], g: +m[2], b: +m[3], a };
  };
  const over = (fg, bg) => {
    // composite fg over bg (bg assumed opaque)
    const a = fg.a;
    return {
      r: fg.r * a + bg.r * (1 - a),
      g: fg.g * a + bg.g * (1 - a),
      b: fg.b * a + bg.b * (1 - a),
      a: 1,
    };
  };
  const lum = (c) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const hex = (c) =>
    '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

  // Returns { bg, gradient, opacityBelowBg } — composited opaque background
  // behind `el`, walking ancestors; collects semi-transparent layers.
  const compositedBg = (el) => {
    const layers = []; // top-most first
    let gradient = false;
    let node = el;
    while (node && node.nodeType === 1) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') gradient = true;
      const bg = parseColor(cs.backgroundColor);
      const op = parseFloat(cs.opacity);
      if (bg.a > 0) layers.push({ ...bg, a: bg.a * (op < 1 ? op : 1) });
      if (bg.a * (op < 1 ? op : 1) >= 1) break;
      node = node.parentElement;
    }
    // base: canvas color (html/body) or white/dark fallback
    let base = { r: 255, g: 255, b: 255, a: 1 };
    const htmlBg = parseColor(getComputedStyle(document.documentElement).backgroundColor);
    const bodyBg = parseColor(getComputedStyle(document.body).backgroundColor);
    if (bodyBg.a > 0) base = over(bodyBg, htmlBg.a > 0 ? over(htmlBg, base) : base);
    else if (htmlBg.a > 0) base = over(htmlBg, base);
    let bg = base;
    for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);
    return { bg, gradient };
  };

  const cumulativeOpacity = (el) => {
    let o = 1, node = el;
    while (node && node.nodeType === 1) {
      o *= parseFloat(getComputedStyle(node).opacity);
      node = node.parentElement;
    }
    return o;
  };

  const isVisible = (el, rect) => {
    if (!rect || rect.width < 1 || rect.height < 1) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility !== 'visible' || cs.display === 'none') return false;
    if (parseFloat(cs.opacity) === 0) return false;
    // off-viewport (below fold is fine — count it; but fully offscreen left/top hidden overflow skip)
    if (rect.bottom < 0 || rect.right < 0) return false;
    return true;
  };

  const pathOf = (el) => {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 4) {
      let p = node.tagName.toLowerCase();
      if (node.id) p += '#' + node.id;
      else if (node.classList.length) p += '.' + [...node.classList].slice(0, 3).join('.');
      parts.unshift(p);
      node = node.parentElement;
    }
    return parts.join(' > ');
  };

  const results = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.nodeValue.trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  });
  const seen = new Set();
  let tn;
  while ((tn = walker.nextNode())) {
    const el = tn.parentElement;
    if (!el) continue;
    if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
    const range = document.createRange();
    range.selectNodeContents(tn);
    const rect = range.getBoundingClientRect();
    if (!isVisible(el, rect)) continue;

    const cs = getComputedStyle(el);
    const fontSize = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight) || 400;
    const large = fontSize >= 24 || (fontSize >= 18.66 && weight >= 700);
    const threshold = large ? 3 : 4.5;

    const { bg, gradient } = compositedBg(el);
    const rawFg = parseColor(cs.color);
    const opacity = cumulativeOpacity(el);
    const fg = over({ ...rawFg, a: rawFg.a * opacity }, bg);
    const r = ratio(fg, bg);

    const disabled =
      el.closest('[disabled], [aria-disabled="true"], .disabled') !== null;

    if (r < threshold) {
      const text = tn.nodeValue.trim().replace(/\s+/g, ' ').slice(0, 60);
      const key = pathOf(el) + '|' + hex(fg) + '|' + hex(bg) + '|' + text.slice(0, 25);
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        text,
        path: pathOf(el),
        fg: hex(fg),
        rawColor: cs.color,
        bg: hex(bg),
        ratio: Math.round(r * 100) / 100,
        threshold,
        fontSize,
        weight,
        gradient,
        disabled,
        opacity: Math.round(opacity * 100) / 100,
        y: Math.round(rect.top),
      });
    }
  }

  // Placeholders
  for (const inp of document.querySelectorAll('input[placeholder], textarea[placeholder]')) {
    const rect = inp.getBoundingClientRect();
    if (!isVisible(inp, rect)) continue;
    if (inp.value) continue; // placeholder not showing
    const pcs = getComputedStyle(inp, '::placeholder');
    const { bg, gradient } = compositedBg(inp);
    const rawFg = parseColor(pcs.color);
    const opacity = cumulativeOpacity(inp) * (parseFloat(pcs.opacity) || 1);
    const fg = over({ ...rawFg, a: rawFg.a * opacity }, bg);
    const r = ratio(fg, bg);
    if (r < 4.5) {
      results.push({
        text: '[placeholder] ' + inp.getAttribute('placeholder').slice(0, 40),
        path: pathOf(inp),
        fg: hex(fg),
        rawColor: pcs.color,
        bg: hex(bg),
        ratio: Math.round(r * 100) / 100,
        threshold: 4.5,
        fontSize: parseFloat(pcs.fontSize),
        weight: parseInt(pcs.fontWeight) || 400,
        gradient,
        disabled: inp.disabled,
        placeholder: true,
        y: Math.round(rect.top),
      });
    }
  }
  return results;
};

const run = async (theme) => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: theme,
  });
  await ctx.addInitScript((t) => {
    try { localStorage.setItem('liftos-theme', t); } catch {}
  }, theme);
  const page = await ctx.newPage();
  const out = {};
  for (const route of ROUTES) {
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 20000 });
    } catch (e) {
      try { await page.goto(BASE + route, { waitUntil: 'load', timeout: 20000 }); } catch (e2) {
        out[route] = { error: String(e2).slice(0, 120) }; continue;
      }
    }
    await page.waitForTimeout(1200);
    // scroll to bottom and back to trigger any lazy content
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(400);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    const finalUrl = page.url().replace(BASE, '') || '/';
    const findings = await page.evaluate(auditPage);
    out[route] = { finalUrl, count: findings.length, findings };
  }
  await browser.close();
  return out;
};

const dark = await run('dark');
const light = await run('light');
console.log(JSON.stringify({ dark, light }, null, 1));
