"""Homoglyph (IDN homograph) detection.

Two complementary checks:

1. *Mixed-script labels*  -- a single DNS label that mixes Latin letters with
   Cyrillic / Greek / Armenian letters is almost never legitimate.
2. *Skeleton comparison*  -- map visually confusable characters onto one
   canonical ASCII "skeleton" (a tiny, hand-curated subset of Unicode TR39
   "confusables") and compare the skeleton of a domain token to the skeleton
   of a protected brand name.  This also catches ASCII look-alikes such as
   `paypa1`, `rnicrosoft`, `g00gle`.

The table is intentionally small and readable (viva-friendly).  For production
use the full Unicode `confusables.txt`.
"""
from __future__ import annotations

import unicodedata
from typing import Set

# Cyrillic / Greek / Armenian / Latin-extended characters that look like ASCII
_CONFUSABLES = {
    # Cyrillic
    "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "у": "y",
    "і": "i", "ј": "j", "ѕ": "s", "ԁ": "d", "һ": "h", "ӏ": "l", "ԛ": "q",
    "ԝ": "w", "ɡ": "g", "к": "k", "ѵ": "v", "ү": "y", "ɩ": "i",
    # Greek
    "ο": "o", "ν": "v", "α": "a", "ρ": "p", "ι": "i", "κ": "k", "υ": "u",
    "χ": "x", "ɑ": "a", "ԍ": "g",
    # Armenian
    "ո": "n", "օ": "o", "ս": "u", "ց": "g", "զ": "q",
    # Latin extended / misc
    "ı": "i", "ł": "l", "ø": "o", "đ": "d", "ƅ": "b", "ǀ": "l", "ⅼ": "l",
    "ℓ": "l",
}

_SCRIPT_PREFIXES = ("LATIN", "CYRILLIC", "GREEK", "ARMENIAN", "HEBREW", "ARABIC",
                    "DEVANAGARI", "CJK", "HIRAGANA", "KATAKANA", "HANGUL", "THAI")


def _script(ch: str) -> str:
    try:
        name = unicodedata.name(ch)
    except ValueError:
        return "UNKNOWN"
    for pref in _SCRIPT_PREFIXES:
        if name.startswith(pref):
            return pref
    return "OTHER"


def scripts_in(label: str) -> Set[str]:
    """Scripts used by the *letters* of a label (digits / hyphens ignored)."""
    return {_script(ch) for ch in label if ch.isalpha()}


def is_mixed_script(label: str) -> bool:
    s = scripts_in(label)
    return len(s) > 1 and "LATIN" in s


def has_confusable_chars(label: str) -> bool:
    return any(ch in _CONFUSABLES for ch in label.lower())


def skeleton(text: str) -> str:
    """Canonical look-alike skeleton of a string.

    Collapses: confusable Unicode letters, 0->o, 1/i/|->l, rn->m, vv->w.
    Applied to BOTH sides of a comparison, so over-merging only matters when
    two *different* brand names collide (checked at start-up in tests).
    """
    t = unicodedata.normalize("NFKC", text).lower()
    t = "".join(_CONFUSABLES.get(ch, ch) for ch in t)
    t = t.replace("rn", "m").replace("vv", "w")
    t = t.replace("0", "o").replace("1", "l").replace("i", "l").replace("|", "l")
    return t
