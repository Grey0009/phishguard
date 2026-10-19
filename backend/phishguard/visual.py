"""Lightweight visual analysis of a rendered page screenshot.

No deep learning: everything is NumPy + Pillow so it runs in a few
milliseconds on a CPU.  A screenshot is reduced to a compact descriptor:

  * pHash   (64 bit)  -- DCT based perceptual hash (global structure)
  * dHash   (64 bit)  -- gradient hash (edges / layout)
  * layout  (128 dim) -- 8x8 grid of mean luminance + mean edge density,
                         mean-centred and L2-normalised (cosine similarity)
  * colour  (64 bins) -- coarse RGB histogram (brand colours)

A page is compared with *brand templates* (descriptors of the real login
pages, registered by the user).  A high similarity on a domain that does not
belong to the brand => visual clone.
"""
from __future__ import annotations

import base64
import binascii
import io
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np
from PIL import Image

from .brands import BrandDB
from .lexical import Reason
from .netutil import ParsedURL

Image.MAX_IMAGE_PIXELS = 25_000_000
MAX_B64_LEN = 8_000_000

STRONG_MATCH = 0.88
WEAK_MATCH = 0.78


def decode_image(b64: str) -> Image.Image:
    if not isinstance(b64, str) or not b64:
        raise ValueError("screenshot missing")
    if b64.startswith("data:"):
        b64 = b64.split(",", 1)[-1]
    if len(b64) > MAX_B64_LEN:
        raise ValueError("screenshot too large")
    try:
        raw = base64.b64decode(b64, validate=False)
        im = Image.open(io.BytesIO(raw))
        im.draft("RGB", (800, 800))       # fast JPEG down-scaled decode
        return im.convert("RGB")
    except (binascii.Error, OSError, Image.DecompressionBombError) as exc:
        raise ValueError(f"bad image: {exc}") from exc


def _dct_matrix(n: int) -> np.ndarray:
    k = np.arange(n).reshape(-1, 1)
    j = np.arange(n).reshape(1, -1)
    m = np.sqrt(2.0 / n) * np.cos(np.pi * (2 * j + 1) * k / (2 * n))
    m[0, :] = np.sqrt(1.0 / n)
    return m


_DCT32 = _dct_matrix(32)


def _bits_to_hex(bits: np.ndarray) -> str:
    v = 0
    for b in bits.flatten():
        v = (v << 1) | int(b)
    return f"{v:016x}"


def describe(im: Image.Image) -> Dict[str, object]:
    gray = im.convert("L")
    # pHash
    g32 = np.asarray(gray.resize((32, 32), Image.LANCZOS), dtype=np.float64)
    dct = _DCT32 @ g32 @ _DCT32.T
    low = dct[:8, :8].flatten()
    med = np.median(low[1:])
    phash = _bits_to_hex(low > med)
    # dHash
    g9 = np.asarray(gray.resize((9, 8), Image.LANCZOS), dtype=np.float64)
    dhash = _bits_to_hex(g9[:, 1:] > g9[:, :-1])
    # layout descriptor
    g64 = np.asarray(gray.resize((64, 64), Image.LANCZOS), dtype=np.float64) / 255.0
    gy, gx = np.gradient(g64)
    mag = np.hypot(gx, gy)
    lum_cells = g64.reshape(8, 8, 8, 8).mean(axis=(1, 3)).flatten()
    edge_cells = mag.reshape(8, 8, 8, 8).mean(axis=(1, 3)).flatten()
    def _unit(v: np.ndarray) -> np.ndarray:
        v = v - v.mean()
        n = np.linalg.norm(v)
        return v / n if n > 1e-9 else v

    # each half is centred + normalised separately so neither dominates the cosine
    vec = np.concatenate([_unit(lum_cells), _unit(edge_cells)]) / np.sqrt(2.0)
    # colour histogram
    arr = np.asarray(im.resize((64, 64), Image.BILINEAR), dtype=np.uint8) >> 6
    idx = arr[..., 0].astype(int) * 16 + arr[..., 1].astype(int) * 4 + arr[..., 2].astype(int)
    hist = np.bincount(idx.flatten(), minlength=64).astype(np.float64)
    hist /= hist.sum()
    return {
        "phash": phash,
        "dhash": dhash,
        "layout": [round(float(x), 4) for x in vec],
        "hist": [round(float(x), 4) for x in hist],
        "whitespace": round(float((g64 > 0.94).mean()), 3),
        "edge_density": round(float(mag.mean()), 4),
    }


def _ham(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def similarity(a: dict, b: dict) -> Dict[str, float]:
    hp = _ham(a["phash"], b["phash"])
    hd = _ham(a["dhash"], b["dhash"])
    va, vb = np.asarray(a["layout"]), np.asarray(b["layout"])
    cos = float(max(0.0, np.dot(va, vb)))
    hist = float(np.minimum(np.asarray(a["hist"]), np.asarray(b["hist"])).sum())
    sim = 0.35 * (1 - hp / 64) + 0.20 * (1 - hd / 64) + 0.30 * cos + 0.15 * hist
    return {"similarity": sim, "phash_dist": hp, "dhash_dist": hd, "layout_cos": cos, "colour_overlap": hist}


@dataclass
class VisualAnalysis:
    score: float = 0.0
    best_brand: Optional[str] = None
    similarity: float = 0.0
    level: str = "none"                      # none | weak | strong
    details: Dict[str, float] = field(default_factory=dict)
    reasons: List[Reason] = field(default_factory=list)
    descriptor_summary: Dict[str, float] = field(default_factory=dict)


def analyze_visual(im: Image.Image, page: ParsedURL, templates: Dict[str, List[dict]],
                   db: BrandDB, trusted: bool,
                   strong: float = STRONG_MATCH, weak: float = WEAK_MATCH) -> VisualAnalysis:
    desc = describe(im)
    out = VisualAnalysis(descriptor_summary={"whitespace": desc["whitespace"],
                                             "edge_density": desc["edge_density"]})
    if trusted:
        return out
    best_sim, best_brand, best_details = 0.0, None, {}
    for brand, lst in templates.items():
        # never compare a brand's own domain against itself
        b_obj = next((b for b in db.brands if b.name == brand), None)
        if b_obj and (page.registrable in b_obj.domains or page.host in b_obj.domains):
            continue
        for t in lst:
            s = similarity(desc, t)
            if s["similarity"] > best_sim:
                best_sim, best_brand, best_details = s["similarity"], brand, s
    out.similarity = round(best_sim, 4)
    out.best_brand = best_brand
    out.details = {k: round(v, 4) for k, v in best_details.items()}
    if best_brand is None:
        return out
    if best_sim >= strong:
        out.level = "strong"
        out.score = 0.85 + 0.15 * min(1.0, (best_sim - strong) / (1 - strong))
        out.reasons.append(Reason("visual", "VISUAL_CLONE",
                                  f"Page looks almost identical to the {best_brand} login page "
                                  f"(similarity {best_sim:.2f}) but is not on a {best_brand} domain", 8.0))
    elif best_sim >= weak:
        out.level = "weak"
        out.score = 0.35 + 0.5 * (best_sim - weak) / (strong - weak)
        out.reasons.append(Reason("visual", "VISUAL_SIMILAR",
                                  f"Page resembles the {best_brand} login page "
                                  f"(similarity {best_sim:.2f})", 3.0))
    return out
