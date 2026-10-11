#!/usr/bin/env python3
"""Local dev server for FloFileTransfer.

Serves the static files from this folder, like `python -m http.server`, on port
8765. It only serves files from this directory; it does not fetch anything from
the network. Use it for local previewing and for the localhost Auth0 callback.
"""
import functools
import http.server
import socketserver

PORT = 8765
DIRECTORY = __file__.rsplit("/", 1)[0] if "/" in __file__ else "."


class ThreadedServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=DIRECTORY)
    with ThreadedServer(("0.0.0.0", PORT), handler) as httpd:
        print(f"Serving {DIRECTORY} at http://127.0.0.1:{PORT}")
        httpd.serve_forever()
