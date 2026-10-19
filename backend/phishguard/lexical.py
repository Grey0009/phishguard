"""URL lexical analysis: features, brand-impersonation signals, explainable score.

`analyze_url()` returns a UrlAnalysis with
  * `features`  -- numeric vector (used by the optional ML model),
  * `points`    -- additive "suspicion points" from transparent rules,
  * `reasons`   -- human-readable explanations (shown in the extension),
  * `brand`     -- strongest brand-impersonation signal, if any.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from .brands import BrandDB
from .homoglyph import has_confusable_chars, is_mixed_script, skeleton
from .netutil import (ParsedURL, levenshtein, parse_url, shannon_entropy,
                      tokenize)
from .urlgraph import UrlGraph, build_url_graph, graph_features

SUSPICIOUS_TLDS = {
    "tk", "ml", "ga", "cf", "gq", "xyz", "top", "click", "zip", "mov", "work",
    "support", "rest", "icu", "buzz", "cyou", "cfd", "sbs", "country", "kim",
    "loan", "men", "party", "review", "stream", "download", "racing", "win",
    "bid", "date", "cam", "monster", "quest",
}  # heuristic prior; the ML model can learn real weights from data

KEYWORDS = {
    "login", "signin", "verify", "verification", "secure", "security", "account",
    "update", "confirm", "banking", "wallet", "password", "webscr", "suspended",
    "unlock", "billing", "invoice", "payment", "otp", "kyc", "aadhaar", "refund",
    "claim", "reward", "recover", "recovery", "validate", "authentication",
    "limited", "unusual",
}

SHORTENERS = {
    "bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "cutt.ly", "rb.gy",
    "ow.ly", "buff.ly", "shorturl.at", "tiny.cc", "rebrand.ly", "t.ly",
    "bl.ink", "lnkd.in", "s.id", "v.gd",
}

TLD_LABELS = {"com", "net", "org", "co", "gov", "edu"}


def _raw_netloc(raw: str) -> str:
    rest = raw.split("://", 1)[-1]
    return rest.split("/")[0].split("?")[0].split("#")[0]


_VOWELS = set("aeiou")


def looks_random(tok: str) -> bool:
    """Heuristic for machine-generated tokens (DGA-like): long and consonant-heavy or letter+digit soup."""
    if len(tok) < 10 or not tok.isascii():
        return False
    letters = [c for c in tok if c.isalpha()]
    if not letters:
        return False
    vowel_ratio = sum(c in _VOWELS for c in letters) / len(letters)
    digit_ratio = sum(c.isdigit() for c in tok) / len(tok)
    return vowel_ratio < 0.22 or (0.2 < digit_ratio < 0.8 and len(letters) >= 3)


def squash(points: float, scale: float) -> float:
    """Map additive points (>=0) to a 0..1 score."""
    return 1.0 - math.exp(-max(points, 0.0) / scale)


@dataclass
class Reason:
    module: str
    code: str
    message: str
    points: float

    def to_dict(self) -> dict:
        return {"module": self.module, "code": self.code,
                "message": self.message, "points": round(self.points, 2)}


@dataclass
class UrlAnalysis:
    parsed: ParsedURL
    features: Dict[str, float] = field(default_factory=dict)
    points: float = 0.0
    score: float = 0.0
    reasons: List[Reason] = field(default_factory=list)
    brand: Optional[dict] = None          # {"name","kind","evidence"}
    trusted: bool = False
    trusted_brand: Optional[str] = None
    graph: Optional[UrlGraph] = None


def brand_signal(p: ParsedURL, db: BrandDB) -> Optional[dict]:
    """Strongest brand-impersonation signal for a (non-legit) URL, or None."""
    best: Optional[dict] = None
    rank = {"homoglyph": 5, "subdomain": 4, "typosquat": 3, "sld_token": 2, "path": 1}

    def consider(name: str, kind: str, evidence: str) -> None:
        nonlocal best
        if best is None or rank[kind] > rank[best["kind"]]:
            best = {"name": name, "kind": kind, "evidence": evidence}

    sub_tokens: List[str] = []
    for lab in p.sub_labels:
        sub_tokens += tokenize(lab)
    sld_tokens = tokenize(p.sld) if not p.is_ip else []
    sld_flat = "".join(sld_tokens)
    path_tokens = tokenize(p.path) + tokenize(p.query)

    for b in db.brands:
        for kw in b.keywords:
            # --- homoglyph / leetspeak tokens (skeleton equal but text different)
            if len(kw) >= 4:
                sk = skeleton(kw)
                for tok in sld_tokens + [sld_flat] + sub_tokens:
                    if tok != kw and tok and skeleton(tok) == sk:
                        consider(b.name, "homoglyph", f"'{tok}' looks like '{kw}'")
                # raw unicode label with confusable characters whose skeleton == brand
                if has_confusable_chars(p.sld) and skeleton(p.sld) == sk and p.sld != kw:
                    consider(b.name, "homoglyph", f"'{p.sld}' looks like '{kw}'")
            # --- brand keyword as its own token in a sub-domain
            if kw in sub_tokens:
                consider(b.name, "subdomain", f"'{kw}' appears as a sub-domain of {p.registrable}")
            # --- brand in the registrable label together with other words
            if kw in sld_tokens and sld_flat != kw:
                consider(b.name, "sld_token", f"'{kw}' is combined with other words in '{p.sld}'")
            elif len(kw) >= 6 and kw in sld_flat and sld_flat != kw:
                consider(b.name, "sld_token", f"'{kw}' is embedded in '{p.sld}'")
            # --- typo-squatting
            if len(kw) >= 6:
                for tok in set(sld_tokens + [sld_flat]):
                    if tok and tok != kw and abs(len(tok) - len(kw)) <= 2:
                        d = levenshtein(tok, kw)
                        limit = 1 if len(kw) < 8 else 2
                        if 1 <= d <= limit and skeleton(tok) != skeleton(kw):
                            consider(b.name, "typosquat", f"'{tok}' is {d} edit(s) from '{kw}'")
            # --- brand only in path / query
            if kw in path_tokens:
                consider(b.name, "path", f"'{kw}' appears in the URL path")
    return best


def analyze_url(raw: str, db: BrandDB) -> UrlAnalysis:
    p = parse_url(raw)
    a = UrlAnalysis(parsed=p)
    if not p.valid:
        a.points = 2.0
        a.score = squash(a.points, 4.5)
        a.reasons.append(Reason("url", "INVALID_URL", "URL could not be parsed as http(s)", 2.0))
        return a

    # --- trusted shortcut
    legit = db.legit_brand(p)
    if legit is not None:
        a.trusted, a.trusted_brand = True, legit.name
    elif db.is_allowlisted(p):
        a.trusted = True

    host_tokens = tokenize(p.unicode_host)
    path_tokens = tokenize(p.path) + tokenize(p.query)
    kw_in_host = {t for t in host_tokens if t in KEYWORDS}
    kw_in_path = {t for t in path_tokens if t in KEYWORDS}
    n_kw = len(kw_in_host | kw_in_path)
    sld_digits = sum(ch.isdigit() for ch in p.sld)
    n_labels = len(p.sub_labels) + (2 if p.suffix else 1)

    # ---- numeric features -------------------------------------------------
    f: Dict[str, float] = {
        "url_len": float(len(p.raw)),
        "host_len": float(len(p.host)),
        "path_len": float(len(p.path)),
        "query_len": float(len(p.query)),
        "n_dots_host": float(p.host.count(".")),
        "n_hyphens_host": float(p.unicode_host.count("-")),
        "n_digits_host": float(sum(ch.isdigit() for ch in p.host)),
        "digit_ratio_sld": (sld_digits / len(p.sld)) if p.sld else 0.0,
        "n_subdomains": float(len(p.sub_labels)),
        "n_labels": float(n_labels),
        "path_depth": float(len([s for s in p.path.split("/") if s])),
        "n_params": float(len([x for x in p.query.split("&") if x])),
        "has_userinfo": float(bool(p.userinfo)),
        "is_ip": float(p.is_ip and not p.is_local),
        "nonstd_port": float(p.port not in (None, 80, 443)),
        "is_https": float(p.is_https),
        "has_punycode": float("xn--" in p.host),
        "has_non_ascii": float(not p.unicode_host.isascii()),
        "mixed_script": float(any(is_mixed_script(l) for l in p.unicode_host.split("."))),
        "suspicious_tld": float(p.suffix.split(".")[-1] in SUSPICIOUS_TLDS),
        "is_shortener": float(p.registrable in SHORTENERS),
        "free_hosting": float(p.shared_hosting),
        "n_keywords": float(n_kw),
        "host_entropy": shannon_entropy(p.host),
        "longest_host_token": float(max((len(t) for t in host_tokens), default=0)),
        "n_special": float(sum(p.raw.count(c) for c in "%=&_~")),
        "tld_label_in_subdomain": float(any(l in TLD_LABELS for l in p.sub_labels)),
        "pct_in_host": float("%" in _raw_netloc(p.raw)),
    }

    sig = None if a.trusted else brand_signal(p, db)
    a.brand = sig
    f["brand_kind_homoglyph"] = float(bool(sig and sig["kind"] == "homoglyph"))
    f["brand_kind_subdomain"] = float(bool(sig and sig["kind"] == "subdomain"))
    f["brand_kind_typosquat"] = float(bool(sig and sig["kind"] == "typosquat"))
    f["brand_kind_sld_token"] = float(bool(sig and sig["kind"] == "sld_token"))
    f["brand_kind_path"] = float(bool(sig and sig["kind"] == "path"))

    # ---- lexical graph ------------------------------------------------------
    g = build_url_graph(p)
    a.graph = g
    brand_tokens = {k for b in db.brands for k in b.keywords}
    gf = graph_features(g, p, KEYWORDS, brand_tokens)
    f.update(gf)
    a.features = f

    if a.trusted:
        a.points, a.score = 0.0, 0.02
        a.reasons.append(Reason("url", "TRUSTED_DOMAIN",
                                f"Registrable domain {p.registrable} is a known legitimate domain"
                                + (f" of {a.trusted_brand}" if a.trusted_brand else ""), 0.0))
        return a

    # ---- transparent rules -----------------------------------------------------
    def add(code: str, msg: str, pts: float) -> None:
        a.reasons.append(Reason("url", code, msg, pts))
        a.points += pts

    if p.is_ip and not p.is_local:
        add("IP_HOST", "Host is a raw IP address instead of a domain name", 3.0)
    elif p.is_local:
        add("LOCAL_HOST", "Host is a local / private address", 0.3)
    if p.userinfo:
        add("USERINFO_AT", "URL contains user-info ('@') which can hide the real host", 2.5)
        if re.search(r"[a-z0-9-]+\.[a-z]{2,}", p.userinfo.lower()):
            add("USERINFO_FAKE_HOST", "The text before '@' looks like a domain name (decoy host)", 3.0)
    if "xn--" in p.host:
        add("PUNYCODE", "Domain uses internationalised (punycode) characters", 1.5)
    if f["mixed_script"]:
        add("MIXED_SCRIPT", "A domain label mixes Latin with other alphabets (homograph pattern)", 3.5)
    if f["suspicious_tld"]:
        add("SUSPICIOUS_TLD", f"Top-level domain .{p.suffix.split('.')[-1]} is frequently abused", 1.5)
    if f["is_shortener"]:
        add("SHORTENER", "URL shortener hides the final destination", 1.5)
    if len(p.sub_labels) >= 4:
        add("MANY_SUBDOMAINS", f"{len(p.sub_labels)} nested sub-domains", 1.5)
    if f["n_hyphens_host"] >= 3:
        add("MANY_HYPHENS", "Host contains many hyphens", 1.2)
    if len(p.host) > 40:
        add("LONG_HOST", "Unusually long host name", 1.0)
    if f["nonstd_port"] and not p.is_local:
        add("ODD_PORT", f"Non-standard port {p.port}", 1.0)
    if not p.is_https and not p.is_local:
        add("NO_HTTPS", "Connection is not encrypted (http)", 0.7)
    if p.shared_hosting:
        add("FREE_HOSTING", f"Hosted on a free/shared platform ({p.registrable})", 1.0)
    if f["tld_label_in_subdomain"]:
        add("TLD_IN_SUBDOMAIN", "A fake domain suffix (e.g. 'com') appears inside the sub-domain", 2.0)
    if f["pct_in_host"]:
        add("PCT_IN_HOST", "Percent-encoding inside the host name", 1.5)
    if any(looks_random(t) for t in host_tokens):
        add("RANDOM_HOST", "Host contains a random-looking (machine-generated) token", 1.0)
    if f["digit_ratio_sld"] > 0.3 and len(p.sld) >= 6 and not p.is_ip:
        add("DIGIT_HEAVY", "Domain label is digit-heavy", 0.8)
    if len(p.raw) > 100:
        add("LONG_URL", "Very long URL", 0.8)
    if n_kw:
        add("KEYWORDS", "Sensitive keywords in URL: " + ", ".join(sorted(kw_in_host | kw_in_path)[:4]),
            min(n_kw, 3) * 0.8)
    if sig:
        k, nm, ev = sig["kind"], sig["name"], sig["evidence"]
        if k == "homoglyph":
            add("BRAND_HOMOGLYPH", f"Look-alike of {nm}: {ev}", 9.0)
        elif k == "subdomain":
            add("BRAND_SUBDOMAIN", f"Impersonates {nm}: {ev}", 4.5)
        elif k == "typosquat":
            add("BRAND_TYPOSQUAT", f"Possible typo-squat of {nm}: {ev}", 3.5)
        elif k == "sld_token":
            add("BRAND_IN_DOMAIN", f"Domain embeds the brand {nm}: {ev}", 2.0)
        elif k == "path":
            add("BRAND_IN_PATH", f"{nm} is mentioned in the path of an unrelated domain", 2.0)
        if k in ("sld_token", "typosquat") and (f["suspicious_tld"] or p.shared_hosting):
            add("BRAND_ABUSED_TLD", "Brand name combined with an abused TLD / free hosting platform", 1.5)
        if f["g_kw_brand_adjacent"] > 0 and k in ("sld_token", "subdomain", "typosquat", "homoglyph"):
            add("GRAPH_KW_BRAND", "Lexical graph: a sensitive keyword is directly linked to a brand token", 1.5)

    a.score = squash(a.points, 4.5)
    return a
