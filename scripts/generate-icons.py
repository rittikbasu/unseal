from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]


def cubic(start: tuple[float, float], control_a: tuple[float, float], control_b: tuple[float, float], end: tuple[float, float], steps: int = 32) -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []
    for index in range(steps + 1):
        t = index / steps
        inverse = 1 - t
        points.append(
            (
                inverse**3 * start[0]
                + 3 * inverse**2 * t * control_a[0]
                + 3 * inverse * t**2 * control_b[0]
                + t**3 * end[0],
                inverse**3 * start[1]
                + 3 * inverse**2 * t * control_a[1]
                + 3 * inverse * t**2 * control_b[1]
                + t**3 * end[1],
            )
        )
    return points


def draw_round_line(draw: ImageDraw.ImageDraw, points: list[tuple[float, float]], fill: tuple[int, int, int], width: int) -> None:
    draw.line(points, fill=fill, width=width, joint="curve")
    radius = width / 2
    for x, y in (points[0], points[-1]):
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill)


def make_icon(size: int) -> Image.Image:
    scale = size / 192
    image = Image.new("RGB", (size, size), (9, 10, 12))
    draw = ImageDraw.Draw(image)
    inset = round(11 * scale)
    radius = round(38 * scale)
    draw.rounded_rectangle((inset, inset, size - inset, size - inset), radius=radius, fill=(14, 16, 20))

    width = max(1, round(8.5 * scale))
    left_x = 52 * scale
    right_x = 140 * scale
    top_y = 35 * scale
    curve_start = 103 * scale
    curve_end = 157 * scale
    bottom_y = 157 * scale
    center_x = 96 * scale
    u_points = [(left_x, top_y), (left_x, curve_start)]
    u_points += cubic(
        (left_x, curve_start),
        (left_x, 143 * scale),
        (68 * scale, bottom_y),
        (center_x, bottom_y),
    )[1:]
    u_points += cubic(
        (center_x, bottom_y),
        (124 * scale, bottom_y),
        (right_x, 143 * scale),
        (right_x, curve_start),
    )[1:]
    u_points.append((right_x, 102 * scale))
    draw_round_line(draw, u_points, (244, 241, 234), width)
    draw_round_line(draw, [(right_x, 60 * scale), (right_x, 27 * scale)], (244, 241, 234), width)
    return image


for size in (192, 512):
    image = make_icon(size)
    image.save(ROOT / "public" / f"pwa-{size}.png", format="PNG", optimize=True)
