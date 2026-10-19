"""Start the PhishGuard API.   python run.py  [--host 127.0.0.1] [--port 8000]

Uses `waitress` (pure-Python production WSGI server, works on Windows/Linux/macOS)
when installed, otherwise falls back to Flask's development server.
"""
import argparse

from phishguard.app import create_app


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()
    app = create_app()
    try:
        from waitress import serve
        print(f"PhishGuard API on http://{args.host}:{args.port}  (waitress)")
        serve(app, host=args.host, port=args.port, threads=8)
    except ImportError:
        print(f"PhishGuard API on http://{args.host}:{args.port}  (Flask dev server; pip install waitress for production)")
        app.run(host=args.host, port=args.port, threaded=True)


if __name__ == "__main__":
    main()
