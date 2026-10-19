"""Register a visual brand template from a screenshot file (no browser needed).

    python tools/add_template.py --brand PayPal --image paypal_login.png
    python tools/add_template.py --brand "My Bank" --domains mybank.com mybank.co.in --image bank.png

Take the screenshot of the REAL login page (viewport only, ~1280x720 is fine).
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from PIL import Image  # noqa: E402

from phishguard.app import BASE  # noqa: E402
from phishguard.brands import BrandDB, TemplateStore  # noqa: E402
from phishguard.netutil import parse_url  # noqa: E402
from phishguard.visual import describe  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--brand", required=True)
    ap.add_argument("--image", required=True)
    ap.add_argument("--domains", nargs="*", default=[])
    ap.add_argument("--data-dir", default=os.path.join(BASE, "data"))
    args = ap.parse_args()

    store = TemplateStore(os.path.join(args.data_dir, "templates.json"))
    db = BrandDB(os.path.join(BASE, "data", "brands.json"), store)
    domains = [parse_url(d).registrable for d in args.domains if parse_url(d).valid]
    if args.brand not in {b.name for b in db.brands} and not domains:
        sys.exit("new brand: pass at least one legitimate domain with --domains")
    n = store.add_template(args.brand, describe(Image.open(args.image).convert("RGB")), domains)
    print(f"saved template #{n} for {args.brand}")


if __name__ == "__main__":
    main()
