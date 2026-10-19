import os
import unittest

from phishguard.brands import BrandDB, TemplateStore
from phishguard.lexical import analyze_url
from phishguard.netutil import parse_url
from phishguard.urlgraph import build_url_graph

BRANDS = os.path.join(os.path.dirname(__file__), "..", "data", "brands.json")
DB = BrandDB(BRANDS, TemplateStore(None))

PHISH = [
    "http://paypal.com.secure-login.xyz/verify",
    "https://secure-paypal-login.top",
    "https://xn--pypal-4ve.com",
    "https://paypa1-secure.com/login",
    "https://amaz0n-account-verify.com",
    "https://rnicrosoft.com/login",
    "http://paypal.com@evil.com/",
    "http://45.33.12.9/paypal/login.php",
    "https://sbi-kyc-update.in/verify",
    "https://unipune-results.top/login",
]
LEGIT = [
    "https://www.paypal.com/signin",
    "https://accounts.google.com/signin/v2",
    "https://login.microsoftonline.com/common/oauth2",
    "https://www.sbi.co.in/web/personal-banking",
    "https://www.unipune.ac.in/Syllabi",
    "https://stackoverflow.com/questions/123",
    "https://example.com",
    "https://pineapple.com",
    "https://www.wikipedia.org/wiki/Phishing",
]


class LexicalTests(unittest.TestCase):
    def test_phishing_urls_score_high(self):
        for u in PHISH:
            a = analyze_url(u, DB)
            self.assertGreaterEqual(a.score, 0.70, f"{u} -> {a.score:.2f}")

    def test_legit_urls_score_low(self):
        for u in LEGIT:
            a = analyze_url(u, DB)
            self.assertLess(a.score, 0.40, f"{u} -> {a.score:.2f}")

    def test_trusted_shortcut_and_user_content_exception(self):
        self.assertTrue(analyze_url("https://www.paypal.com/x", DB).trusted)
        self.assertFalse(analyze_url("https://sites.google.com/view/fake-bank", DB).trusted)
        self.assertFalse(analyze_url("https://evil.github.io/paypal/login", DB).trusted)

    def test_brand_kinds(self):
        kinds = {
            "https://paypal.evil-site.com/": "subdomain",
            "https://paypal-help.com/": "sld_token",
            "https://paypall.com/": "typosquat",
            "https://paypa1.com/": "homoglyph",
            "https://xn--pypal-4ve.com/": "homoglyph",
        }
        for u, k in kinds.items():
            self.assertEqual(analyze_url(u, DB).brand["kind"], k, u)

    def test_invalid_url_does_not_crash(self):
        a = analyze_url("not a url at all %%%", DB)
        self.assertIsNotNone(a.score)


class GraphTests(unittest.TestCase):
    def test_structure_and_brand_distance(self):
        p = parse_url("http://paypal.com.secure-login.xyz/verify")
        g = build_url_graph(p)
        self.assertIn("tok:paypal", g.adj)
        self.assertIn("tok:verify", g.adj)
        self.assertEqual(g.bfs("root")["tok:paypal"] > 0, True)
        a = analyze_url(p.raw, DB)
        # sld -> sub:'com' -> sub:'paypal' -> tok:paypal  (3 hops from the registrable domain)
        self.assertEqual(a.features["g_brand_dist"], 3.0)
        # brand directly inside the registrable label is only 1 hop away
        self.assertEqual(analyze_url("https://paypal-help.com", DB).features["g_brand_dist"], 1.0)

    def test_keyword_brand_adjacency(self):
        a = analyze_url("https://secure-paypal-login.top", DB)
        self.assertGreaterEqual(a.features["g_kw_brand_adjacent"], 2.0)
        b = analyze_url("https://paypal.example.org/secure", DB)
        self.assertEqual(b.features["g_kw_brand_adjacent"], 0.0)

    def test_shared_token_creates_cycle(self):
        a = analyze_url("https://paypal.evil.com/paypal/login", DB)
        self.assertGreaterEqual(a.features["g_cycles"], 1.0)


if __name__ == "__main__":
    unittest.main()
