"""Serve the demo pages:  python demo/serve_demo.py   (port 8080)

  legit page :  http://localhost:8080/bank/login.html      <- the "real" DemoBank (registered as the brand)
  clone page :  http://127.0.0.1:8080/clone/login.html     <- same server, different host => different domain
  benign page:  http://localhost:8080/blog/index.html
"""
import functools
import http.server
import os
import socketserver

ROOT = os.path.dirname(os.path.abspath(__file__))
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(("127.0.0.1", 8080), handler) as srv:
    print("Demo pages on http://localhost:8080  (Ctrl+C to stop)")
    srv.serve_forever()
