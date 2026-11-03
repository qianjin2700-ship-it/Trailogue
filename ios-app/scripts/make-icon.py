#!/usr/bin/env python
"""Generate the Trailogue app icon (1024x1024, no alpha).

Trailogue palette (taken from the app UI):
  paper   #F7F4EE   ink    #24211D
  leather #7D5C3C   red    #A33B2B

Run:  python scripts/make-icon.py [out.png]
"""

import sys
from PIL import Image, ImageDraw, ImageFilter

PAPER = (247, 244, 238)
INK = (36, 33, 29)
RED = (163, 59, 43)

SIZE = 1024
SS = 4  # supersample factor


def quad(p0, p1, p2, steps=200):
    """Sample a quadratic bezier p0 -> p1 (control) -> p2."""
    pts = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0]
        y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]
        pts.append((x, y))
    return pts


def open_book(x0, x1, y_top, y_bot, dip_top=26, dip_bot=30, bow=34):
    """Open-book silhouette: outer corners high, spine (center) dips down."""
    xm = (x0 + x1) / 2
    top_l = quad((x0, y_top), (x0 + (xm - x0) / 2, y_top + dip_top - bow * 0.4), (xm, y_top + dip_top))
    top_r = quad((xm, y_top + dip_top), (x1 - (xm - x0) / 2, y_top + dip_top - bow * 0.4), (x1, y_top))
    bot_r = quad((x1, y_bot), (x1 - (xm - x0) / 2, y_bot + dip_bot - bow * 0.4), (xm, y_bot + dip_bot))
    bot_l = quad((xm, y_bot + dip_bot), (x0 + (xm - x0) / 2, y_bot + dip_bot - bow * 0.4), (x0, y_bot))
    return top_l + top_r + bot_r + bot_l


def build():
    s = SIZE * SS
    img = Image.new("RGB", (s, s), PAPER)

    # --- paper grain -------------------------------------------------
    noise = Image.effect_noise((s, s), 24).convert("L").filter(ImageFilter.GaussianBlur(1.4))
    grain = Image.merge("RGB", (noise, noise, noise))
    img = Image.blend(img, grain, 0.045)

    d = ImageDraw.Draw(img)

    # --- sun ---------------------------------------------------------
    r = 118
    cx, cy = 512, 332
    d.ellipse([(cx - r) * SS, (cy - r) * SS, (cx + r) * SS, (cy + r) * SS], fill=RED)

    # --- open book ---------------------------------------------------
    book = open_book(x0=150, x1=874, y_top=664, y_bot=856)
    d.polygon([(x * SS, y * SS) for x, y in book], fill=INK)

    # --- spine: thin paper line down the middle of the book ----------
    d.rectangle([507 * SS, 690 * SS, 517 * SS, 888 * SS], fill=PAPER)

    img = img.resize((SIZE, SIZE), Image.LANCZOS)
    return img.convert("RGB")


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "assets/icon.png"
    icon = build()
    icon.save(out, "PNG", optimize=True)
    print(f"wrote {out}  mode={icon.mode}  size={icon.size}")
