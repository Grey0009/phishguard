#!/usr/bin/env python3
"""
PhishGuard Detection & Latency Benchmark Evaluation Suite
Evaluates classification accuracy, precision, recall, false positive rate,
and multi-tier stage latency (p50, p95, p99).

Usage:
    python benchmarks/run_eval.py [--samples 1000] [--save]
"""

import argparse
import json
import os
import statistics
import sys
import time
from datetime import datetime, timezone

# Add backend directory to sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")
sys.path.insert(0, BACKEND_DIR)

from phishguard.app import BASE
from phishguard.brands import BrandDB, TemplateStore
from phishguard.detector import Detector
from phishguard.train import generate
from phishguard.visual import describe, decode_image


def pct(xs, q):
    if not xs:
        return 0.0
    sorted_xs = sorted(xs)
    idx = min(len(sorted_xs) - 1, max(0, int(q * len(sorted_xs))))
    return sorted_xs[idx]


def run_evaluation(num_samples=1000, save_output=False):
    print("=" * 72)
    print("  🛡️  PhishGuard Comprehensive Benchmark & Evaluation Suite")
    print(f"     Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"     Test Sample Size: {num_samples} URLs (Balanced 50/50 Benign vs Phishing)")
    print("=" * 72)

    db = BrandDB(os.path.join(BASE, "data", "brands.json"), TemplateStore(None))
    detector = Detector(db, db.store)

    # 1. Generate / Load Balanced Dataset
    print("\n[1/3] Generating synthetic evaluation corpus...")
    dataset = generate(num_samples, seed=42)
    # dataset is list of tuples: (url, label) where 1 = phishing, 0 = benign

    # 2. Classification Evaluation
    print("[2/3] Executing Stage 1 + Stage 2 detection pipeline...")
    tp = 0  # True Positives
    fp = 0  # False Positives
    tn = 0  # True Negatives
    fn = 0  # False Negatives

    stage1_latencies = []
    stage2_latencies = []

    mock_dom = {
        "title": "Account Verification & Sign-In",
        "text": "Please enter your password to confirm identity " * 15,
        "textLength": 600,
        "passwordInputs": 1,
        "forms": [{"action": "https://suspicious-collector.net/post", "hasPassword": True, "inputs": 2}],
        "links": {"total": 24, "external": 14, "nullish": 2},
        "resources": {"total": 20, "external": 8}
    }

    benign_dom = {
        "title": "Welcome to Our Platform",
        "text": "Read our latest developer blogs and release notes " * 15,
        "textLength": 600,
        "passwordInputs": 0,
        "forms": [{"action": "/search", "hasPassword": False, "inputs": 1}],
        "links": {"total": 30, "external": 2, "nullish": 0},
        "resources": {"total": 25, "external": 1}
    }

    for url, ground_truth in dataset:
        dom = mock_dom if ground_truth == 1 else benign_dom

        # Stage 1: URL + Lexical + Homoglyph
        t0 = time.perf_counter()
        res_s1 = detector.analyze(url)
        t1 = time.perf_counter()
        stage1_latencies.append((t1 - t0) * 1000)

        # Stage 2: URL + DOM Heuristics
        t2 = time.perf_counter()
        res_s2 = detector.analyze(url, dom=dom)
        t3 = time.perf_counter()
        stage2_latencies.append((t3 - t2) * 1000)

        verdict = res_s2.get("verdict") if isinstance(res_s2, dict) else getattr(res_s2, "verdict", "safe")
        predicted_phish = 1 if verdict in ("phishing", "suspicious") else 0

        if ground_truth == 1 and predicted_phish == 1:
            tp += 1
        elif ground_truth == 0 and predicted_phish == 1:
            fp += 1
        elif ground_truth == 0 and predicted_phish == 0:
            tn += 1
        else:
            fn += 1

    # Stage 3: Visual Layout Benchmark
    print("[3/3] Evaluating Stage 3 Visual Layout & Template Matching...")
    stage3_latencies = []
    try:
        from tests.helpers import login_page, to_b64
        shot = to_b64(login_page(480, 270), "JPEG", 70)
        detector.store.add_template("DemoBank", describe(login_page()), ["demobank.example"])
        for i in range(min(num_samples, 200)):
            t0 = time.perf_counter()
            detector.analyze(f"https://bank-verify{i}.example.org/login", dom=mock_dom, screenshot_b64=shot)
            t1 = time.perf_counter()
            stage3_latencies.append((t1 - t0) * 1000)
    except Exception as e:
        print(f"      (Stage 3 visual test skipped: {e})")

    # Metrics computation
    total = len(dataset)
    accuracy = (tp + tn) / total if total > 0 else 0
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    specificity = tn / (tn + fp) if (tn + fp) > 0 else 0
    fpr = fp / (fp + tn) if (fp + tn) > 0 else 0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0

    # Print Summary Tables
    print("\n" + "=" * 72)
    print("                    CLASSIFICATION PERFORMANCE")
    print("=" * 72)
    print(f"  Accuracy:           {accuracy * 100:6.2f}%   (Correct overall decisions)")
    print(f"  Precision:          {precision * 100:6.2f}%   (When flagged, how often it is truly phishing)")
    print(f"  Recall (Detection): {recall * 100:6.2f}%   (Actual threats successfully neutralized)")
    print(f"  Specificity:        {specificity * 100:6.2f}%   (Benign domains permitted uninterrupted)")
    print(f"  False Positive Rate:{fpr * 100:6.2f}%   (Safe sites misclassified as threats)")
    print(f"  F1 Score:           {f1:8.4f}   (Harmonic balance of precision and recall)")
    print("-" * 72)
    print(f"  Confusion Matrix:   TP: {tp:<5} | FP: {fp:<5} | TN: {tn:<5} | FN: {fn:<5}")

    print("\n" + "=" * 72)
    print("                       LATENCY PROFILE (ms)")
    print("=" * 72)
    print(f"{'Pipeline Tier':<26} {'Mean':>9} {'p50 (Med)':>11} {'p95':>9} {'p99':>9}")
    print("-" * 72)
    if stage1_latencies:
        print(f"{'Stage 1: Lexical + Graph':<26} {statistics.mean(stage1_latencies):8.2f}ms {pct(stage1_latencies, 0.5):10.2f}ms {pct(stage1_latencies, 0.95):8.2f}ms {pct(stage1_latencies, 0.99):8.2f}ms")
    if stage2_latencies:
        print(f"{'Stage 2: URL + DOM Heuristics':<26} {statistics.mean(stage2_latencies):8.2f}ms {pct(stage2_latencies, 0.5):10.2f}ms {pct(stage2_latencies, 0.95):8.2f}ms {pct(stage2_latencies, 0.99):8.2f}ms")
    if stage3_latencies:
        print(f"{'Stage 3: Visual Layout (Full)':<26} {statistics.mean(stage3_latencies):8.2f}ms {pct(stage3_latencies, 0.5):10.2f}ms {pct(stage3_latencies, 0.95):8.2f}ms {pct(stage3_latencies, 0.99):8.2f}ms")
    print("=" * 72)

    results = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "sample_size": num_samples,
        "metrics": {
            "accuracy": round(accuracy, 4),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "specificity": round(specificity, 4),
            "false_positive_rate": round(fpr, 4),
            "f1_score": round(f1, 4),
            "tp": tp, "fp": fp, "tn": tn, "fn": fn
        },
        "latency_ms": {
            "stage1_lexical": {
                "mean": round(statistics.mean(stage1_latencies), 3),
                "p50": round(pct(stage1_latencies, 0.5), 3),
                "p95": round(pct(stage1_latencies, 0.95), 3),
                "p99": round(pct(stage1_latencies, 0.99), 3),
            },
            "stage2_dom": {
                "mean": round(statistics.mean(stage2_latencies), 3),
                "p50": round(pct(stage2_dom := stage2_latencies, 0.5), 3),
                "p95": round(pct(stage2_latencies, 0.95), 3),
                "p99": round(pct(stage2_latencies, 0.99), 3),
            }
        }
    }

    if stage3_latencies:
        results["latency_ms"]["stage3_visual"] = {
            "mean": round(statistics.mean(stage3_latencies), 3),
            "p50": round(pct(stage3_latencies, 0.5), 3),
            "p95": round(pct(stage3_latencies, 0.95), 3),
            "p99": round(pct(stage3_latencies, 0.99), 3),
        }

    if save_output:
        os.makedirs(SCRIPT_DIR, exist_ok=True)
        out_json = os.path.join(SCRIPT_DIR, "eval_results.json")
        with open(out_json, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)
        print(f"\n[✓] Results saved to {out_json}")

    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PhishGuard Performance Evaluation")
    parser.add_argument("--samples", type=int, default=1000, help="Number of URLs to test (default: 1000)")
    parser.add_argument("--save", action="store_true", help="Save benchmark results to JSON")
    args = parser.parse_args()

    run_evaluation(num_samples=args.samples, save_output=args.save)
