"""Yer tutucu ikonları üretir (yalnızca standart kütüphane): python3 desktop/assets/make_icons.py
icon.png (512, uygulama/Dock), trayTemplate.png (16) + @2x (32, menü çubuğu, macOS template)."""
import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))


def png(path, w, h, px):
    raw = b"".join(b"\x00" + b"".join(bytes(px(x, y)) for x in range(w)) for y in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


# 16x16 piksel çizim: monitör + ayak (# dolu, . boş, o ekran içi)
ART = [
    "................",
    "................",
    ".##############.",
    ".#oooooooooooo#.",
    ".#oooooooooooo#.",
    ".#oooooooooooo#.",
    ".#oooooooooooo#.",
    ".#oooooooooooo#.",
    ".#oooooooooooo#.",
    ".##############.",
    "......####......",
    "......####......",
    "...##########...",
    "................",
    "................",
    "................",
]


def icon(x, y, n=512):
    s = n // 16
    cx, cy = x // s, y // s
    m = 40  # köşe yuvarlama payı (piksel)
    inside = not ((x < m or x >= n - m) and (y < m or y >= n - m)) or \
        min((x - m) ** 2 if x < m else (x - n + m + 1) ** 2, 10**9) + ((y - m) ** 2 if y < m else (y - n + m + 1) ** 2) <= m * m
    if not inside:
        return (0, 0, 0, 0)
    c = ART[cy][cx]
    if c == "#":
        return (232, 89, 12, 255)      # turuncu (Manager rengi)
    if c == "o":
        on = (cy in (4, 6) and 3 <= cx <= 10) or (cy == 8 and 3 <= cx <= 7)
        return (126, 224, 255, 255) if on else (11, 21, 20, 255)
    return (15, 31, 28, 255)


def tray(n):
    s = n // 16
    def px(x, y):
        c = ART[y // s][x // s]
        return (0, 0, 0, 255) if c == "#" else (0, 0, 0, 0)
    return px


png(os.path.join(HERE, "icon.png"), 512, 512, icon)
png(os.path.join(HERE, "trayTemplate.png"), 16, 16, tray(16))
png(os.path.join(HERE, "trayTemplate@2x.png"), 32, 32, tray(32))
print("ikonlar yazıldı")
