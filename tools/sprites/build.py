#!/usr/bin/env python3
"""Sprite pipeline: raw generated sprite sheets -> game-ready, recolourable sprites.

    npm run sprites            (or: python3 tools/sprites/build.py)

For every character folder in art/raw/<id>/ with a sprite.json, each animation's
sheet (green-screen background, frames in rows) is:

  1. chroma-keyed (green removed, green spill cleaned off the edges)
  2. cut into frames (frames are found automatically; no grid needed)
  3. aligned: feet on a shared baseline, body centred on the torso, one scale
     for the whole character so every animation matches
  4. split into tintable layers (base, skin, hair, suit, trim) by colour, so the
     game can recolour one sheet into any skin tone, hair colour and outfit
  5. written to public/sprites/<id>/<anim>_<layer>.png as horizontal strips,
     plus public/sprites/manifest.json, which the game loads at startup

A preview with example recolours is written to art/previews/<id>_<anim>.png.

Requirements: Python 3 with Pillow and numpy (pip install -r tools/sprites/requirements.txt).
See docs/design/art-spec.md for how to generate sheets that work with this.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "art" / "raw"
OUT = ROOT / "public" / "sprites"
PREVIEWS = ROOT / "art" / "previews"
APPEARANCE = json.loads((ROOT / "src" / "content" / "appearance.json").read_text())

LAYERS = ["base", "suit", "skin", "hair", "trim"]

# Colour rules for the reference palette every base character is generated in
# (teal jumpsuit, orange chest stripe, dark hair, light skin, brown boots).
# A character's sprite.json can override any of these under "regions".
DEFAULT_REGIONS = {
    "suit": {"hue": [150, 197], "minSat": 0.18, "minVal": 0.22},
    "hair": {"hue": [197, 260], "minVal": 0.12, "maxVal": 0.5},
    "trim": {"minSat": 0.66, "minVal": 0.75},
    "boots": {"belowFraction": 0.8, "maxVal": 0.7},
    "skin": {"minVal": 0.45},
}


def hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


# ----------------------------------------------------------------- keying


def chroma_key(img: Image.Image) -> np.ndarray:
    a = np.array(img.convert("RGB")).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    dom = g - np.maximum(r, b)
    alpha = np.clip((140 - dom) / 60.0, 0, 1)
    # dark-green floor shadows some generators add under the feet
    alpha[(dom > 40) & (g > r) & (g > b) & (r < 90) & (b < 90)] = 0
    # despill: pull residual green toward the other channels
    top = np.maximum(r, b)
    g2 = np.where(g > top, top + (g - top) * 0.25, g)
    return np.dstack([r, g2, b, alpha * 255]).clip(0, 255).astype(np.uint8)


def runs(profile: np.ndarray, min_len: int) -> list[tuple[int, int]]:
    out, inside, start = [], False, 0
    for i, c in enumerate(profile):
        if c > 3 and not inside:
            inside, start = True, i
        elif c <= 3 and inside:
            inside = False
            if i - start > min_len:
                out.append((start, i))
    if inside and len(profile) - start > min_len:
        out.append((start, len(profile)))
    return out


def find_frames(rgba: np.ndarray) -> list[np.ndarray]:
    """Frames in reading order (rows top to bottom, left to right)."""
    mask = rgba[..., 3] > 128
    frames = []
    for y0, y1 in runs(mask.sum(axis=1), 40):
        band = mask[y0:y1]
        for x0, x1 in runs(band.sum(axis=0), 30):
            sub = band[:, x0:x1]
            ys = np.where(sub.any(axis=1))[0]
            frames.append(rgba[y0 + ys[0] : y0 + ys[-1] + 1, x0:x1].copy())
    return frames


# ----------------------------------------------------------------- regions


def hsv(a: np.ndarray):
    rgb = a[..., :3].astype(float) / 255
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    nz = d > 1e-6
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    i = nz & (mx == r)
    h[i] = ((g - b)[i] / d[i]) % 6
    i = nz & (mx == g)
    h[i] = ((b - r)[i] / d[i]) + 2
    i = nz & (mx == b)
    h[i] = ((r - g)[i] / d[i]) + 4
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    return h * 60, s, mx


def neighbours(mask: np.ndarray) -> np.ndarray:
    n = np.zeros_like(mask)
    n[1:] |= mask[:-1]
    n[:-1] |= mask[1:]
    n[:, 1:] |= mask[:, :-1]
    n[:, :-1] |= mask[:, 1:]
    return n


def segment(frame: np.ndarray, rules: dict) -> dict[str, np.ndarray]:
    h, s, v = hsv(frame)
    op = frame[..., 3] > 10
    rows = np.arange(frame.shape[0])[:, None].repeat(frame.shape[1], 1) / max(1, frame.shape[0])
    warm = (h < 45) | (h > 340)
    su, ha, tr, bo, sk = (rules[k] for k in ("suit", "hair", "trim", "boots", "skin"))
    m = {
        "suit": op & (h >= su["hue"][0]) & (h < su["hue"][1]) & (s > su["minSat"]) & (v > su["minVal"]),
        "hair": op & (h >= ha["hue"][0]) & (h < ha["hue"][1]) & (v > ha["minVal"]) & (v < ha["maxVal"]),
        "trim": op & warm & (s > tr["minSat"]) & (v > tr["minVal"]),
        "boots": op & warm & (rows > bo["belowFraction"]) & (v < bo["maxVal"]),
    }
    m["skin"] = op & warm & ~m["trim"] & ~m["boots"] & (v > sk["minVal"])
    # The stripe's anti-aliased edge reads as skin; grow the stripe into it.
    for _ in range(2):
        grow = m["skin"] & neighbours(m["trim"]) & (s > 0.5)
        m["trim"] |= grow
        m["skin"] &= ~grow
    return m


def layer_strips(frame: np.ndarray, masks: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """Grey-shaded layers normalised so a tint colour becomes the region's highlight."""
    lum = 0.3 * frame[..., 0] + 0.59 * frame[..., 1] + 0.11 * frame[..., 2]
    out = {}
    used = np.zeros(frame.shape[:2], bool)
    for k in ("suit", "skin", "hair", "trim"):
        m = masks[k]
        used |= m
        ref = np.percentile(lum[m], 98) if m.any() else 255.0
        grey = np.clip(lum / max(ref, 1.0), 0, 1) * 255
        lay = np.zeros_like(frame)
        lay[..., 0] = lay[..., 1] = lay[..., 2] = grey
        lay[..., 3] = np.where(m, frame[..., 3], 0)
        out[k] = lay
    base = frame.copy()
    base[..., 3] = np.where(used, 0, frame[..., 3])
    out["base"] = base
    return out


# ----------------------------------------------------------------- building


def torso_x(frame: np.ndarray, masks: dict[str, np.ndarray]) -> float:
    """Horizontal centre of the jumpsuit (falls back to the whole silhouette)."""
    m = masks["suit"] if masks["suit"].sum() > 50 else frame[..., 3] > 128
    xs = np.where(m.any(axis=0))[0]
    cols = m.sum(axis=0)
    return float((cols * np.arange(m.shape[1])).sum() / max(1, cols.sum())) if xs.size else frame.shape[1] / 2


def build_character(folder: Path) -> dict | None:
    cfg_path = folder / "sprite.json"
    if not cfg_path.exists():
        return None
    cfg = json.loads(cfg_path.read_text())
    cid = cfg.get("id", folder.name)
    rules = {**DEFAULT_REGIONS, **cfg.get("regions", {})}
    target = int(cfg.get("targetHeight", 128))
    ref_anim = cfg.get("referenceAnim", "walk")

    # Load and cut every animation first, so all of them share one scale.
    cut: dict[str, list[np.ndarray]] = {}
    for name, a in cfg["anims"].items():
        frames = find_frames(chroma_key(Image.open(folder / a["file"])))
        drop = set(a.get("drop", []))
        frames = [f for i, f in enumerate(frames) if i not in drop]
        if not frames:
            print(f"  ! {cid}/{name}: no frames found", file=sys.stderr)
            continue
        cut[name] = frames
        print(f"  {cid}/{name}: {len(frames)} frames")
    if not cut:
        return None
    ref = cut.get(ref_anim) or next(iter(cut.values()))
    scale = target / float(np.median([f.shape[0] for f in ref]))

    out_dir = OUT / cid
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = {"sex": cfg.get("sex"), "refHeight": target, "anims": {}}
    for name, frames in cut.items():
        a = cfg["anims"][name]
        segs = [segment(f, rules) for f in frames]
        anchors = [torso_x(f, m) for f, m in zip(frames, segs)]
        left = max(anc for anc in anchors)
        right = max(f.shape[1] - anc for f, anc in zip(frames, anchors))
        height = max(f.shape[0] for f in frames)
        cw, ch = int(np.ceil((left + right) * scale)) + 2, int(np.ceil(height * scale)) + 2
        strips = {k: Image.new("RGBA", (cw * len(frames), ch)) for k in LAYERS + ["full"]}
        for i, (f, m, anc) in enumerate(zip(frames, segs, anchors)):
            parts = layer_strips(f, m)
            parts["full"] = f
            ox = left - anc  # place the torso at the shared anchor
            oy = height - f.shape[0]  # feet on the baseline
            for k, arr in parts.items():
                cell = Image.new("RGBA", (int(np.ceil(left + right)) + 1, height))
                cell.alpha_composite(Image.fromarray(arr), (int(round(ox)), oy))
                cell = cell.resize((cw, ch), Image.LANCZOS)
                strips[k].paste(cell, (i * cw, 0))
        files = {}
        for k, img in strips.items():
            fn = f"{name}_{k}.png"
            img.save(out_dir / fn, optimize=True)
            files[k] = f"{cid}/{fn}"
        manifest["anims"][name] = {
            "frames": len(frames),
            "fps": a.get("fps", 10),
            "loop": a.get("loop", True),
            # Frame to show when the character stands still (walk sheets double as idle).
            "idleFrame": min(int(a.get("idleFrame", 0)), len(frames) - 1),
            "frameW": cw,
            "frameH": ch,
            "anchorX": round((left * scale + 1) / cw, 4),
            "anchorY": 1.0,
            "files": files,
        }
        preview(cid, name, strips, cw, ch, len(frames))
    return {cid: manifest}


def preview(cid: str, anim: str, strips: dict[str, Image.Image], cw: int, ch: int, n: int) -> None:
    """Contact sheet: original frames, then a few recoloured looks of frame 0."""
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    looks = [
        ("default", APPEARANCE["skin"][0], APPEARANCE["hair"][0], APPEARANCE["suit"]["default"], APPEARANCE["trim"]["common"]),
        ("a", APPEARANCE["skin"][3], APPEARANCE["hair"][5], APPEARANCE["suit"]["brawn"], APPEARANCE["trim"]["rare"]),
        ("b", APPEARANCE["skin"][1], APPEARANCE["hair"][3], APPEARANCE["suit"]["sight"], APPEARANCE["trim"]["legendary"]),
        ("c", APPEARANCE["skin"][4], APPEARANCE["hair"][4], APPEARANCE["suit"]["charm"], APPEARANCE["trim"]["common"]),
        ("d", APPEARANCE["skin"][5], APPEARANCE["hair"][6], APPEARANCE["suit"]["grit"], APPEARANCE["trim"]["common"]),
    ]
    bg = (233, 217, 182, 255)
    sheet = Image.new("RGBA", (max(n, len(looks)) * cw, ch * 2 + 8), bg)
    sheet.alpha_composite(strips["full"], (0, 0))
    for j, (_, skin, hair, suit, trim) in enumerate(looks):
        cell = strips["base"].crop((0, 0, cw, ch))
        for k, col in (("suit", suit), ("skin", skin), ("hair", hair), ("trim", trim)):
            lay = np.array(strips[k].crop((0, 0, cw, ch))).astype(float)
            c = np.array(hex_rgb(col), float)
            lay[..., :3] = lay[..., :3] * c / 255
            cell.alpha_composite(Image.fromarray(lay.clip(0, 255).astype(np.uint8)))
        sheet.alpha_composite(cell, (j * cw, ch + 8))
    sheet.save(PREVIEWS / f"{cid}_{anim}.png")


def main() -> int:
    if not RAW.exists():
        print("no art/raw folder; nothing to build")
        return 0
    characters: dict = {}
    for folder in sorted(p for p in RAW.iterdir() if p.is_dir()):
        built = build_character(folder)
        if built:
            characters.update(built)
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {"version": 1, "characters": characters}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {OUT / 'manifest.json'} ({len(characters)} character(s))")
    return 0


if __name__ == "__main__":
    sys.exit(main())
