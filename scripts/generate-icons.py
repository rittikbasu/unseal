from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scripts" / "assets" / "unseal-app-icon-source.png"


def make_icon(size: int) -> Image.Image:
    return Image.open(SOURCE).convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)


for name, size in (("favicon", 64), ("apple-touch-icon", 180), ("pwa-192", 192), ("pwa-512", 512)):
    make_icon(size).save(ROOT / "public" / f"{name}.png", format="PNG", optimize=True)
