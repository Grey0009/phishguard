"""Train the optional URL+graph ML model.

    python -m phishguard.train --csv data/urls.csv            # real data: columns url,label (1 = phishing)
    python -m phishguard.train --synthetic 6000               # DEMO ONLY: generated URLs

IMPORTANT: the synthetic generator only exists so the pipeline can be run
end-to-end without internet.  Its metrics are NOT a research result because
the generator and the features share the same ideas.  For the report use real
data, e.g. PhishTank / OpenPhish (label 1) + Tranco top-sites (label 0), and a
GROUPED split by registrable domain (done below) to avoid leakage.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import random
from typing import List, Tuple

from .app import BASE
from .brands import BrandDB, TemplateStore
from .lexical import analyze_url

WORDS = ["river", "stone", "cloud", "pixel", "garden", "market", "solar", "metro", "coffee", "travel",
         "books", "studio", "health", "sports", "movies", "music", "photo", "recipes", "nature", "daily",
         "campus", "career", "finance", "design", "energy", "learn", "shop", "news", "city", "farm"]
TLDS_GOOD = ["com", "org", "net", "in", "co.in", "edu", "io", "ac.in", "gov.in"]
TLDS_BAD = ["xyz", "top", "tk", "click", "icu", "buzz", "cfd", "sbs", "ml", "ga"]
PATHS_GOOD = ["", "/", "/about", "/blog/2024/post", "/products/item-123", "/docs/getting-started",
              "/courses/python", "/news/today", "/contact", "/search?q=books"]
KW = ["login", "verify", "secure", "account", "update", "confirm", "banking", "wallet", "kyc", "billing"]


def _brand_tokens(db: BrandDB) -> List[Tuple[str, str]]:
    return [(b.keywords[0], sorted(b.domains)[0]) for b in db.brands if len(b.keywords[0]) >= 5]


def generate(n: int, seed: int = 7) -> List[Tuple[str, int]]:
    rnd = random.Random(seed)
    db = BrandDB(os.path.join(BASE, "data", "brands.json"), TemplateStore(None))
    brands = _brand_tokens(db)
    rows: List[Tuple[str, int]] = []

    def word() -> str:
        return rnd.choice(WORDS)

    def rand_str(k: int) -> str:
        return "".join(rnd.choice("abcdefghijklmnopqrstuvwxyz0123456789") for _ in range(k))

    for _ in range(n // 2):                                    # ---- benign
        r = rnd.random()
        if r < 0.25:
            bt, dom = rnd.choice(brands)
            url = f"https://{rnd.choice(['www.', 'accounts.', 'login.', ''])}{dom}{rnd.choice(PATHS_GOOD + ['/signin', '/login'])}"
        else:
            host = word() + rnd.choice(["", "-" + word(), word()]) + "." + rnd.choice(TLDS_GOOD)
            if rnd.random() < 0.3:
                host = "www." + host
            url = f"{rnd.choice(['https', 'https', 'http'])}://{host}{rnd.choice(PATHS_GOOD)}"
        rows.append((url, 0))

    for _ in range(n - n // 2):                                # ---- phishing
        bt, dom = rnd.choice(brands)
        kind = rnd.randrange(10)
        kw1, kw2 = rnd.choice(KW), rnd.choice(KW)
        bad = rnd.choice(TLDS_BAD)
        if kind == 0:
            url = f"http://{bt}.com.{kw1}-{word()}.{bad}/{kw2}"
        elif kind == 1:
            url = f"https://{kw1}-{bt}-{kw2}.{rnd.choice(TLDS_BAD + ['com', 'net'])}/"
        elif kind == 2:
            leet = bt.replace("a", "4", 1) if rnd.random() < .3 else bt.replace("l", "1", 1).replace("o", "0", 1)
            url = f"https://{leet}-{kw1}.com/{kw2}"
        elif kind == 3:
            url = f"http://{rnd.randint(11, 223)}.{rnd.randint(0, 255)}.{rnd.randint(0, 255)}.{rnd.randint(1, 254)}/{bt}/{kw1}.php"
        elif kind == 4:
            i = rnd.randrange(len(bt))
            typo = bt[:i] + bt[i] + bt[i:]                          # doubled letter
            url = f"https://{typo}.com/{kw1}"
        elif kind == 5:
            url = f"https://{word()}{rnd.randint(10, 99)}.{rnd.choice(['github.io', 'web.app', 'netlify.app', 'pages.dev'])}/{bt}/{kw1}"
        elif kind == 6:
            url = f"http://{kw1}.{bt}.{kw2}.{word()}.{rand_str(8)}.{bad}/index.html"
        elif kind == 7:
            url = f"https://{rnd.choice(['bit.ly', 'tinyurl.com', 'cutt.ly'])}/{rand_str(7)}"
        elif kind == 8:
            url = f"https://{bt}.com@{rand_str(9)}.{bad}/{kw1}"
        else:                                                       # brand-less, DGA-like
            url = f"http://{rand_str(rnd.randint(10, 16))}.{bad}/{kw1}/{kw2}?id={rand_str(10)}"
        rows.append((url, 1))
    rnd.shuffle(rows)
    return rows


def load_csv(path: str) -> List[Tuple[str, int]]:
    rows = []
    with open(path, newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            rows.append((r["url"].strip(), int(r["label"])))
    return rows


def main() -> None:
    import joblib
    import numpy as np
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.metrics import (confusion_matrix, f1_score, precision_score,
                                 recall_score, roc_auc_score)
    from sklearn.model_selection import GroupShuffleSplit

    ap = argparse.ArgumentParser()
    ap.add_argument("--csv")
    ap.add_argument("--synthetic", type=int, default=0)
    ap.add_argument("--out", default=os.path.join(BASE, "models", "url_model.joblib"))
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()
    if not args.csv and not args.synthetic:
        ap.error("give --csv FILE or --synthetic N")
    rows = load_csv(args.csv) if args.csv else generate(args.synthetic)

    db = BrandDB(os.path.join(BASE, "data", "brands.json"), TemplateStore(None))
    feats, y, groups = [], [], []
    for url, label in rows:
        a = analyze_url(url, db)
        if not a.parsed.valid:
            continue
        feats.append(a.features)
        y.append(label)
        groups.append(a.parsed.registrable)
    names = sorted(feats[0].keys())
    X = np.array([[f.get(n, 0.0) for n in names] for f in feats], dtype=float)
    y = np.array(y)

    gss = GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=args.seed)
    tr, te = next(gss.split(X, y, groups))
    clf = HistGradientBoostingClassifier(max_depth=6, learning_rate=0.08, max_iter=250, random_state=args.seed)
    clf.fit(X[tr], y[tr])
    prob = clf.predict_proba(X[te])[:, 1]
    pred = (prob >= 0.5).astype(int)
    tn, fp, fn, tp = confusion_matrix(y[te], pred).ravel()
    metrics = {
        "n_train": int(len(tr)), "n_test": int(len(te)),
        "precision": round(float(precision_score(y[te], pred)), 4),
        "recall": round(float(recall_score(y[te], pred)), 4),
        "f1": round(float(f1_score(y[te], pred)), 4),
        "roc_auc": round(float(roc_auc_score(y[te], prob)), 4),
        "false_positive_rate": round(float(fp / max(1, fp + tn)), 4),
        "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        "data_source": args.csv or f"synthetic:{args.synthetic}",
        "split": "grouped by registrable domain",
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    joblib.dump({"model": clf, "feature_names": names, "metrics": metrics}, args.out)
    with open(os.path.splitext(args.out)[0] + "_metrics.json", "w") as fh:
        json.dump(metrics, fh, indent=2)
    print(json.dumps(metrics, indent=2))
    print("saved ->", args.out)


if __name__ == "__main__":
    main()
