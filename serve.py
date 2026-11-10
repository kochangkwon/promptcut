#!/usr/bin/env python3
"""Static file server for the UI, with HTTP Range support.

`python3 -m http.server` ignores Range requests. A <video> served that way
reports `seekable = [0, 0]`: it plays from the start but cannot scrub, so the
timeline playhead and the picture drift apart. Range support is the only reason
this file exists; everything else is SimpleHTTPRequestHandler.
"""
import http.server
import os
import re
import socketserver
import sys

RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")


class _Limited:
    """A read-only window onto an open file, for shutil.copyfileobj."""

    def __init__(self, fileobj, remaining):
        self._f = fileobj
        self._remaining = remaining

    def read(self, size=-1):
        if self._remaining <= 0:
            return b""
        if size is None or size < 0:
            size = self._remaining
        chunk = self._f.read(min(size, self._remaining))
        self._remaining -= len(chunk)
        return chunk

    def close(self):
        self._f.close()


class RangeHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        header = self.headers.get("Range")
        path = self.translate_path(self.path)
        if not header or os.path.isdir(path):
            return super().send_head()

        match = RANGE_RE.fullmatch(header.strip())
        if not match:
            return super().send_head()

        try:
            f = open(path, "rb")
        except OSError:
            self.send_error(404, "File not found")
            return None

        size = os.fstat(f.fileno()).st_size
        first, last = match.group(1), match.group(2)

        if first == "":
            if last == "":
                f.close()
                self.send_error(400, "Malformed Range header")
                return None
            length = min(int(last), size)
            start, end = size - length, size - 1
        else:
            start = int(first)
            end = int(last) if last else size - 1

        end = min(end, size - 1)
        if start >= size or start > end:
            f.close()
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return None

        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        return _Limited(f, end - start + 1)

    def log_message(self, fmt, *args):
        if "404" in (args[1] if len(args) > 1 else ""):
            super().log_message(fmt, *args)


class Server(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    root = os.path.dirname(os.path.abspath(__file__))
    os.chdir(root)
    with Server(("127.0.0.1", port), RangeHandler) as httpd:
        print(f"serving {root} on http://localhost:{port}/ui/")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print()


if __name__ == "__main__":
    main()
