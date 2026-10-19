"""Fusion engine: combines URL, graph, DOM, visual (and optional ML) evidence."""
from __future__ import annotations

import os
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from .brands import BrandDB, TemplateStore
from .dom import DomAnalysis, analyze_dom
from .lexical import Reason, UrlAnalysis, analyze_url
from .visual import (STRONG_MATCH, WEAK_MATCH, VisualAnalysis, analyze_visual,
                     decode_image)


@dataclass
class Settings:
    phishing_threshold: float = 0.70
    suspicious_threshold: float = 0.40
    block_threshold: float = 0.85
    w_url: float = 1.00
    w_dom: float = 0.90
    w_visual: float = 0.95
    w_ml: float = 0.60
    visual_strong: float = STRONG_MATCH
    visual_weak: float = WEAK_MATCH
    cache_size: int = 4096


class UrlModel:
    """Optional scikit-learn model trained on URL + graph features."""

    def __init__(self, bundle: dict):
        self.model = bundle["model"]
        self.names: List[str] = bundle["feature_names"]
        self.metrics = bundle.get("metrics", {})

    @classmethod
    def load(cls, path: str) -> Optional["UrlModel"]:
        if not path or not os.path.exists(path):
            return None
        try:
            import joblib
            return cls(joblib.load(path))
        except Exception:      # corrupt / incompatible sklearn version -> run without ML
            return None

    def predict(self, features: Dict[str, float]) -> float:
        x = [[float(features.get(n, 0.0)) for n in self.names]]
        return float(self.model.predict_proba(x)[0][1])


def _verdict(risk: float, s: Settings) -> str:
    if risk >= s.phishing_threshold:
        return "phishing"
    if risk >= s.suspicious_threshold:
        return "suspicious"
    return "safe"


class Detector:
    def __init__(self, db: BrandDB, store: TemplateStore, model: Optional[UrlModel] = None,
                 settings: Optional[Settings] = None):
        self.db, self.store, self.model = db, store, model
        self.s = settings or Settings()
        self._cache: "OrderedDict[tuple, UrlAnalysis]" = OrderedDict()
        self._lock = threading.Lock()

    # ---- cached URL stage ---------------------------------------------------
    def _url_stage(self, url: str) -> UrlAnalysis:
        key = (url, self.store.version)
        with self._lock:
            hit = self._cache.get(key)
            if hit is not None:
                self._cache.move_to_end(key)
                return hit
        res = analyze_url(url, self.db)
        with self._lock:
            self._cache[key] = res
            while len(self._cache) > self.s.cache_size:
                self._cache.popitem(last=False)
        return res

    # ---- main entry ---------------------------------------------------------
    def analyze(self, url: str, dom: Any = None, screenshot_b64: Optional[str] = None,
                include_graph: bool = False) -> Dict[str, Any]:
        t0 = time.perf_counter()
        timing: Dict[str, float] = {}
        ua = self._url_stage(url)
        p = ua.parsed
        timing["url_ms"] = (time.perf_counter() - t0) * 1000

        mods: Dict[str, Any] = {"url": {"score": round(ua.score, 3), "points": round(ua.points, 2)}}
        reasons: List[Reason] = list(ua.reasons)

        if ua.trusted:
            return self._pack(url, ua, 0.02, reasons, mods, None, False, "url", timing, t0, include_graph)

        parts = [("url", ua.score, self.s.w_url)]

        ml_p = None
        if self.model is not None:
            t1 = time.perf_counter()
            try:
                ml_p = self.model.predict(ua.features)
            except Exception:
                ml_p = None
            timing["ml_ms"] = (time.perf_counter() - t1) * 1000
            if ml_p is not None:
                mods["ml"] = {"probability": round(ml_p, 3)}
                parts.append(("ml", ml_p, self.s.w_ml))
                if ml_p >= 0.9:
                    reasons.append(Reason("ml", "ML_HIGH", f"ML model: {ml_p:.0%} phishing probability from URL features", 2.0))

        da: Optional[DomAnalysis] = None
        if dom is not None:
            t1 = time.perf_counter()
            da = analyze_dom(dom, p, self.db, trusted=False)
            timing["dom_ms"] = (time.perf_counter() - t1) * 1000
            mods["dom"] = {"score": round(da.score, 3), "points": round(da.points, 2),
                           "has_password": da.has_password}
            parts.append(("dom", da.score, self.s.w_dom))
            reasons += da.reasons

        va: Optional[VisualAnalysis] = None
        visual_error = None
        if screenshot_b64:
            t1 = time.perf_counter()
            try:
                im = decode_image(screenshot_b64)
                va = analyze_visual(im, p, self.store.templates(), self.db, trusted=False,
                                    strong=self.s.visual_strong, weak=self.s.visual_weak)
            except ValueError as exc:
                visual_error = str(exc)
            timing["visual_ms"] = (time.perf_counter() - t1) * 1000
            if va is not None:
                mods["visual"] = {"score": round(va.score, 3), "best_brand": va.best_brand,
                                  "similarity": va.similarity, "level": va.level, **va.details}
                parts.append(("visual", va.score, self.s.w_visual))
                reasons += va.reasons
            else:
                mods["visual"] = {"error": visual_error}

        # ---- noisy-OR fusion
        keep = 1.0
        for _, s, w in parts:
            keep *= (1.0 - w * max(0.0, min(1.0, s)))
        risk = 1.0 - keep

        # ---- brand-evidence rules ("explainable overrides")
        url_strong = bool(ua.brand and ua.brand["kind"] in ("homoglyph", "subdomain", "typosquat", "sld_token"))
        dom_claim = bool(da and da.brand_claim)
        vis_strong = bool(va and va.level == "strong")
        vis_weak = bool(va and va.level == "weak")
        n_evidence = int(url_strong) + int(dom_claim) + int(vis_strong or vis_weak)
        has_pw = bool(da and da.has_password)
        floor = 0.0
        if has_pw:
            if vis_strong or n_evidence >= 2:
                floor = 0.90
            elif n_evidence == 1:
                floor = 0.60
        else:
            if vis_strong or n_evidence >= 2:
                floor = 0.80
        if floor > risk:
            reasons.append(Reason("fusion", "BRAND_EVIDENCE",
                                  f"{n_evidence} independent brand-impersonation signal(s)"
                                  + (" + credential form" if has_pw else ""), 0.0))
            risk = floor

        brand = None
        if va and va.best_brand and va.level != "none":
            brand = va.best_brand
        elif da and da.brand_claim:
            brand = da.brand_claim["name"]
        elif ua.brand:
            brand = ua.brand["name"]

        need_shot = bool(
            dom is not None and not screenshot_b64 and self.store.count() > 0
            and (has_pw or (da and da.features.get("dom_sensitive_fields", 0) > 0) or dom_claim)
            and risk < 0.90
        )
        stage = "full" if va is not None else ("dom" if da is not None else "url")
        return self._pack(url, ua, risk, reasons, mods, brand, need_shot, stage, timing, t0, include_graph)

    # ---- helpers --------------------------------------------------------------
    def _pack(self, url: str, ua: UrlAnalysis, risk: float, reasons: List[Reason], mods: dict,
              brand: Optional[str], need_shot: bool, stage: str, timing: dict, t0: float,
              include_graph: bool) -> Dict[str, Any]:
        p = ua.parsed
        ordered = sorted(reasons, key=lambda r: -r.points)
        timing["total_ms"] = (time.perf_counter() - t0) * 1000
        out: Dict[str, Any] = {
            "url": url,
            "host": p.host,
            "registrable_domain": p.registrable,
            "risk": round(risk, 3),
            "verdict": _verdict(risk, self.s),
            "trusted": ua.trusted,
            "brand": brand,
            "stage": stage,
            "reasons": [r.to_dict() for r in ordered[:10]],
            "modules": mods,
            "request_screenshot": need_shot,
            "timing_ms": {k: round(v, 2) for k, v in timing.items()},
        }
        if include_graph and ua.graph is not None:
            out["graph"] = ua.graph.to_dict()
        return out
