"""Regenerate demo/images/*.png and *.gif without third-party libraries."""
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "demo" / "images"


def png(path: Path, w: int, h: int, pixel):
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    rows = b"".join(b"\x00" + b"".join(bytes(pixel(x, y)) for x in range(w)) for y in range(h))
    data = b"\x89PNG\r\n\x1a\n"
    data += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(rows, 9))
    data += chunk(b"IEND", b"")
    path.write_bytes(data)


def gif(path: Path, w: int, h: int, index):
    # 2-colour GIF87a, uncompressed-style LZW (2-bit min code size, clear codes every 2 pixels)
    palette = bytes([30, 30, 30, 90, 200, 255])
    header = b"GIF87a" + struct.pack("<HHBBB", w, h, 0x80, 0, 0) + palette
    img = b"," + struct.pack("<HHHHB", 0, 0, w, h, 0) + b"\x02"
    codes = []
    for y in range(h):
        for x in range(w):
            codes.append(index(x, y))
    # emit: CLEAR, pixel, pixel, CLEAR, ... using 3-bit codes (min size 2 -> codes are 3 bits)
    bits, out = [], bytearray()
    for i, c in enumerate(codes):
        if i % 2 == 0:
            bits.append(4)  # clear
        bits.append(c)
    bits.append(5)  # end of information
    acc, n = 0, 0
    for b in bits:
        acc |= b << n
        n += 3
        while n >= 8:
            out.append(acc & 0xFF)
            acc >>= 8
            n -= 8
    if n:
        out.append(acc & 0xFF)
    blocks = b"".join(bytes([len(out[i:i + 255])]) + out[i:i + 255] for i in range(0, len(out), 255))
    path.write_bytes(header + img + blocks + b"\x00;")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    png(OUT / "gradient.png", 160, 120, lambda x, y: (x * 255 // 159, y * 255 // 119, 160, 255 if (x // 20 + y // 20) % 2 else 140))
    gif(OUT / "dots.gif", 64, 64, lambda x, y: 1 if (x // 8 + y // 8) % 2 else 0)
    print("wrote", OUT / "gradient.png", OUT / "dots.gif")
