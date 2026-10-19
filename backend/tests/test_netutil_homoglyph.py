import unittest

from phishguard.homoglyph import is_mixed_script, skeleton
from phishguard.netutil import levenshtein, parse_url, shannon_entropy


class ParseTests(unittest.TestCase):
    def test_registrable_domains(self):
        cases = {
            "https://www.sbi.co.in/web": "sbi.co.in",
            "https://a.b.c.example.com/x": "example.com",
            "https://evil.github.io/paypal": "evil.github.io",
            "http://localhost:8080/x": "localhost",
            "https://Accounts.Google.com/": "accounts.google.com".replace("accounts.", ""),
            "paypal.com/login": "paypal.com",
        }
        for url, reg in cases.items():
            self.assertEqual(parse_url(url).registrable, reg, url)

    def test_ip_and_userinfo(self):
        p = parse_url("http://192.168.0.1:8080/a")
        self.assertTrue(p.is_ip and p.is_local and p.port == 8080)
        self.assertFalse(parse_url("http://45.33.12.9/").is_local)
        q = parse_url("http://paypal.com@evil.com/x")
        self.assertEqual(q.host, "evil.com")
        self.assertEqual(q.userinfo, "paypal.com")

    def test_punycode_roundtrip(self):
        p = parse_url("https://xn--pypal-4ve.com")
        self.assertIn("\u0430", p.unicode_host)         # Cyrillic 'a'
        self.assertEqual(p.host, "xn--pypal-4ve.com")
        p2 = parse_url("https://p\u0430ypal.com")
        self.assertEqual(p2.host, "xn--pypal-4ve.com")

    def test_invalid(self):
        for bad in ("", "javascript:alert(1)", "http://", "ftp://x.com", "http://[::1"):
            self.assertFalse(parse_url(bad).valid, bad)

    def test_helpers(self):
        self.assertEqual(levenshtein("paypal", "paypall"), 1)
        self.assertEqual(levenshtein("", "abc"), 3)
        self.assertGreater(shannon_entropy("abcdefgh"), shannon_entropy("aaaaaaaa"))


class HomoglyphTests(unittest.TestCase):
    def test_skeletons(self):
        self.assertEqual(skeleton("p\u0430ypal"), skeleton("paypal"))   # Cyrillic a
        self.assertEqual(skeleton("paypa1"), skeleton("paypal"))
        self.assertEqual(skeleton("rnicrosoft"), skeleton("microsoft"))
        self.assertEqual(skeleton("g\u043e\u043egle"), skeleton("google"))  # Cyrillic o o
        self.assertNotEqual(skeleton("paypal"), skeleton("google"))

    def test_mixed_script(self):
        self.assertTrue(is_mixed_script("p\u0430ypal"))
        self.assertFalse(is_mixed_script("paypal"))
        self.assertFalse(is_mixed_script("\u0430\u0440\u0440\u04cf\u0435"))   # pure Cyrillic

    def test_no_brand_collisions(self):
        """Two different brand keywords must not share a skeleton (would cause false matches)."""
        import json, os
        path = os.path.join(os.path.dirname(__file__), "..", "data", "brands.json")
        with open(path, encoding="utf-8") as fh:
            brands = json.load(fh)["brands"]
        kws = [k for b in brands for k in b["keywords"] if len(k) >= 4]
        sk = {}
        for k in kws:
            sk.setdefault(skeleton(k), []).append(k)
        self.assertEqual([v for v in sk.values() if len(v) > 1], [])


if __name__ == "__main__":
    unittest.main()
