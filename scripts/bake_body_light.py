#!/usr/bin/env python3
"""Bake ambient occlusion + a studio key light into the LiftOS body-figure
base webps (src/assets/body/*-base.webp).

One-time asset job (treatment 1 of the muscle-figure upgrade):
  * local-contrast / AO pass  — crevices between muscle groups darken
  * soft top-left key light   — directional multiply across the figure
  * fake specular             — muscle bellies lift toward white
  * global contrast stretch   — widens the sculpt's flat luminance range

Geometry never moves: pixels are recolored in place only. The flat backdrop
is rewritten to the exact corner color so BodyHeatMap.parseFigure's flood
fill (BG_FLOOD_TOLERANCE = 14) keeps keying it out after the lossy webp
round-trip, and figure pixels are never allowed to drift into that
tolerance band.

Idempotent: originals are copied to src/assets/body/originals/ on first run
and every run re-bakes FROM the originals, so tuning reruns never compound.

The *-ids*.png mask files are never touched.
"""

from __future__ import annotations

import shutil
from pathlib import Path

import numpy as np
from PIL import Image

ASSETS = Path(__file__).resolve().parent.parent / "src" / "assets" / "body"
ORIGINALS = ASSETS / "originals"

# Must match BodyHeatMap.parseFigure.
BG_FLOOD_TOLERANCE = 14

# ── Tunables ────────────────────────────────────────────────────
AO_RADIUS = 9  # px neighborhood for crevice detection
AO_DEPTH = 34  # luminance deficit (counts) that maps to full AO
AO_STRENGTH = 0.38  # max multiply-darken inside crevices
DETAIL_RADIUS = 3  # px small-scale local contrast (striations)
DETAIL_GAIN = 0.55  # unsharp gain on that small-scale detail
SPEC_DEPTH = 26  # luminance excess (counts) that maps to full specular
SPEC_STRENGTH = 0.30  # screen-toward-white on muscle bellies
KEY_STRENGTH = 0.10  # ± multiply across the figure bbox (top-left key)
KEY_DIR = (0.42, 0.91)  # light axis: mostly from above, slightly from left
CONTRAST = 1.10  # global stretch about the figure's mean luminance
EDGE_SAFE_DIST = 48  # L1 distance to backdrop under which brightening fades
BG_MARGIN = 26  # figure pixels may never land closer than this to the bg
# q80 rings the flat backdrop past parseFigure's flood tolerance (~600 px of
# themed dust per figure); q90 cuts that ~9x while keeping sizes in the same
# 14-20kB family as the originals.
WEBP_QUALITY = 90

LUMA = np.array([0.2126, 0.7152, 0.0722])


def box_blur_1d(arr: np.ndarray, radius: int, axis: int) -> np.ndarray:
    """Box blur along one axis via cumulative sums (edge-clamped)."""
    if radius <= 0:
        return arr
    n = arr.shape[axis]
    idx = np.arange(n)
    lo = np.clip(idx - radius, 0, n - 1)
    hi = np.clip(idx + radius, 0, n - 1)
    csum = np.cumsum(arr, axis=axis)
    csum = np.concatenate([np.zeros_like(np.take(csum, [0], axis=axis)), csum], axis=axis)
    total = np.take(csum, hi + 1, axis=axis) - np.take(csum, lo, axis=axis)
    return total / (hi - lo + 1).reshape([-1 if a == axis else 1 for a in range(arr.ndim)])


def blur(arr: np.ndarray, radius: int) -> np.ndarray:
    """Approximate gaussian: three box passes per axis."""
    out = arr
    for _ in range(3):
        out = box_blur_1d(out, radius, 0)
        out = box_blur_1d(out, radius, 1)
    return out


def flood_backdrop(near: np.ndarray) -> np.ndarray:
    """Connected component of near-backdrop pixels reachable from the border
    (iterative dilation — mirrors parseFigure's flood fill)."""
    h, w = near.shape
    bg = np.zeros_like(near)
    bg[0, :] = near[0, :]
    bg[-1, :] = near[-1, :]
    bg[:, 0] = near[:, 0]
    bg[:, -1] = near[:, -1]
    while True:
        grown = bg.copy()
        grown[1:, :] |= bg[:-1, :]
        grown[:-1, :] |= bg[1:, :]
        grown[:, 1:] |= bg[:, :-1]
        grown[:, :-1] |= bg[:, 1:]
        grown &= near
        if np.array_equal(grown, bg):
            return bg
        bg = grown


def masked_blur(lum: np.ndarray, mask: np.ndarray, radius: int) -> np.ndarray:
    """Gaussian-ish blur normalized over the figure mask so the bright
    backdrop never bleeds halos across the silhouette."""
    m = mask.astype(np.float64)
    num = blur(lum * m, radius)
    den = np.maximum(blur(m, radius), 1e-6)
    return num / den


def bake(src: Path, dst: Path) -> None:
    im = Image.open(src).convert("RGB")
    arr = np.asarray(im, dtype=np.float64)
    h, w, _ = arr.shape

    bg_color = arr[0, 0].copy()
    dist = np.abs(arr - bg_color).sum(axis=2)
    near = dist <= BG_FLOOD_TOLERANCE
    bg = flood_backdrop(near)
    fig = ~bg

    lum = arr @ LUMA
    big = masked_blur(lum, fig, AO_RADIUS)
    small = masked_blur(lum, fig, DETAIL_RADIUS)

    # Global contrast stretch about the figure's mean luminance.
    mean = lum[fig].mean()
    out = mean + (arr - mean) * CONTRAST

    # AO: pixels darker than their neighborhood are crevices — deepen them.
    crevice = np.clip((big - lum) / AO_DEPTH, 0.0, 1.0) ** 1.2
    ao_f = 1.0 - AO_STRENGTH * crevice

    # Key light: soft directional multiply across the figure bounding box.
    ys, xs = np.nonzero(fig)
    y0, y1 = ys.min(), ys.max()
    x0, x1 = xs.min(), xs.max()
    ny = (np.arange(h)[:, None] - y0) / max(y1 - y0, 1)
    nx = (np.arange(w)[None, :] - x0) / max(x1 - x0, 1)
    g = (nx * KEY_DIR[0] + ny * KEY_DIR[1]) / (KEY_DIR[0] + KEY_DIR[1])
    key_f = 1.0 + KEY_STRENGTH * (1.0 - 2.0 * np.clip(g, 0.0, 1.0))

    # Small-scale unsharp on luminance (striations pop, hue preserved).
    detail_f = (lum + DETAIL_GAIN * (lum - small)) / np.maximum(lum, 1.0)

    mult = (ao_f * key_f * detail_f)[:, :, None]
    out = out * mult

    # Fake specular: bellies (brighter than neighborhood) screen toward white.
    belly = np.clip((lum - big) / SPEC_DEPTH, 0.0, 1.0)
    out = out + (255.0 - out) * (SPEC_STRENGTH * belly)[:, :, None]

    # Edge safety: fade the WHOLE effect across the antialias band next to
    # the backdrop. Sharpening that band raises silhouette contrast, and the
    # webp encoder then rings the flat backdrop beyond the flood tolerance —
    # which parseFigure would pick up as speckle around the figure.
    safe = np.clip((dist - BG_FLOOD_TOLERANCE) / EDGE_SAFE_DIST, 0.0, 1.0)[:, :, None]
    out = arr + (out - arr) * safe

    out = np.clip(out, 0.0, 255.0)

    # Belt and suspenders: any figure pixel that ended up near-backdrop
    # reverts to its original color (keeps the silhouette intact).
    out_dist = np.abs(out - bg_color).sum(axis=2)
    revert = fig & (out_dist < BG_MARGIN)
    out[revert] = arr[revert]

    # Backdrop: exactly uniform (the webp encoder re-adds a small wobble,
    # well inside the flood tolerance).
    out[bg] = bg_color

    result = Image.fromarray(out.astype(np.uint8), "RGB")
    result.save(dst, format="WEBP", quality=WEBP_QUALITY, method=6)

    lum_out = out @ LUMA
    print(
        f"  {dst.name}: figure lum p5..p95 "
        f"{np.percentile(lum[fig], 5):.0f}..{np.percentile(lum[fig], 95):.0f} -> "
        f"{np.percentile(lum_out[fig], 5):.0f}..{np.percentile(lum_out[fig], 95):.0f}, "
        f"{src.stat().st_size / 1024:.1f}kB -> {dst.stat().st_size / 1024:.1f}kB, "
        f"reverted {int(revert.sum())} px"
    )


def main() -> None:
    ORIGINALS.mkdir(exist_ok=True)
    bases = sorted(ASSETS.glob("*-base.webp"))
    if not bases:
        raise SystemExit(f"no *-base.webp found in {ASSETS}")
    print(f"baking {len(bases)} figures (AO {AO_STRENGTH}, key {KEY_STRENGTH}, spec {SPEC_STRENGTH})")
    for path in bases:
        backup = ORIGINALS / path.name
        if not backup.exists():
            shutil.copy2(path, backup)  # first run: preserve the original
        bake(backup, path)  # always bake FROM the original — idempotent


if __name__ == "__main__":
    main()
