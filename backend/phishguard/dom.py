"""DOM-structure analysis.

The browser extension sends a *structural summary* of the page (never the
values typed into inputs).  This module sanitises that payload, derives
features, and scores them with transparent rules.

Expected payload (all keys optional, all values untrusted):
{
  "title": str, "text": str (<= 3000 chars of visible text),
  "forms": [{"action": str, "method": str, "hasPassword": bool, "inputs": int}],
  "passwordInputs": int, "inputCount": int, "sensitiveFields": int,
  "links": {"total": int, "external": int, "nullish": int},
  "resources": {"total": int, "external": int},
  "iframes": {"total": int, "hidden": int, "external": int},
  "favicon": str, "metaRefresh": bool, "rightClickBlocked": bool,
  "textLength": int, "scriptCount": int
}
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .brands import BrandDB
from .lexical import Reason, squash
from .netutil import ParsedURL, parse_url, tokenize

CREDENTIAL_WORDS = (
    "password", "passcode", "otp", "cvv", "card number", "debit card", "credit card",
    "aadhaar", "aadhar", "pan number", "upi pin", "net banking", "netbanking",
    "social security", "ssn", "security code", "mpin", "atm pin",
)
URGENCY_WORDS = (
    "verify your account", "account suspended", "account will be", "urgent",
    "immediately", "within 24 hours", "unusual activity", "confirm your identity",
    "locked", "limited access", "update your information", "kyc",
)


def _int(v: Any, lo: int = 0, hi: int = 1_000_000) -> int:
    try:
        n = int(v)
    except (TypeError, ValueError):
        return lo
    return max(lo, min(hi, n))


def _str(v: Any, n: int) -> str:
    return v[:n] if isinstance(v, str) else ""


def sanitize_dom(d: Any) -> Dict[str, Any]:
    d = d if isinstance(d, dict) else {}
    links = d.get("links") if isinstance(d.get("links"), dict) else {}
    res = d.get("resources") if isinstance(d.get("resources"), dict) else {}
    ifr = d.get("iframes") if isinstance(d.get("iframes"), dict) else {}
    forms_in = d.get("forms") if isinstance(d.get("forms"), list) else []
    forms = []
    for f in forms_in[:20]:
        if isinstance(f, dict):
            forms.append({
                "action": _str(f.get("action"), 2048),
                "method": _str(f.get("method"), 10).lower(),
                "hasPassword": bool(f.get("hasPassword")),
                "inputs": _int(f.get("inputs"), hi=500),
            })
    return {
        "title": _str(d.get("title"), 300),
        "text": _str(d.get("text"), 4000).lower(),
        "forms": forms,
        "passwordInputs": _int(d.get("passwordInputs"), hi=100),
        "inputCount": _int(d.get("inputCount"), hi=2000),
        "sensitiveFields": _int(d.get("sensitiveFields"), hi=100),
        "links": {k: _int(links.get(k)) for k in ("total", "external", "nullish")},
        "resources": {k: _int(res.get(k)) for k in ("total", "external")},
        "iframes": {k: _int(ifr.get(k)) for k in ("total", "hidden", "external")},
        "favicon": _str(d.get("favicon"), 2048),
        "metaRefresh": bool(d.get("metaRefresh")),
        "rightClickBlocked": bool(d.get("rightClickBlocked")),
        "textLength": _int(d.get("textLength"), hi=10_000_000),
        "scriptCount": _int(d.get("scriptCount"), hi=10_000),
    }


@dataclass
class DomAnalysis:
    features: Dict[str, float] = field(default_factory=dict)
    points: float = 0.0
    score: float = 0.0
    reasons: List[Reason] = field(default_factory=list)
    has_password: bool = False
    brand_claim: Optional[dict] = None    # {"name","where"}


def _ratio(a: int, b: int) -> float:
    return (a / b) if b else 0.0


def analyze_dom(dom_raw: Any, page: ParsedURL, db: BrandDB, trusted: bool) -> DomAnalysis:
    d = sanitize_dom(dom_raw)
    out = DomAnalysis()
    has_pw = d["passwordInputs"] > 0 or any(f["hasPassword"] for f in d["forms"])
    out.has_password = has_pw
    text, title = d["text"], d["title"].lower()

    links, res, ifr = d["links"], d["resources"], d["iframes"]
    ext_link_ratio = _ratio(links["external"], links["total"])
    null_link_ratio = _ratio(links["nullish"], links["total"])
    ext_res_ratio = _ratio(res["external"], res["total"])

    # forms
    cross_form = http_form = empty_form = mail_form = False
    for f in d["forms"]:
        act = f["action"].strip()
        if not act or act.startswith("#") or act.lower().startswith("javascript:"):
            empty_form = empty_form or f["hasPassword"]
            continue
        if act.lower().startswith("mailto:"):
            mail_form = True
            continue
        fp = parse_url(act)
        if not fp.valid:
            continue
        if fp.registrable != page.registrable:
            cross_form = cross_form or f["hasPassword"] or d["sensitiveFields"] > 0
        if fp.scheme == "http" and not fp.is_local and (f["hasPassword"] or d["sensitiveFields"] > 0):
            http_form = True

    cred_hits = sum(1 for w in CREDENTIAL_WORDS if w in text)
    urg_hits = sum(1 for w in URGENCY_WORDS if w in text)
    fav = parse_url(d["favicon"]) if d["favicon"] else None
    fav_external = bool(fav and fav.valid and fav.registrable != page.registrable)

    out.features = {
        "dom_has_password": float(has_pw),
        "dom_n_forms": float(len(d["forms"])),
        "dom_form_cross_domain": float(cross_form),
        "dom_form_http": float(http_form),
        "dom_form_empty_action": float(empty_form),
        "dom_ext_link_ratio": ext_link_ratio,
        "dom_null_link_ratio": null_link_ratio,
        "dom_ext_resource_ratio": ext_res_ratio,
        "dom_hidden_iframes": float(ifr["hidden"]),
        "dom_meta_refresh": float(d["metaRefresh"]),
        "dom_right_click_blocked": float(d["rightClickBlocked"]),
        "dom_favicon_external": float(fav_external),
        "dom_credential_words": float(cred_hits),
        "dom_urgency_words": float(urg_hits),
        "dom_sensitive_fields": float(d["sensitiveFields"]),
        "dom_text_len": float(d["textLength"]),
        "dom_script_count": float(d["scriptCount"]),
    }

    # brand claim (page says it is brand X but lives on a different domain)
    if not trusted:
        title_tokens = set(tokenize(title))
        text_tokens = tokenize(text[:3000])
        for b in db.brands:
            if page.registrable in b.domains or page.host in b.domains:
                continue
            for kw in b.keywords:
                if len(kw) < 4:
                    continue          # 'ups', 'sbi', 'dhl' are too ambiguous as plain words
                if kw in title_tokens:
                    out.brand_claim = {"name": b.name, "where": "title"}
                    break
                if out.brand_claim is None and text_tokens.count(kw) >= 4:
                    out.brand_claim = {"name": b.name, "where": "text"}
            if out.brand_claim and out.brand_claim["where"] == "title":
                break

    def add(code: str, msg: str, pts: float) -> None:
        out.reasons.append(Reason("dom", code, msg, pts))
        out.points += pts

    if trusted:
        out.score = 0.02
        return out

    if cross_form:
        add("FORM_CROSS_DOMAIN", "A form that collects credentials submits to a different domain", 4.0)
    if http_form:
        add("FORM_HTTP", "Credentials form submits over unencrypted http", 2.5)
    if mail_form:
        add("FORM_MAILTO", "Form submits via mailto:", 3.0)
    if empty_form and has_pw:
        add("FORM_EMPTY_ACTION", "Password form has an empty / script-only action", 0.8)
    if ifr["hidden"] >= 1:
        add("HIDDEN_IFRAME", f"{ifr['hidden']} hidden iframe(s)", 1.5)
    if res["total"] >= 8 and ext_res_ratio >= 0.6:
        add("EXTERNAL_RESOURCES", "Most page resources are loaded from other domains (cloned page)", 1.2)
    if links["total"] >= 5 and null_link_ratio >= 0.5:
        add("NULL_LINKS", "Most links are empty or '#' (non-functional clone)", 1.5)
    if d["metaRefresh"]:
        add("META_REFRESH", "Page auto-redirects with a meta refresh", 1.0)
    if d["rightClickBlocked"]:
        add("RIGHT_CLICK_BLOCKED", "Page disables the right-click menu", 1.0)
    if fav_external and has_pw:
        add("FAVICON_EXTERNAL", "Favicon is loaded from a different domain", 0.6)
    if has_pw and d["textLength"] < 300:
        add("THIN_LOGIN_PAGE", "Very little text around a password field", 1.0)
    if d["sensitiveFields"] > 0:
        add("SENSITIVE_FIELDS", "Asks for card / OTP / ID-number style fields", 1.5)
    if cred_hits >= 3:
        add("CREDENTIAL_TEXT", "Page text repeatedly asks for sensitive credentials", 1.2)
    if urg_hits >= 2:
        add("URGENCY_TEXT", "Urgent / threatening wording typical of phishing lures", 1.0)
    if page.shared_hosting and has_pw:
        add("PASSWORD_ON_FREE_HOST", "Password form on a free hosting platform", 2.0)
    if out.brand_claim:
        w = out.brand_claim["where"]
        pts = (4.5 if has_pw else 2.5) if w == "title" else (3.0 if has_pw else 0.0)
        if pts:
            add("BRAND_CLAIM", f"Page presents itself as {out.brand_claim['name']} ({w}) "
                               f"but is hosted on {page.registrable}", pts)
    if has_pw and not page.is_https and not page.is_local:
        add("PASSWORD_OVER_HTTP", "Password field on an unencrypted page", 1.5)

    out.score = squash(out.points, 5.0)
    return out
