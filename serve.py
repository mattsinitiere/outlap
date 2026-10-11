"""Local server for the app: serves web/ and answers clean URLs (/drivers/max-verstappen) with index.html.

  python serve.py          # http://localhost:8000
  python serve.py 8080
"""
import http.server, os, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def send_head(self):
        path = self.path.split("?", 1)[0]
        last = path.rsplit("/", 1)[-1]
        if not path.startswith("/data/") and "." not in last and not os.path.exists(self.translate_path(path)):
            self.path = "/index.html"  # an app page, not a file
        return super().send_head()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"OutLap on http://localhost:{port}")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
