"""Protected-brand database + persistent store for visual brand templates."""
from __future__ import annotations

import json
import os
import re
import threading
import time
from dataclasses import dataclass
from typing import Dict, List, Optional

from .netutil import USER_CONTENT_HOSTS, ParsedURL


@dataclass(frozen=True)
class Brand:
    name: str
    keywords: tuple
    domains: frozenset
    custom: bool = False


class TemplateStore:
    """JSON-file store holding user-registered brands and visual templates.

    {"brands": {name: {"keywords": [...], "domains": [...]}},
     "templates": {name: [descriptor, ...]}}
    """

    def __init__(self, path: Optional[str] = None):
        self.path = path
        self._lock = threading.RLock()
        self.version = 0
        self.data: Dict[str, dict] = {"brands": {}, "templates": {}}
        if path and os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as fh:
                    loaded = json.load(fh)
                self.data["brands"] = loaded.get("brands", {})
                self.data["templates"] = loaded.get("templates", {})
            except (OSError, ValueError):
                pass  # start empty if the file is corrupt

    def _save(self) -> None:
        if not self.path:
            return
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(self.data, fh)
        os.replace(tmp, self.path)

    def add_template(self, brand: str, descriptor: dict, domains: Optional[List[str]] = None,
                     max_per_brand: int = 20) -> int:
        with self._lock:
            b = self.data["brands"].setdefault(brand, {"keywords": [], "domains": []})
            key = re.sub(r"[^a-z0-9]", "", brand.lower())   # "Demo Bank" -> "demobank"
            if len(key) >= 4 and key not in b["keywords"]:
                b["keywords"].append(key)
            for d in domains or []:
                d = d.strip().lower()
                if d and d not in b["domains"]:
                    b["domains"].append(d)
            lst = self.data["templates"].setdefault(brand, [])
            descriptor = dict(descriptor, added=int(time.time()))
            lst.append(descriptor)
            if len(lst) > max_per_brand:
                del lst[0]
            self.version += 1
            self._save()
            return len(lst)

    def templates(self) -> Dict[str, List[dict]]:
        with self._lock:
            return {k: list(v) for k, v in self.data["templates"].items()}

    def count(self) -> int:
        with self._lock:
            return sum(len(v) for v in self.data["templates"].values())

    def custom_brands(self) -> Dict[str, dict]:
        with self._lock:
            return json.loads(json.dumps(self.data["brands"]))


class BrandDB:
    def __init__(self, static_path: str, store: Optional[TemplateStore] = None,
                 allowlist: Optional[set] = None):
        with open(static_path, "r", encoding="utf-8") as fh:
            raw = json.load(fh)["brands"]
        self._static = [
            Brand(b["name"], tuple(k.lower() for k in b["keywords"]),
                  frozenset(d.lower() for d in b["domains"]))
            for b in raw
        ]
        self.store = store
        self.allowlist = set(allowlist or [])
        self._cache_version = -1
        self._brands: List[Brand] = []

    @property
    def brands(self) -> List[Brand]:
        v = self.store.version if self.store else 0
        if v != self._cache_version:
            brands = list(self._static)
            if self.store:
                static_names = {b.name for b in self._static}
                for name, info in self.store.custom_brands().items():
                    if name in static_names:
                        # merge extra domains into static brand
                        idx = next(i for i, b in enumerate(brands) if b.name == name)
                        old = brands[idx]
                        brands[idx] = Brand(old.name, old.keywords,
                                            old.domains | frozenset(info.get("domains", [])))
                    else:
                        brands.append(Brand(name, tuple(info.get("keywords", [])),
                                            frozenset(info.get("domains", [])), custom=True))
            self._brands = brands
            self._cache_version = v
        return self._brands

    def legit_brand(self, p: ParsedURL) -> Optional[Brand]:
        """Brand whose legitimate domain this URL belongs to (None if not / user-content host)."""
        if p.is_ip or not p.registrable:
            # custom brands may legitimately live on localhost for demos
            if not (p.is_local and p.host == "localhost"):
                return None
        if p.host in USER_CONTENT_HOSTS:
            return None
        key = p.registrable if p.registrable else p.host
        for b in self.brands:
            if key in b.domains or p.host in b.domains:
                return b
        return None

    def is_allowlisted(self, p: ParsedURL) -> bool:
        return bool(p.registrable) and p.registrable in self.allowlist and p.host not in USER_CONTENT_HOSTS

    def keyword_index(self) -> Dict[str, Brand]:
        idx: Dict[str, Brand] = {}
        for b in self.brands:
            for k in b.keywords:
                idx.setdefault(k, b)
        return idx
