"""Latency benchmark of the analysis pipeline (in-process, no network).   python tools/benchmark.py"""
import os, statistics, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from phishguard.app import BASE
from phishguard.brands import BrandDB, TemplateStore
from phishguard.detector import Detector
from phishguard.train import generate
from phishguard.visual import describe, decode_image


def pct(xs, q):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(q * len(xs)))]


def report(name, xs):
    print(f"{name:34s} mean {statistics.mean(xs):7.2f} ms   p95 {pct(xs, .95):7.2f} ms   p99 {pct(xs, .99):7.2f} ms   (n={len(xs)})")


db = BrandDB(os.path.join(BASE, "data", "brands.json"), TemplateStore(None))
det = Detector(db, db.store)
urls = [u for u, _ in generate(2000, seed=3)]
xs = []
for u in urls:                                         # every URL unique -> no cache hits
    t = time.perf_counter(); det.analyze(u); xs.append((time.perf_counter() - t) * 1000)
report("URL + lexical graph + homoglyph", xs)

dom = {"title": "Sign in", "text": "password " * 50, "textLength": 900, "passwordInputs": 1,
       "forms": [{"action": "https://x.example/p", "hasPassword": True, "inputs": 2}],
       "links": {"total": 40, "external": 10, "nullish": 3}, "resources": {"total": 30, "external": 5}}
xs = []
for i in range(1000):
    t = time.perf_counter(); det.analyze(f"https://site{i}.example.org/login", dom=dom); xs.append((time.perf_counter() - t) * 1000)
report("URL + DOM", xs)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/..")
from tests.helpers import login_page, to_b64
shot = to_b64(login_page(480, 270), "JPEG", 70)
det.store.add_template("DemoBank", describe(login_page()), ["demobank.example"])
print(f"screenshot payload (480px JPEG): {len(shot) * 3 // 4 / 1024:.1f} KB")
xs = []
for i in range(300):
    t = time.perf_counter(); decode_image(shot); xs.append((time.perf_counter() - t) * 1000)
report("  decode JPEG", xs)
xs = []
im = decode_image(shot)
for i in range(300):
    t = time.perf_counter(); describe(im); xs.append((time.perf_counter() - t) * 1000)
report("  descriptor (pHash/dHash/layout/hist)", xs)
xs = []
for i in range(300):
    t = time.perf_counter(); det.analyze(f"https://site{i}.example.org/login", dom=dom, screenshot_b64=shot); xs.append((time.perf_counter() - t) * 1000)
report("URL + DOM + screenshot (full)", xs)
