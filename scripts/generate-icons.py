from __future__ import annotations

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def png_chunk(kind: bytes, payload: bytes) -> bytes:
    body = kind + payload
    return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)


def make_icon(size: int) -> bytes:
    pixels = bytearray([32, 37, 31] * size * size)

    def set_pixel(x: int, y: int, color: tuple[int, int, int]) -> None:
        if 0 <= x < size and 0 <= y < size:
            index = (y * size + x) * 3
            pixels[index : index + 3] = bytes(color)

    def fill_polygon(points: list[tuple[int, int]], color: tuple[int, int, int]) -> None:
        min_y = max(0, min(y for _, y in points))
        max_y = min(size - 1, max(y for _, y in points))
        for y in range(min_y, max_y + 1):
            intersections: list[int] = []
            for (x1, y1), (x2, y2) in zip(points, points[1:] + points[:1]):
                if y1 == y2:
                    continue
                if min(y1, y2) <= y < max(y1, y2):
                    intersections.append(round(x1 + (y - y1) * (x2 - x1) / (y2 - y1)))
            intersections.sort()
            for left, right in zip(intersections[::2], intersections[1::2]):
                for x in range(max(0, left), min(size, right + 1)):
                    set_pixel(x, y, color)

    def line(points: list[tuple[int, int]], color: tuple[int, int, int], width: int) -> None:
        radius = max(0, width // 2)
        for (x1, y1), (x2, y2) in zip(points, points[1:]):
            steps = max(abs(x2 - x1), abs(y2 - y1), 1)
            for step in range(steps + 1):
                x = round(x1 + (x2 - x1) * step / steps)
                y = round(y1 + (y2 - y1) * step / steps)
                for dx in range(-radius, radius + 1):
                    for dy in range(-radius, radius + 1):
                        set_pixel(x + dx, y + dy, color)

    scale = size / 192
    x0, y0, x1, y1, fold = [round(value * scale) for value in (53, 35, 139, 157, 22)]
    paper = (244, 242, 236)
    accent = (185, 102, 79)
    fill_polygon([(x0, y0), (x1 - fold, y0), (x1, y0 + fold), (x1, y1), (x0, y1)], paper)
    line([(x0, y0), (x1 - fold, y0), (x1, y0 + fold), (x1, y1), (x0, y1), (x0, y0)], accent, round(5 * scale))
    line([(x1 - fold, y0), (x1 - fold, y0 + fold), (x1, y0 + fold)], accent, round(5 * scale))
    for offset in (0, 25, 50):
        y = round((78 + offset) * scale)
        line([(round(78 * scale), y), (round(119 * scale), y)], accent, round(5 * scale))

    raw = b"".join(b"\x00" + bytes(pixels[row * size * 3 : (row + 1) * size * 3]) for row in range(size))
    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", header) + png_chunk(b"IDAT", zlib.compress(raw, 9)) + png_chunk(b"IEND", b"")


for size in (192, 512):
    (ROOT / "public" / f"pwa-{size}.png").write_bytes(make_icon(size))
