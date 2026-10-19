import json
import os
import shutil
import tempfile
import unittest

from phishguard.app import create_app

from .helpers import blog_page, login_page, to_b64


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.app = create_app({"DATA_DIR": self.tmp, "USE_ML": False})
        self.c = self.app.test_client()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_health_and_playground(self):
        self.assertEqual(self.c.get("/health").json["status"], "ok")
        resp = self.c.get("/")
        self.assertIn(b"PhishGuard playground", resp.data)
        resp.close()

    def test_url_endpoint_and_validation(self):
        r = self.c.post("/v1/analyze/url", json={"url": "http://paypal.com.secure-login.xyz/verify"}).json
        self.assertEqual(r["verdict"], "phishing")
        self.assertEqual(r["brand"], "PayPal")
        self.assertEqual(self.c.post("/v1/analyze/url", json={}).status_code, 400)
        self.assertEqual(self.c.post("/v1/analyze/url", data="nonsense").status_code, 400)
        self.assertEqual(self.c.post("/v1/analyze/url", json={"url": "x" * 5000}).status_code, 400)

    def test_trusted_domain_is_safe(self):
        r = self.c.post("/v1/analyze/url", json={"url": "https://www.paypal.com/signin"}).json
        self.assertEqual((r["verdict"], r["trusted"]), ("safe", True))

    def test_garbage_dom_does_not_crash(self):
        r = self.c.post("/v1/analyze", json={"url": "https://x.example.org", "dom": "garbage"})
        self.assertEqual(r.status_code, 200)

    def test_api_key_enforced(self):
        app = create_app({"DATA_DIR": self.tmp, "USE_ML": False, "API_KEY": "s3cret"})
        c = app.test_client()
        self.assertEqual(c.post("/v1/analyze/url", json={"url": "https://a.com"}).status_code, 401)
        ok = c.post("/v1/analyze/url", json={"url": "https://a.com"}, headers={"X-API-Key": "s3cret"})
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(c.get("/health").status_code, 200)       # health stays open

    def test_rate_limit(self):
        app = create_app({"DATA_DIR": self.tmp, "USE_ML": False, "RATE_LIMIT_PER_MIN": 5})
        c = app.test_client()
        codes = [c.post("/v1/analyze/url", json={"url": "https://a.com"}).status_code for _ in range(7)]
        self.assertEqual(codes[:5], [200] * 5)
        self.assertEqual(codes[5:], [429, 429])

    def test_cors_only_for_extensions(self):
        r = self.c.post("/v1/analyze/url", json={"url": "https://a.com"}, headers={"Origin": "chrome-extension://abc"})
        self.assertEqual(r.headers.get("Access-Control-Allow-Origin"), "chrome-extension://abc")
        r2 = self.c.post("/v1/analyze/url", json={"url": "https://a.com"}, headers={"Origin": "https://evil.com"})
        self.assertIsNone(r2.headers.get("Access-Control-Allow-Origin"))

    def test_feedback_strips_query_and_credentials(self):
        r = self.c.post("/v1/feedback", json={"url": "https://u:p@site.example/a/b?token=SECRET#frag", "label": "safe"})
        self.assertEqual(r.status_code, 200)
        with open(os.path.join(self.tmp, "feedback.jsonl")) as fh:
            rec = json.loads(fh.readline())
        self.assertEqual(rec["url"], "https://site.example/a/b")
        self.assertEqual(self.c.post("/v1/feedback", json={"url": "https://a.com", "label": "maybe"}).status_code, 400)

    def test_full_visual_clone_flow(self):
        """Register a brand template, then see a clone on another domain flagged end-to-end."""
        reg = self.c.post("/v1/brands/templates", json={
            "brand": "DemoBank", "domains": ["https://www.demobank.example/login"],
            "screenshot_b64": to_b64(login_page())})
        self.assertEqual(reg.status_code, 200, reg.data)
        self.assertIn("demobank.example", reg.json["domains"])
        # new brand without domains is refused
        self.assertEqual(self.c.post("/v1/brands/templates", json={
            "brand": "Other", "screenshot_b64": to_b64(login_page())}).status_code, 400)

        # --- ambiguous page: title claims the brand, but nothing else is conclusive yet
        url = "https://client-portal.example.net/login"
        dom = {"title": "DemoBank - Sign in", "passwordInputs": 1, "textLength": 900,
               "forms": [{"action": "https://client-portal.example.net/session", "hasPassword": True, "inputs": 2}]}
        stage2 = self.c.post("/v1/analyze", json={"url": url, "dom": dom}).json
        self.assertTrue(stage2["request_screenshot"])           # server asks for a screenshot
        self.assertLess(stage2["risk"], 0.9)
        full = self.c.post("/v1/analyze", json={"url": url, "dom": dom,
                                                "screenshot_b64": to_b64(login_page(title="Sign in"))}).json
        self.assertEqual(full["verdict"], "phishing")
        self.assertGreaterEqual(full["risk"], 0.9)
        self.assertEqual(full["modules"]["visual"]["level"], "strong")
        self.assertEqual(full["stage"], "full")

        # --- conclusive page: server does NOT ask for a screenshot (saves bandwidth + privacy)
        loud = {"title": "DemoBank - Sign in", "passwordInputs": 1, "textLength": 150,
                "forms": [{"action": "https://collector.biz/p", "hasPassword": True, "inputs": 2}]}
        r = self.c.post("/v1/analyze", json={"url": "https://demobank-secure.example.net/login", "dom": loud}).json
        self.assertGreaterEqual(r["risk"], 0.9)
        self.assertFalse(r["request_screenshot"])

        # unrelated look on the same domain: no visual match
        other = self.c.post("/v1/analyze", json={"url": "https://blog.example.net/post", "dom": {"title": "Blog"},
                                                 "screenshot_b64": to_b64(blog_page())}).json
        self.assertEqual(other["modules"]["visual"]["level"], "none")
        self.assertEqual(other["verdict"], "safe")
        # the real site is never flagged against its own template
        real = self.c.post("/v1/analyze", json={"url": "https://www.demobank.example/login", "dom": dom,
                                                "screenshot_b64": to_b64(login_page())}).json
        self.assertEqual(real["verdict"], "safe")

    def test_bad_screenshot_is_reported_not_fatal(self):
        r = self.c.post("/v1/analyze", json={"url": "https://x.example.org", "dom": {}, "screenshot_b64": "AAAA"})
        self.assertEqual(r.status_code, 200)
        self.assertIn("error", r.json["modules"]["visual"])


if __name__ == "__main__":
    unittest.main()
