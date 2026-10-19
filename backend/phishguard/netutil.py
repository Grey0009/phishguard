"""URL / host parsing helpers (standard library only).

Why not tldextract?  It needs a downloaded public-suffix list.  This module
ships a *small* built-in suffix table that is good enough for the project and
for tests; swap in `tldextract` / `publicsuffix2` for production use.
"""
from __future__ import annotations

import ipaddress
import math
import re
import unicodedata
from dataclasses import dataclass, field
from typing import List, Optional
from urllib.parse import urlsplit

# --- suffix tables ---------------------------------------------------------
MULTI_PART_SUFFIXES = {
    "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au",
    "co.in", "net.in", "org.in", "ac.in", "gov.in", "edu.in", "res.in",
    "nic.in", "co.jp", "com.br", "com.cn", "com.sg", "co.nz", "co.za",
    "com.mx", "com.tr", "com.pk", "com.bd", "co.id", "com.my", "com.ph",
    "com.hk", "co.kr", "com.ar", "com.ng", "co.ke",
}

# Free hosting / user-content platforms: anyone can get a sub-domain, so the
# "registrable" unit is the sub-domain, and being under e.g. github.io says
# nothing about the owner.  (Heuristic list -- extend as needed.)
SHARED_HOSTING_SUFFIXES = {
    "github.io", "pages.dev", "netlify.app", "vercel.app", "web.app",
    "firebaseapp.com", "blogspot.com", "weebly.com", "wixsite.com",
    "herokuapp.com", "glitch.me", "workers.dev", "onrender.com",
    "000webhostapp.com", "notion.site", "ngrok.io", "ngrok-free.app",
    "trycloudflare.com", "sharepoint.com", "s3.amazonaws.com",
    "azurewebsites.net", "r2.dev", "repl.co", "surge.sh", "fly.dev",
    "framer.app", "carrd.co", "webflow.io", "myshopify.com", "lovable.app",
}

# Hosts that serve user-controlled content even though the parent domain is a
# trusted brand (so "trusted brand domain" must NOT short-circuit analysis).
USER_CONTENT_HOSTS = {
    "sites.google.com", "docs.google.com", "drive.google.com",
    "script.google.com", "storage.googleapis.com", "forms.gle",
    "onedrive.live.com", "1drv.ms", "dl.dropboxusercontent.com",
    "firebasestorage.googleapis.com",
}

_ALL_SUFFIXES = MULTI_PART_SUFFIXES | SHARED_HOSTING_SUFFIXES

_SPLIT_RE = re.compile(r"[\W_]+", re.UNICODE)


def tokenize(text: str) -> List[str]:
    """Lower-case alphanumeric tokens (unicode aware)."""
    return [t for t in _SPLIT_RE.split(text.lower()) if t]


def shannon_entropy(s: str) -> float:
    if not s:
        return 0.0
    counts = {}
    for ch in s:
        counts[ch] = counts.get(ch, 0) + 1
    n = len(s)
    return -sum((c / n) * math.log2(c / n) for c in counts.values())


def levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def to_unicode_host(host: str) -> str:
    """Decode xn-- labels (IDNA) so we can inspect the real characters."""
    out = []
    for lab in host.split("."):
        if lab.startswith("xn--"):
            try:
                lab = lab.encode("ascii").decode("idna")
            except Exception:
                pass
        out.append(lab)
    return ".".join(out)


def to_ascii_host(host: str) -> str:
    if host.isascii():
        return host
    try:
        return host.encode("idna").decode("ascii")
    except Exception:
        return host


def _is_ip_like(host: str) -> bool:
    if not host:
        return False
    try:
        ipaddress.ip_address(host.strip("[]"))
        return True
    except ValueError:
        pass
    # decimal (3232235777), hex (0xC0A80001) or octal-ish integer hosts
    if re.fullmatch(r"\d{8,10}", host) or re.fullmatch(r"0x[0-9a-f]+", host):
        return True
    return False


def _is_private_ip(host: str) -> bool:
    try:
        ip = ipaddress.ip_address(host.strip("[]"))
        return ip.is_private or ip.is_loopback or ip.is_link_local
    except ValueError:
        return host == "localhost"


@dataclass
class ParsedURL:
    raw: str
    valid: bool = True
    scheme: str = ""
    userinfo: str = ""
    host: str = ""            # ASCII / punycode form
    unicode_host: str = ""    # decoded form
    port: Optional[int] = None
    path: str = ""
    query: str = ""
    fragment: str = ""
    sub_labels: List[str] = field(default_factory=list)  # outer -> inner order as written
    sld: str = ""
    suffix: str = ""
    registrable: str = ""
    is_ip: bool = False
    is_local: bool = False
    shared_hosting: bool = False

    @property
    def is_https(self) -> bool:
        return self.scheme == "https"


def parse_url(raw: str) -> ParsedURL:
    raw = (raw or "").strip()
    p = ParsedURL(raw=raw)
    if not raw or len(raw) > 4096:
        p.valid = False
        return p
    candidate = raw
    if "://" not in candidate.split("?")[0].split("#")[0] and not candidate.startswith("//"):
        candidate = "http://" + candidate
    try:
        parts = urlsplit(candidate)
        host = (parts.hostname or "").rstrip(".")
        port = parts.port
    except ValueError:
        p.valid = False
        return p
    if parts.scheme not in ("http", "https") or not host:
        p.valid = False
        return p

    p.scheme = parts.scheme
    p.userinfo = (parts.username or "") + (":" + parts.password if parts.password else "")
    p.port = port
    p.path, p.query, p.fragment = parts.path, parts.query, parts.fragment
    p.unicode_host = to_unicode_host(host)
    p.host = to_ascii_host(host)

    if _is_ip_like(p.host):
        p.is_ip = True
        p.is_local = _is_private_ip(p.host)
        p.sld = p.host
        p.registrable = p.host
        return p
    if p.host == "localhost":
        p.is_local = True

    labels = p.unicode_host.split(".")
    ascii_labels = p.host.split(".")
    suffix_len = 1
    for n in (3, 2):
        if len(ascii_labels) > n and ".".join(ascii_labels[-n:]) in _ALL_SUFFIXES:
            suffix_len = n
            break
    if len(labels) <= suffix_len:           # e.g. "localhost" or bare TLD
        p.sld = p.unicode_host
        p.registrable = p.host
        p.suffix = ""
        return p
    p.suffix = ".".join(labels[-suffix_len:])
    p.sld = labels[-suffix_len - 1]
    p.sub_labels = labels[: -suffix_len - 1]
    p.registrable = ".".join(ascii_labels[-suffix_len - 1:])
    p.shared_hosting = ".".join(ascii_labels[-suffix_len:]) in SHARED_HOSTING_SUFFIXES
    return p


def registrable_of_host(host: str) -> str:
    """Registrable domain for an arbitrary host string (used for form actions etc.)."""
    return parse_url("http://" + host).registrable
