"""Flask REST API.

Endpoints
  GET  /                      playground page (paste a URL, see the analysis)
  GET  /health
  POST /v1/analyze/url        {url}                                  -> fast URL-only verdict
  POST /v1/analyze            {url, dom?, screenshot_b64?}           -> full verdict
  GET  /v1/brands             protected brands + number of visual templates
  POST /v1/brands/templates   {brand, domains?, screenshot_b64}      -> learn a visual template
  POST /v1/feedback           {url, label: phishing|safe, note?}     -> append to feedback log

Security defaults: binds to 127.0.0.1 (see run.py), optional X-API-Key
(env PHISHGUARD_API_KEY), per-IP rate limit, 8 MB body limit, CORS only for
chrome-extension:// origins.
"""
from __future__ import annotations

import json
import os
import threading
import time
from collections import defaultdict, deque
from typing import Any, Dict, Optional

from flask import Flask, jsonify, request, send_from_directory

from . import __version__
from .brands import BrandDB, TemplateStore
from .detector import Detector, Settings, UrlModel
from .netutil import parse_url
from .visual import decode_image, describe

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _load_allowlist(path: str) -> set:
    out = set()
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip().lower()
                if line and not line.startswith("#"):
                    out.add(line)
    return out


class RateLimiter:
    def __init__(self, limit: int, window: float = 60.0):
        self.limit, self.window = limit, window
        self.hits: Dict[str, deque] = defaultdict(deque)
        self.lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self.lock:
            q = self.hits[key]
            while q and now - q[0] > self.window:
                q.popleft()
            if len(q) >= self.limit:
                return False
            q.append(now)
            return True


def create_app(config: Optional[Dict[str, Any]] = None) -> Flask:
    cfg = {
        "DATA_DIR": os.environ.get("PHISHGUARD_DATA", os.path.join(BASE, "data")),
        "MODEL_PATH": os.environ.get("PHISHGUARD_MODEL", os.path.join(BASE, "models", "url_model.joblib")),
        "API_KEY": os.environ.get("PHISHGUARD_API_KEY", ""),
        "RATE_LIMIT_PER_MIN": int(os.environ.get("PHISHGUARD_RATE_LIMIT", "600")),
        "USE_ML": os.environ.get("PHISHGUARD_USE_ML", "1") == "1",
        "TEMPLATES_FILE": None,
    }
    cfg.update(config or {})
    data_dir = cfg["DATA_DIR"]
    os.makedirs(data_dir, exist_ok=True)

    app = Flask(__name__, static_folder=os.path.join(BASE, "static"), static_url_path="/static")
    app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024

    store = TemplateStore(cfg["TEMPLATES_FILE"] or os.path.join(data_dir, "templates.json"))
    db = BrandDB(os.path.join(BASE, "data", "brands.json"), store,
                 allowlist=_load_allowlist(os.path.join(data_dir, "allowlist.txt")))
    model = UrlModel.load(cfg["MODEL_PATH"]) if cfg["USE_ML"] else None
    detector = Detector(db, store, model, Settings())
    limiter = RateLimiter(cfg["RATE_LIMIT_PER_MIN"])
    fb_lock = threading.Lock()
    app.extensions["phishguard"] = detector

    # ------------------------------------------------------------------ hooks
    @app.before_request
    def _guard():
        if request.method == "OPTIONS":
            return ("", 204)
        if request.path.startswith("/v1/"):
            if cfg["API_KEY"] and request.headers.get("X-API-Key", "") != cfg["API_KEY"]:
                return jsonify(error="invalid or missing API key"), 401
            if not limiter.allow(request.remote_addr or "?"):
                return jsonify(error="rate limit exceeded"), 429
        return None

    @app.after_request
    def _cors(resp):
        origin = request.headers.get("Origin", "")
        if origin.startswith("chrome-extension://"):
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Vary"] = "Origin"
            resp.headers["Access-Control-Allow-Headers"] = "Content-Type, X-API-Key"
            resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["Cache-Control"] = "no-store"
        return resp

    @app.errorhandler(413)
    def _too_big(_e):
        return jsonify(error="payload too large"), 413

    # ----------------------------------------------------------------- helpers
    def _json() -> Dict[str, Any]:
        data = request.get_json(silent=True)
        return data if isinstance(data, dict) else {}

    def _url_or_400(data: Dict[str, Any]):
        url = data.get("url")
        if not isinstance(url, str) or not url.strip() or len(url) > 4096:
            return None, (jsonify(error="'url' (string, <= 4096 chars) is required"), 400)
        return url.strip(), None

    # ------------------------------------------------------------------ routes
    @app.get("/")
    def index():
        return send_from_directory(app.static_folder, "index.html")

    @app.get("/health")
    def health():
        return jsonify(status="ok", version=__version__, ml_model_loaded=model is not None,
                       brands=len(db.brands), visual_templates=store.count())

    @app.post("/v1/analyze/url")
    def analyze_url_ep():
        data = _json()
        url, err = _url_or_400(data)
        if err:
            return err
        return jsonify(detector.analyze(url, include_graph=bool(data.get("include_graph"))))

    @app.post("/v1/analyze")
    def analyze_ep():
        data = _json()
        url, err = _url_or_400(data)
        if err:
            return err
        shot = data.get("screenshot_b64")
        if shot is not None and not isinstance(shot, str):
            return jsonify(error="'screenshot_b64' must be a base64 string"), 400
        return jsonify(detector.analyze(url, dom=data.get("dom"), screenshot_b64=shot or None,
                                        include_graph=bool(data.get("include_graph"))))

    @app.get("/v1/brands")
    def brands_ep():
        tpl = store.templates()
        return jsonify([{"name": b.name, "domains": sorted(b.domains)[:10], "custom": b.custom,
                         "templates": len(tpl.get(b.name, []))} for b in db.brands])

    @app.post("/v1/brands/templates")
    def add_template_ep():
        data = _json()
        brand = data.get("brand")
        if not isinstance(brand, str) or not (2 <= len(brand.strip()) <= 60):
            return jsonify(error="'brand' (2-60 chars) is required"), 400
        brand = brand.strip()
        raw_domains = data.get("domains") or []
        if not isinstance(raw_domains, list) or len(raw_domains) > 20:
            return jsonify(error="'domains' must be a list (<= 20)"), 400
        domains = []
        for d in raw_domains:
            if isinstance(d, str) and d.strip() and len(d) <= 200:
                pu = parse_url(d.strip())
                if pu.valid and pu.registrable:
                    domains.append(pu.registrable)
        known = {b.name: b for b in db.brands}
        if brand not in known and not domains:
            return jsonify(error="new brands need at least one legitimate domain in 'domains'"), 400
        try:
            desc = describe(decode_image(data.get("screenshot_b64")))
        except ValueError as exc:
            return jsonify(error=str(exc)), 400
        n = store.add_template(brand, desc, domains)
        b = next(x for x in db.brands if x.name == brand)
        return jsonify(brand=brand, templates=n, domains=sorted(b.domains))

    @app.post("/v1/feedback")
    def feedback_ep():
        data = _json()
        url, err = _url_or_400(data)
        if err:
            return err
        label = data.get("label")
        if label not in ("phishing", "safe"):
            return jsonify(error="'label' must be 'phishing' or 'safe'"), 400
        p = parse_url(url)
        if not p.valid:
            return jsonify(error="unparseable url"), 400
        # privacy: keep scheme://host/path only (no query string / fragment / credentials)
        stored = f"{p.scheme}://{p.host}{p.path}"[:512]
        rec = {"ts": int(time.time()), "url": stored, "label": label,
               "note": str(data.get("note", ""))[:300]}
        with fb_lock:
            with open(os.path.join(data_dir, "feedback.jsonl"), "a", encoding="utf-8") as fh:
                fh.write(json.dumps(rec) + "\n")
        return jsonify(ok=True)

    return app
