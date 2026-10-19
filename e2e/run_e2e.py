"""End-to-end test: real Chromium + the unpacked extension + backend + demo pages.

    pip install playwright && playwright install chromium
    python e2e/run_e2e.py [--chromium /path/to/chrome]
"""
import argparse, json, os, shutil, subprocess, sys, tempfile, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXT = os.path.join(ROOT, "extension")
results = []


def check(name, ok, extra=""):
    results.append(ok)
    print(("PASS  " if ok else "FAIL  ") + name + (f"   [{extra}]" if extra else ""), flush=True)


def wait_http(url, timeout=15):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            urllib.request.urlopen(url, timeout=1).read()
            return True
        except Exception:
            time.sleep(0.3)
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chromium", default="")
    args = ap.parse_args()
    from playwright.sync_api import sync_playwright

    tmp = tempfile.mkdtemp()
    env = dict(os.environ, PHISHGUARD_DATA=os.path.join(tmp, "data"), PHISHGUARD_USE_ML="0")
    api = subprocess.Popen([sys.executable, "run.py"], cwd=os.path.join(ROOT, "backend"), env=env,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    demo = subprocess.Popen([sys.executable, os.path.join(ROOT, "demo", "serve_demo.py")],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        assert wait_http("http://127.0.0.1:8000/health"), "API did not start"
        assert wait_http("http://127.0.0.1:8080/bank/login.html"), "demo server did not start"
        with sync_playwright() as p:
            exe = args.chromium or p.chromium.executable_path
            ctx = p.chromium.launch_persistent_context(
                os.path.join(tmp, "profile"), executable_path=exe, headless=False,
                args=["--headless=new", "--no-sandbox", f"--disable-extensions-except={EXT}",
                      f"--load-extension={EXT}", "--window-size=1280,800"],
                viewport={"width": 1280, "height": 720})
            sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker", timeout=15000)
            ext_id = sw.url.split("/")[2]
            check("extension service worker started", sw.url.startswith("chrome-extension://"), ext_id)

            def state_for(page_url_prefix):
                st = sw.evaluate("chrome.storage.session.get(null)")
                for k, v in st.items():
                    if k.startswith("tab:") and v.get("url", "").startswith(page_url_prefix):
                        return v
                return None

            def wait_state(prefix, cond, timeout=12):
                t0 = time.time()
                while time.time() - t0 < timeout:
                    s = state_for(prefix)
                    if s and s.get("result") and cond(s["result"]):
                        return s["result"], time.time() - t0
                    time.sleep(0.15)
                return (state_for(prefix) or {}).get("result"), time.time() - t0

            time.sleep(2.0)                      # let the extension finish starting (as a real user would)
            page = ctx.new_page()
            # ---------- 1. benign pages -----------------------------------------
            page.goto("http://localhost:8080/blog/index.html")
            r, dt = wait_state("http://localhost:8080/blog", lambda r: r["stage"] in ("dom", "full"))
            check("benign blog page -> safe, DOM stage ran", bool(r) and r["verdict"] == "safe" and r["stage"] == "dom",
                  f"risk={r and r['risk']} stage={r and r['stage']}")
            check("no banner on benign page", page.evaluate("!document.getElementById('__phishguard_banner__')"))

            # ---------- 2. teach the brand from the REAL page ------------------
            page.goto("http://localhost:8080/bank/login.html")
            page.bring_to_front()
            time.sleep(1.0)
            reg = sw.evaluate("registerBrand('DemoBank', ['localhost'])")
            check("brand template registered from live screenshot", reg.get("templates") == 1, json.dumps(reg))

            page.goto("http://localhost:8080/bank/login.html?again=1")
            r, _ = wait_state("http://localhost:8080/bank", lambda r: r.get("trusted") is not None)
            check("real brand domain is never flagged", bool(r) and r["verdict"] == "safe", f"verdict={r and r['verdict']}")

            # ---------- 3. clone on another host -> full pipeline -----------------
            t0 = time.time()
            page.goto("http://127.0.0.1:8080/clone/login.html")
            page.bring_to_front()
            r, dt = wait_state("http://127.0.0.1:8080/clone", lambda r: r["stage"] == "full")
            check("clone detected by the FULL pipeline (URL+DOM+visual)", bool(r) and r["stage"] == "full" and r["verdict"] == "phishing",
                  f"risk={r and r['risk']} brand={r and r['brand']} visual={r and r['modules'].get('visual')}")
            if r:
                print("      reasons:", [x["code"] for x in r["reasons"]])
                print(f"      time from navigation start to final verdict: {time.time()-t0:.2f}s (incl. page load, DOM collect, screenshot, 2 API calls)")
                print("      server timing:", r["timing_ms"])
            time.sleep(1.0)
            check("high-risk clone is blocked by the warning page", "warning.html" in page.url, page.url[:90])
            if "warning.html" in page.url:
                check("warning page shows reasons", page.locator("#reasons li").count() >= 1)
                page.click("#go")
                page.wait_for_url("http://127.0.0.1:8080/clone/**", timeout=8000)
                check("'continue anyway' bypass works", page.url.startswith("http://127.0.0.1:8080/clone"))

            # ---------- 4. URL-only stage blocks before the page even loads ----------
            page2 = ctx.new_page()
            try:
                page2.goto("http://paypal.com.secure-login.xyz/verify", timeout=8000)
            except Exception:
                pass
            time.sleep(1.5)
            # (Playwright's page.url is unreliable after a failed goto, so ask Chrome itself)
            urls = sw.evaluate("chrome.tabs.query({}).then(ts => ts.map(t => t.url))")
            blocked = [u for u in urls if "warning.html" in u and "secure-login.xyz" in u]
            check("homograph/combosquat URL blocked at stage 1 (before any page content)", len(blocked) == 1, (blocked or urls)[-1][:100])

            # ---------- 5. popup reads the state -----------------------------------
            pop = ctx.new_page()
            page.bring_to_front()
            pop.goto(f"chrome-extension://{ext_id}/popup.html")
            time.sleep(0.8)
            check("popup page renders", pop.locator("#badge").count() == 1)
            ctx.close()
    finally:
        api.terminate(); demo.terminate()
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"\n{sum(results)}/{len(results)} end-to-end checks passed")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
