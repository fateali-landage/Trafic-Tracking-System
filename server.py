import http.server
import urllib.request
import urllib.error
import os

BACKEND_URL  = 'http://0.0.0.0:8000'
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), 'frontend')


class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=FRONTEND_DIR, **kwargs)

    # ---- Route all HTTP verbs ----
    def do_GET(self):
        if self.path.startswith('/api'):
            self._proxy('GET')
        else:
            super().do_GET()

    def do_POST(self):
        if self.path.startswith('/api'):
            self._proxy('POST')
        else:
            self.send_error(404)

    def do_PUT(self):
        if self.path.startswith('/api'):
            self._proxy('PUT')
        else:
            self.send_error(404)

    def do_DELETE(self):
        if self.path.startswith('/api'):
            self._proxy('DELETE')
        else:
            self.send_error(404)

    def do_OPTIONS(self):
        """Handle CORS pre-flight requests."""
        self.send_response(200)
        self._cors_headers()
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_PATCH(self):
        if self.path.startswith('/api'):
            self._proxy('PATCH')
        else:
            self.send_error(404)

    # ---- Proxy helper ----
    def _proxy(self, method):
        target_url     = BACKEND_URL + self.path
        content_length = int(self.headers.get('Content-Length', 0))
        body           = self.rfile.read(content_length) if content_length > 0 else None

        req_headers = {
            k: v for k, v in self.headers.items()
            if k.lower() not in ('host', 'connection')
        }

        try:
            req = urllib.request.Request(
                target_url, data=body, headers=req_headers, method=method,
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                self.send_response(resp.status)
                self._cors_headers()
                for k, v in resp.headers.items():
                    if k.lower() not in ('transfer-encoding', 'connection'):
                        self.send_header(k, v)
                self.end_headers()
                self.wfile.write(resp.read())

        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self._cors_headers()
            for k, v in e.headers.items():
                if k.lower() not in ('transfer-encoding', 'connection'):
                    self.send_header(k, v)
            self.end_headers()
            self.wfile.write(e.read())

        except Exception as e:
            self.send_response(502)
            self._cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(
                f'{{"message":"Backend unavailable: {str(e)}"}}'.encode()
            )

    def _cors_headers(self):
        self.send_header('Access-Control-Allow-Origin',  '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    def log_message(self, fmt, *args):
        pass   # suppress per-request stdout noise


if __name__ == '__main__':
    port = 5000
    host = '0.0.0.0'
    print(f'[proxy] Frontend  → http://{host}:{port}')
    print(f'[proxy] API calls → {BACKEND_URL}')
    with http.server.ThreadingHTTPServer((host, port), ProxyHandler) as httpd:
        httpd.serve_forever()
