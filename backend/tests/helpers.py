"""Shared helpers: synthetic page screenshots drawn with Pillow."""
import base64
import io
import random

from PIL import Image, ImageDraw


def login_page(w=1280, h=720, brand=(0, 48, 135), accent=(255, 196, 57),
               title="Log in to DemoBank", jitter=0, bg=(255, 255, 255)):
    im = Image.new("RGB", (w, h), bg)
    d = ImageDraw.Draw(im)
    s = w / 1280

    def rect(x0, y0, x1, y1, fill=None, outline=None):
        d.rectangle([x0 * s + jitter, y0 * s + jitter, x1 * s + jitter, y1 * s + jitter],
                    fill=fill, outline=outline)
    rect(0, 0, 1280, 70, fill=brand)
    rect(40, 18, 200, 52, fill=accent)
    rect(440, 150, 840, 560, fill=(250, 250, 250), outline=(210, 210, 210))
    d.text((470 * s, 175 * s), title, fill=(20, 20, 20))
    rect(470, 230, 810, 275, outline=(150, 150, 150))
    rect(470, 300, 810, 345, outline=(150, 150, 150))
    rect(470, 390, 810, 440, fill=brand)
    rect(470, 470, 640, 480, fill=(200, 200, 200))
    rect(470, 495, 700, 505, fill=(200, 200, 200))
    return im


def blog_page(w=1280, h=720, seed=1):
    rnd = random.Random(seed)
    im = Image.new("RGB", (w, h), (255, 255, 255))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w, 60], fill=(30, 30, 30))
    for i in range(14):
        d.rectangle([160, 120 + i * 36, 160 + rnd.randint(500, 960), 132 + i * 36], fill=(90, 90, 90))
    d.rectangle([980, 120, 1220, 360], fill=(220, 220, 240))
    return im


def dashboard_page(w=1280, h=720):
    im = Image.new("RGB", (w, h), (20, 24, 32))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 220, h], fill=(35, 40, 52))
    for i in range(3):
        d.rectangle([260 + i * 330, 80, 260 + i * 330 + 300, 240], fill=(50, 58, 76))
    d.rectangle([260, 280, 1200, 660], fill=(40, 46, 60))
    return im


def to_b64(im, fmt="JPEG", quality=70):
    buf = io.BytesIO()
    im.save(buf, format=fmt, quality=quality) if fmt == "JPEG" else im.save(buf, format=fmt)
    return base64.b64encode(buf.getvalue()).decode()
