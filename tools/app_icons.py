#!/usr/bin/env python3
"""App icon and splash from the painted art (docs/art/ART-LIST.md X2).

Sources: art/raw/app/icon.png (1024 px, full bleed) and art/raw/app/splash.png
(square, the centre third safe). Writes:

- public/icons/: icon-192, icon-512, maskable-512, apple-touch-icon (180), favicon (64)
- Android launcher icons (legacy square, round, adaptive foreground and background)
  in every mipmap density, and the launch splash in every drawable density and
  orientation (centre-cropped to each size, JPEG to keep the APK small; the night
  variants are dropped, since the painting is the same by day and by night)
- the iOS app icon and the launch image set (1x, 2x, 3x JPEG, one appearance)

Run from the repo root: python3 tools/app_icons.py
"""

import json
import os
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ICON = Image.open(ROOT / 'art/raw/app/icon.png').convert('RGB')
SPLASH = Image.open(ROOT / 'art/raw/app/splash.png').convert('RGB')
BG = (0x1B, 0x2A, 0x2F)


def sized(img: Image.Image, w: int, h: int) -> Image.Image:
    """Centre-crop to the w:h aspect, then scale to w x h."""
    sw, sh = img.size
    scale = max(w / sw, h / sh)
    cw, ch = round(w / scale), round(h / scale)
    left, top = (sw - cw) // 2, (sh - ch) // 2
    return img.crop((left, top, left + cw, top + ch)).resize((w, h), Image.LANCZOS)


def masked(img: Image.Image, radius: float | None) -> Image.Image:
    """A copy with transparent corners: a rounded square, or a circle when radius is None."""
    w, h = img.size
    scale = 4
    mask = Image.new('L', (w * scale, h * scale), 0)
    d = ImageDraw.Draw(mask)
    if radius is None:
        d.ellipse((0, 0, w * scale - 1, h * scale - 1), fill=255)
    else:
        d.rounded_rectangle((0, 0, w * scale - 1, h * scale - 1), radius=radius * w * scale, fill=255)
    out = img.convert('RGBA')
    out.putalpha(mask.resize((w, h), Image.LANCZOS))
    return out


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, 'PNG', optimize=True)


def web() -> None:
    icons = ROOT / 'public/icons'
    save_png(sized(ICON, 192, 192), icons / 'icon-192.png')
    save_png(sized(ICON, 512, 512), icons / 'icon-512.png')
    # Full bleed already, and the door sits well inside the maskable safe circle.
    save_png(sized(ICON, 512, 512), icons / 'maskable-512.png')
    save_png(sized(ICON, 180, 180), icons / 'apple-touch-icon.png')
    save_png(masked(sized(ICON, 64, 64), 0.18), icons / 'favicon-64.png')


ANDROID_ICON = {'ldpi': 36, 'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
ANDROID_SPLASH = {
    'drawable': (320, 480),
    'drawable-port-ldpi': (240, 320),
    'drawable-port-mdpi': (320, 480),
    'drawable-port-hdpi': (480, 800),
    'drawable-port-xhdpi': (720, 1280),
    'drawable-port-xxhdpi': (960, 1600),
    'drawable-port-xxxhdpi': (1280, 1920),
    'drawable-land-ldpi': (320, 240),
    'drawable-land-mdpi': (480, 320),
    'drawable-land-hdpi': (800, 480),
    'drawable-land-xhdpi': (1280, 720),
    'drawable-land-xxhdpi': (1600, 960),
    'drawable-land-xxxhdpi': (1920, 1280),
}


def android() -> None:
    res = ROOT / 'android/app/src/main/res'
    if not res.exists():
        return
    for density, px in ANDROID_ICON.items():
        folder = res / f'mipmap-{density}'
        square = sized(ICON, px, px)
        save_png(masked(square, 0.16), folder / 'ic_launcher.png')
        save_png(masked(square, None), folder / 'ic_launcher_round.png')
        # Adaptive: the XML insets both layers by 16.7%, so the painting fills the visible 72 dp.
        save_png(square, folder / 'ic_launcher_foreground.png')
        save_png(Image.new('RGB', (px, px), BG), folder / 'ic_launcher_background.png')
    for folder, (w, h) in ANDROID_SPLASH.items():
        out = res / folder
        out.mkdir(parents=True, exist_ok=True)
        (out / 'splash.png').unlink(missing_ok=True)
        sized(SPLASH, w, h).save(out / 'splash.jpg', 'JPEG', quality=88, optimize=True, progressive=False)
    for night in res.glob('drawable*-night*'):
        for f in night.glob('splash.*'):
            f.unlink()
        if not any(night.iterdir()):
            night.rmdir()
    colors = res / 'values/ic_launcher_background.xml'
    colors.write_text('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1B2A2F</color>\n</resources>\n')


def ios() -> None:
    assets = ROOT / 'ios/App/App/Assets.xcassets'
    if not assets.exists():
        return
    icon = assets / 'AppIcon.appiconset/AppIcon-512@2x.png'
    save_png(sized(ICON, 1024, 1024), icon)  # iOS wants no alpha on the store icon
    splash = assets / 'Splash.imageset'
    for f in splash.glob('*.png'):
        f.unlink()
    images = []
    for scale, px in (('1x', 1366), ('2x', 2048), ('3x', 2732)):
        name = f'splash@{scale}.jpg'
        sized(SPLASH, px, px).save(splash / name, 'JPEG', quality=88, optimize=True)
        images.append({'idiom': 'universal', 'filename': name, 'scale': scale})
    (splash / 'Contents.json').write_text(json.dumps({'images': images, 'info': {'version': 1, 'author': 'xcode'}}, indent=2) + '\n')


if __name__ == '__main__':
    os.chdir(ROOT)
    web()
    android()
    ios()
    print('app icons and splash written')
