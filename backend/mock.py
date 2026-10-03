import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit


class Target(BaseHTTPRequestHandler):
    def do_GET(self):
        self.respond()

    def do_HEAD(self):
        self.respond()

    def respond(self):
        delays = {
            "/website": 180,
            "/api": 95,
            "/docs": 245,
            "/store": 340,
            "/auth": 120,
            "/cdn": 65,
        }
        url = urlsplit(self.path)
        query = parse_qs(url.query)

        def number(name, default, lower, upper):
            try:
                return max(lower, min(upper, int(query.get(name, [default])[0])))
            except ValueError:
                return default

        time.sleep(number("delay", delays.get(url.path, 20), 0, 30000) / 1000)
        body = b"AliveRadar development target"
        self.send_response(number("status", 200, 100, 599))
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def log_message(self, format, *args):
        pass


def run():
    print("Python development HTTP target ready on 127.0.0.1:4005", flush=True)
    with ThreadingHTTPServer(("127.0.0.1", 4005), Target) as server:
        server.serve_forever()
