"""Small local-network server. No accounts or uploads; mounted files are read only."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
import json
import mimetypes
import os
import re
import threading
import time

from catalog import public_file, scan

ROOT = Path(__file__).resolve().parent
ALLOWED_ROM = {'.zip', '.7z', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm'}


class ArcadeServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 64

    def __init__(self, address, rom_root, engine_root, site_root=ROOT / 'site', default_core='fbneo'):
        self.rom_root, self.engine_root, self.site_root = map(lambda p: Path(p).resolve(),
                                                           (rom_root, engine_root, site_root))
        self.default_core = default_core
        self.cache = None
        self.expires = 0
        self.lock = threading.Lock()
        super().__init__(address, Handler)

    def catalog(self):
        with self.lock:
            if self.cache is None or time.monotonic() >= self.expires:
                self.cache = json.dumps(scan(self.rom_root, self.default_core), ensure_ascii=False).encode()
                self.expires = time.monotonic() + 15
            return self.cache


class Handler(BaseHTTPRequestHandler):
    server_version = 'PixelArcade/1.1.3'

    def do_HEAD(self):
        self.serve(head=True)

    def do_GET(self):
        self.serve()

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'same-origin')
        self.send_header('Permissions-Policy', 'gamepad=(self)')
        super().end_headers()

    def data(self, content, kind, head):
        self.send_response(200)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        if not head:
            self.wfile.write(content)

    def serve(self, head=False):
        path = unquote(urlsplit(self.path).path)
        if path == '/health':
            self.data(b'{"status":"ok"}', 'application/json', head)
            return
        if path == '/library/catalog.json':
            self.data(self.server.catalog(), 'application/json; charset=utf-8', head)
            return
        if path == '/':
            self.send_response(302)
            self.send_header('Location', '/library/')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        if '\\' in path or '\x00' in path or '..' in path.split('/'):
            self.send_error(404)
            return
        root, rel = self.server.site_root, path.lstrip('/')
        if path.startswith('/roms/'):
            root, rel = self.server.rom_root, path[len('/roms/'):]
        elif path.startswith('/data/'):
            root, rel = self.server.engine_root, path[len('/data/'):]
        if path.endswith('/'):
            rel += 'index.html'
        target = root / rel
        if not public_file(root, target) or (root == self.server.rom_root and target.suffix.lower() not in ALLOWED_ROM):
            self.send_error(404)
            return
        try:
            with target.open('rb') as stream:
                size = os.fstat(stream.fileno()).st_size
                start, end, partial_response = 0, size - 1, False
                requested = self.headers.get('Range')
                if requested:
                    match = re.fullmatch(r'bytes=(\d*)-(\d*)', requested)
                    if not match or not any(match.groups()):
                        self.send_error(416)
                        return
                    a, b = match.groups()
                    start = int(a) if a else max(0, size - int(b))
                    end = min(int(b), size - 1) if a and b else size - 1
                    if start >= size or start > end:
                        self.send_response(416)
                        self.send_header('Content-Range', f'bytes */{size}')
                        self.send_header('Content-Length', '0')
                        self.end_headers()
                        return
                    partial_response = True
                self.send_response(206 if partial_response else 200)
                kind = mimetypes.guess_type(str(target))[0] or 'application/octet-stream'
                if target.suffix == '.wasm':
                    kind = 'application/wasm'
                self.send_header('Content-Type', kind)
                self.send_header('Accept-Ranges', 'bytes')
                self.send_header('Content-Length', str(end - start + 1))
                if partial_response:
                    self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
                self.end_headers()
                if not head:
                    stream.seek(start)
                    left = end - start + 1
                    while left:
                        chunk = stream.read(min(left, 256 * 1024))
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        left -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except OSError:
            self.close_connection = True


if __name__ == '__main__':
    server = ArcadeServer((os.getenv('HOST', '0.0.0.0'), int(os.getenv('PORT', '8080'))),
                          os.getenv('ROM_ROOT', ROOT / 'roms'),
                          os.getenv('ENGINE_ROOT', ROOT / 'engine'),
                          default_core=os.getenv('DEFAULT_CORE', 'fbneo'))
    print(f'Pixel Arcade ready on port {server.server_port}', flush=True)
    server.serve_forever()
