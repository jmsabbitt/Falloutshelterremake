#!/usr/bin/env python3
"""Sprite pipeline: raw generated sprite sheets -> game-ready, recolourable sprites.

    npm run sprites            (or: python3 tools/sprites/build.py)

For every character folder in art/raw/<id>/ with a sprite.json, each animation's
sheet (green-screen background, frames in rows) is:

  1. chroma-keyed (green removed, green spill cleaned off the edges)
  2. cut into frames (frames are found automatically; no grid needed)
  3. aligned: feet on a shared baseline, body centred on the torso, and each
     animation scaled so the character stands the same height in all of them
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
import shutil
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


def chroma_key(img: Image.Image, background: str = "green") -> np.ndarray:
    a = np.array(img.convert("RGB")).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    if background == "none":  # opaque art (room walls): keep every pixel
        return np.dstack([r, g, b, np.full_like(r, 255)]).astype(np.uint8)
    if background == "corner":
        # Key out whatever flat colour the top-left corner is (for off-shade backgrounds).
        bg = a[:8, :8].reshape(-1, 3).mean(axis=0)
        dist = np.sqrt(((a - bg) ** 2).sum(axis=-1))
        alpha = np.clip((dist - 40) / 50.0, 0, 1)
        return np.dstack([r, g, b, alpha * 255]).clip(0, 255).astype(np.uint8)
    if background == "magenta":
        # For art with green in it (glowing creatures): key out #FF00FF instead.
        dom = np.minimum(r, b) - g
        alpha = np.clip((140 - dom) / 60.0, 0, 1)
        spill = np.clip(np.minimum(r, b) - np.maximum(g, 0) - 20, 0, None) * 0.6 * (dom > 0)
        return np.dstack([r - spill, g, b - spill, alpha * 255]).clip(0, 255).astype(np.uint8)
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


def box_frame(rgba: np.ndarray) -> np.ndarray:
    """Everything sizeable in a cut-out box, trimmed to its bounds."""
    from scipy import ndimage

    mask = rgba[..., 3] > 128
    labels, n = ndimage.label(mask)
    if n == 0:
        return rgba
    areas = ndimage.sum(mask, labels, range(1, n + 1))
    keep = np.isin(labels, [i + 1 for i in range(n) if areas[i] >= max(areas) * 0.05])
    out = rgba.copy()
    out[..., 3] = np.where(keep, out[..., 3], 0)
    ys, xs = np.where(keep)
    return out[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]


def find_figures(rgba: np.ndarray, by_x: bool = False) -> list[np.ndarray]:
    """Frames as separate figures (connected shapes), in reading order.

    For sheets where frames nearly touch (a rifle reaching toward the next
    figure, a fallen pose under a raised arm), so there is no clean gap to
    split on. Small specks join the nearest figure.
    """
    from scipy import ndimage

    mask = rgba[..., 3] > 128
    labels, n = ndimage.label(mask)
    boxes = ndimage.find_objects(labels)
    areas = ndimage.sum(mask, labels, range(1, n + 1))
    big = [i for i in range(n) if areas[i] >= max(areas) * 0.08]
    owner = {i: i for i in big}
    for i in range(n):
        # Dust (or a sliver left by "crop") is dropped; larger bits join a figure.
        if i in owner or areas[i] < max(areas) * 0.005:
            continue
        cy = (boxes[i][0].start + boxes[i][0].stop) / 2
        cx = (boxes[i][1].start + boxes[i][1].stop) / 2
        owner[i] = min(big, key=lambda j: abs(cx - (boxes[j][1].start + boxes[j][1].stop) / 2) + abs(cy - (boxes[j][0].start + boxes[j][0].stop) / 2))
    figs = []
    for j in big:
        members = [i for i in owner if owner[i] == j]
        y0 = min(boxes[i][0].start for i in members)
        y1 = max(boxes[i][0].stop for i in members)
        x0 = min(boxes[i][1].start for i in members)
        x1 = max(boxes[i][1].stop for i in members)
        keep = np.isin(labels[y0:y1, x0:x1], [i + 1 for i in members])
        f = rgba[y0:y1, x0:x1].copy()
        f[..., 3] = np.where(keep, f[..., 3], 0)
        figs.append((y1, x0, y1 - y0, f))
    if by_x:  # one row of things of different heights (icons): just left to right
        return [f for (_, _, _, f) in sorted(figs, key=lambda t: t[1])]
    # Reading order: group into rows by where the feet are (a lying figure
    # shares the ground line with the standing ones), then left to right.
    figs.sort(key=lambda t: t[0])
    rows: list[list] = []
    for fig in figs:
        if rows and abs(fig[0] - np.mean([r[0] for r in rows[-1]])) < max(r[2] for r in rows[-1]) * 0.5:
            rows[-1].append(fig)
        else:
            rows.append([fig])
    return [f for row in rows for (_, _, _, f) in sorted(row, key=lambda t: t[1])]


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
        # aboveFraction keeps hair to the head, so a gunmetal rifle isn't read as hair.
        "hair": op & (h >= ha["hue"][0]) & (h < ha["hue"][1]) & (v > ha["minVal"]) & (v < ha["maxVal"]) & (rows < ha.get("aboveFraction", 1.0)),
        "trim": op & warm & (s > tr["minSat"]) & (v > tr["minVal"]),
        "boots": op & warm & (rows > bo["belowFraction"]) & (v < bo["maxVal"]),
    }
    # maxSat keeps darker, richer browns (a leather backpack) out of the skin.
    m["skin"] = op & warm & ~m["trim"] & ~m["boots"] & (v > sk["minVal"]) & (s < sk.get("maxSat", 1.0))
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


def save_webp(img: Image.Image, path: Path) -> None:
    """Game images are lossy WebP (about a third the size of PNG); alpha stays lossless."""
    img.save(path, "WEBP", quality=90, method=4)


def body_x(frame: np.ndarray) -> float:
    """Horizontal centre of mass of a creature's silhouette."""
    cols = (frame[..., 3] > 128).sum(axis=0)
    return float((cols * np.arange(frame.shape[1])).sum() / max(1, cols.sum()))


def build_portraits(cid: str, cfg: dict, cut: dict[str, list[np.ndarray]], target: int) -> tuple[str, dict]:
    """"kind": "portrait": each frame saved on its own (for the interface), named by "names".

    "outDir" (default "portraits") and "prefix" (default "<id>_") place the
    files; "fit" scales each to fit a square that size instead of to
    targetHeight (for wide things like rifles).
    """
    out_dir = OUT / cfg.get("outDir", "portraits")
    prefix = cfg.get("prefix", f"{cid}_")
    out_dir.mkdir(parents=True, exist_ok=True)
    files = {}
    for name, frames in cut.items():
        names = cfg["anims"][name].get("names", [])
        for i, f in enumerate(frames):
            key = names[i] if i < len(names) else f"{name}{i}"
            img = Image.fromarray(f)
            k = cfg["fit"] / max(img.size) if "fit" in cfg else target / img.height
            img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
            fn = f"{prefix}{key}.webp"
            save_webp(img, out_dir / fn)
            files[key] = f"{out_dir.name}/{fn}"
    return ("portraits", {cid: files})


def build_character(folder: Path) -> tuple[str, dict] | None:
    cfg_path = folder / "sprite.json"
    if not cfg_path.exists():
        return None
    cfg = json.loads(cfg_path.read_text())
    cid = cfg.get("id", folder.name)
    rules = {**DEFAULT_REGIONS, **cfg.get("regions", {})}
    target = int(cfg.get("targetHeight", 128))
    ref_anim = cfg.get("referenceAnim", "walk")
    # "kind": "creature" sheets (enemies) aren't recoloured: one full-colour layer.
    creature = cfg.get("kind") == "creature"
    layers = [] if creature else LAYERS

    # Load and cut every animation first.
    cut: dict[str, list[np.ndarray]] = {}
    for name, a in cfg["anims"].items():
        sheet = Image.open(folder / a["file"])
        # "crop": [x0, y0, x1, y1] uses only part of the sheet (e.g. its first row).
        if "crop" in a:
            sheet = sheet.crop(tuple(a["crop"]))
        keyed = chroma_key(sheet, a.get("background", cfg.get("background", "green")))
        # A ground line drawn under the frames would join them all: clear rows
        # that are mostly covered but belong to no figure (a thin line).
        solid = (keyed[..., 3] > 128).mean(axis=1) > 0.5
        keyed[solid, 3] = 0
        # "split": "figures" cuts by connected shapes instead of by empty gaps.
        # "whole": true uses the (cropped) sheet as a single frame.
        if a.get("whole"):
            cut[name] = [keyed]
            print(f"  {cid}/{name}: whole image")
            continue
        # "boxes": [[x0, y0, x1, y1], ...] cuts one frame per box instead (for
        # sheets where the generator repeated or overlapped things); each frame
        # keeps every sizeable shape in its box, so a hat stays with its coat.
        if "boxes" in a:
            frames = [box_frame(keyed[y0:y1, x0:x1]) for x0, y0, x1, y1 in a["boxes"]]
            cut[name] = frames
            print(f"  {cid}/{name}: {len(frames)} frames")
            continue
        # "order": "x" reads figures strictly left to right.
        frames = find_figures(keyed, a.get("order") == "x") if a.get("split") == "figures" else find_frames(keyed)
        drop = set(a.get("drop", []))
        frames = [f for i, f in enumerate(frames) if i not in drop]
        # "take": n keeps the first n frames (e.g. only a sheet's first row).
        if "take" in a:
            frames = frames[: int(a["take"])]
        # "flip" mirrors frames (counted after dropping) that face the wrong way;
        # "mirror": true mirrors the whole sheet (creatures face left, toward the party).
        flip = set(range(len(frames))) if a.get("mirror") else set(a.get("flip", []))
        frames = [f[:, ::-1].copy() if i in flip else f for i, f in enumerate(frames)]
        if not frames:
            print(f"  ! {cid}/{name}: no frames found", file=sys.stderr)
            continue
        cut[name] = frames
        print(f"  {cid}/{name}: {len(frames)} frames")
    if not cut:
        return None
    if cfg.get("kind") == "portrait":
        return build_portraits(cid, cfg, cut, target)
    ref = cut.get(ref_anim) or next(iter(cut.values()))
    ref_scale = target / float(np.median([f.shape[0] for f in ref]))

    out_dir = OUT / cid
    shutil.rmtree(out_dir, ignore_errors=True)  # no stale strips from an older build
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = {"refHeight": target, "anims": {}} if creature else {"sex": cfg.get("sex"), "refHeight": target, "anims": {}}
    lineup = []
    for name, frames in cut.items():
        a = cfg["anims"][name]
        # Sheets come from separate generations at different sizes, so each
        # animation is scaled so its figure stands targetHeight tall:
        # "heightFrom" names a frame to measure for sheets whose figure doesn't
        # stand throughout (fallen); "fitHeight": false shares the reference scale.
        if "heightFrom" in a:
            scale = target / float(frames[int(a["heightFrom"])].shape[0])
        elif a.get("fitHeight", True):
            scale = target / float(np.median([f.shape[0] for f in frames]))
        else:
            scale = ref_scale
        # An animation can override the character's colour rules (e.g. the fight sheet's hair).
        anim_rules = {k: {**rules[k], **v} for k, v in a.get("regions", {}).items()}
        segs = [None if creature else segment(f, {**rules, **anim_rules}) for f in frames]
        anchors = [body_x(f) if creature else torso_x(f, m) for f, m in zip(frames, segs)]
        left = max(anc for anc in anchors)
        right = max(f.shape[1] - anc for f, anc in zip(frames, anchors))
        height = max(f.shape[0] for f in frames)
        cw, ch = int(np.ceil((left + right) * scale)) + 2, int(np.ceil(height * scale)) + 2
        strips = {k: Image.new("RGBA", (cw * len(frames), ch)) for k in layers + ["full"]}
        for i, (f, m, anc) in enumerate(zip(frames, segs, anchors)):
            parts = {} if creature else layer_strips(f, m)
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
            # Characters only load the tint layers; their full-colour strip is for previews.
            if k == "full" and not creature:
                continue
            fn = f"{name}_{k}.webp"
            save_webp(img, out_dir / fn)
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
        if creature:
            sheet = Image.new("RGBA", strips["full"].size, (233, 217, 182, 255))
            sheet.alpha_composite(strips["full"])
            PREVIEWS.mkdir(parents=True, exist_ok=True)
            sheet.save(PREVIEWS / f"{cid}_{name}.png")
        else:
            preview(cid, name, strips, cw, ch, len(frames))
        lineup.append((strips["full"], cw, ch, manifest["anims"][name]["anchorX"]))
    # Line-up: frame 0 of every animation on one ground line, to check they match in size.
    bg = (233, 217, 182, 255)
    sheet = Image.new("RGBA", (sum(cw for _, cw, _, _ in lineup) + 8 * len(lineup), max(ch for _, _, ch, _ in lineup)), bg)
    x = 0
    for strip, cw, ch, _ in lineup:
        sheet.alpha_composite(strip.crop((0, 0, cw, ch)), (x, sheet.height - ch))
        x += cw + 8
    sheet.save(PREVIEWS / f"{cid}_lineup.png")
    return ("creatures" if creature else "characters", {cid: manifest})


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
    manifest: dict = {"version": 1, "characters": {}, "creatures": {}, "portraits": {}}
    for folder in sorted(p for p in RAW.iterdir() if p.is_dir()):
        built = build_character(folder)
        if built:
            manifest[built[0]].update(built[1])
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {OUT / 'manifest.json'} ({len(manifest['characters'])} character(s), {len(manifest['creatures'])} creature(s))")
    return 0


if __name__ == "__main__":
    sys.exit(main())
