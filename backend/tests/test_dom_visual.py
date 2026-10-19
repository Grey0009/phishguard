import os
import unittest

from phishguard.brands import BrandDB, TemplateStore
from phishguard.dom import analyze_dom, sanitize_dom
from phishguard.netutil import parse_url
from phishguard.visual import analyze_visual, decode_image, describe, similarity

from .helpers import blog_page, dashboard_page, login_page, to_b64

BRANDS = os.path.join(os.path.dirname(__file__), "..", "data", "brands.json")


def _db():
    return BrandDB(BRANDS, TemplateStore(None))


class DomTests(unittest.TestCase):
    def test_sanitize_garbage(self):
        for junk in (None, "x", 5, [], {"forms": "no", "links": 3, "passwordInputs": "abc"}):
            d = sanitize_dom(junk)
            self.assertEqual(d["passwordInputs"], 0)
            self.assertEqual(d["forms"], [])

    def test_cross_domain_credential_form_and_brand_claim(self):
        page = parse_url("https://totally-unrelated.example.org/login")
        dom = {"title": "PayPal - Log in", "passwordInputs": 1, "textLength": 150,
               "forms": [{"action": "https://collector.biz/p", "hasPassword": True, "inputs": 2}]}
        r = analyze_dom(dom, page, _db(), trusted=False)
        codes = {x.code for x in r.reasons}
        self.assertIn("FORM_CROSS_DOMAIN", codes)
        self.assertIn("BRAND_CLAIM", codes)
        self.assertEqual(r.brand_claim["name"], "PayPal")
        self.assertGreater(r.score, 0.7)

    def test_same_domain_form_is_not_cross_domain(self):
        page = parse_url("https://myshop.example.org/login")
        dom = {"title": "My Shop sign in", "passwordInputs": 1, "textLength": 2000,
               "forms": [{"action": "https://myshop.example.org/session", "hasPassword": True, "inputs": 2}]}
        r = analyze_dom(dom, page, _db(), trusted=False)
        self.assertNotIn("FORM_CROSS_DOMAIN", {x.code for x in r.reasons})
        self.assertLess(r.score, 0.3)

    def test_legit_brand_domain_is_not_a_claim(self):
        page = parse_url("https://www.paypal.com/signin")
        dom = {"title": "PayPal - Log in", "passwordInputs": 1, "textLength": 900}
        r = analyze_dom(dom, page, _db(), trusted=False)
        self.assertIsNone(r.brand_claim)


class VisualTests(unittest.TestCase):
    def setUp(self):
        self.ref = describe(login_page())

    def test_clone_variants_exceed_strong_threshold(self):
        for name, im in {
            "identical": login_page(), "1080p": login_page(1920, 1080), "small": login_page(800, 450),
            "text changed": login_page(title="Sign in to DemoBank secure"),
            "other colours": login_page(brand=(10, 60, 150), accent=(250, 190, 60)),
            "shifted": login_page(jitter=6),
        }.items():
            sim = similarity(describe(im), self.ref)["similarity"]
            self.assertGreater(sim, 0.88, f"{name}: {sim:.3f}")

    def test_unrelated_pages_stay_below_weak_threshold(self):
        for name, im in {"blog": blog_page(), "dashboard": dashboard_page(),
                         "blank": login_page().point(lambda v: 255)}.items():
            sim = similarity(describe(im), self.ref)["similarity"]
            self.assertLess(sim, 0.78, f"{name}: {sim:.3f}")

    def test_jpeg_roundtrip_still_matches(self):
        im = decode_image(to_b64(login_page(), "JPEG", 40))
        self.assertGreater(similarity(describe(im), self.ref)["similarity"], 0.9)

    def test_analyze_visual_flags_clone_and_ignores_real_domain(self):
        db = _db()
        db.store.add_template("DemoBank", self.ref, ["demobank.example"])
        tpl = db.store.templates()
        clone = analyze_visual(login_page(title="Sign in"), parse_url("https://demobank-login.xyz"), tpl, db, False)
        self.assertEqual(clone.level, "strong")
        self.assertEqual(clone.best_brand, "DemoBank")
        real = analyze_visual(login_page(), parse_url("https://www.demobank.example"), tpl, db, False)
        self.assertEqual(real.level, "none")

    def test_bad_images_rejected(self):
        for bad in ("", "not-base64!!", "aGVsbG8="):
            with self.assertRaises(ValueError):
                decode_image(bad)


if __name__ == "__main__":
    unittest.main()
