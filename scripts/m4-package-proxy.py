#!/usr/bin/env python3
"""Loopback-only PyPI/npm reverse proxy for M4 Docker builds.

Docker Desktop networking on the M4 cannot currently complete outbound TLS,
while the macOS host can. This helper exposes only two fixed package registries
to build containers through ``host.docker.internal``. It is started only for a
dependency build and never forwards credentials or arbitrary destinations.
"""

from __future__ import annotations

import argparse
import signal
import sys
import tempfile
import time
from http import HTTPStatus
from http.client import HTTPException
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import NamedTuple
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import ProxyHandler, Request, build_opener

USER_AGENT = "Npcink-M4-Package-Proxy/1"
DIRECT_OPENER = build_opener(ProxyHandler({}))


class Route(NamedTuple):
    kind: str
    upstream_url: str


def resolve_route(raw_target: str) -> Route | None:
    parsed = urlsplit(raw_target)
    path = parsed.path
    if path.startswith("/pypi/simple/"):
        upstream_path = "/simple/" + path.removeprefix("/pypi/simple/")
        return Route(
            "pypi",
            urlunsplit(("https", "pypi.org", upstream_path, parsed.query, "")),
        )
    if path.startswith("/pypi-files/"):
        upstream_path = "/" + path.removeprefix("/pypi-files/")
        return Route(
            "binary",
            urlunsplit(("https", "files.pythonhosted.org", upstream_path, parsed.query, "")),
        )
    if path.startswith("/npm/"):
        upstream_path = "/" + path.removeprefix("/npm/")
        return Route(
            "npm",
            urlunsplit(("https", "registry.npmjs.org", upstream_path, parsed.query, "")),
        )
    return None


def rewrite_payload(kind: str, payload: bytes, public_base: str) -> bytes:
    if kind == "pypi":
        text = payload.decode("utf-8")
        text = text.replace(
            "https://files.pythonhosted.org/",
            f"{public_base}/pypi-files/",
        )
        text = text.replace("https://pypi.org/simple/", f"{public_base}/pypi/simple/")
        return text.encode("utf-8")
    if kind == "npm":
        text = payload.decode("utf-8")
        text = text.replace(
            "https://registry.npmjs.org/",
            f"{public_base}/npm/",
        )
        return text.encode("utf-8")
    return payload


class PackageProxyHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    public_base = ""

    def do_GET(self) -> None:  # noqa: N802
        self._serve(send_body=True)

    def do_HEAD(self) -> None:  # noqa: N802
        self._serve(send_body=False)

    def _serve(self, *, send_body: bool) -> None:
        if urlsplit(self.path).path == "/health":
            body = b"ok\n"
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if send_body:
                self.wfile.write(body)
            return

        route = resolve_route(self.path)
        if route is None:
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        accept = "text/html" if route.kind == "pypi" else "*/*"
        request = Request(
            route.upstream_url,
            method="GET",
            headers={"Accept": accept, "User-Agent": USER_AGENT},
        )
        upstream_result = self._download_upstream(request)
        if upstream_result is None:
            upstream_host = urlsplit(route.upstream_url).hostname or "unknown"
            print(
                f"[m4-package-proxy] upstream failed after retries: {upstream_host}",
                file=sys.stderr,
            )
            self.send_error(HTTPStatus.BAD_GATEWAY)
            return

        status, content_type, buffered = upstream_result
        with buffered:
            should_rewrite = route.kind in {"pypi", "npm"} and (
                "text/" in content_type or "json" in content_type or route.kind == "pypi"
            )
            if should_rewrite:
                body = rewrite_payload(route.kind, buffered.read(), self.public_base)
                self.send_response(status)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                if send_body:
                    self.wfile.write(body)
                return

            content_length = buffered.seek(0, 2)
            buffered.seek(0)
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(content_length))
            self.end_headers()
            if not send_body:
                return
            while True:
                chunk = buffered.read(1024 * 1024)
                if not chunk:
                    break
                self.wfile.write(chunk)

    @staticmethod
    def _download_upstream(
        request: Request,
    ) -> tuple[int, str, tempfile.SpooledTemporaryFile] | None:
        for attempt in range(1, 4):
            buffered = tempfile.SpooledTemporaryFile(max_size=8 * 1024 * 1024)
            try:
                try:
                    response = DIRECT_OPENER.open(request, timeout=120)
                except HTTPError as exc:
                    response = exc
                with response:
                    status = getattr(response, "status", response.getcode())
                    content_type = response.headers.get("Content-Type", "application/octet-stream")
                    while True:
                        chunk = response.read(1024 * 1024)
                        if not chunk:
                            break
                        buffered.write(chunk)
                buffered.seek(0)
                return status, content_type, buffered
            except (HTTPException, OSError, URLError) as exc:
                buffered.close()
                if attempt == 3:
                    print(
                        f"[m4-package-proxy] upstream read failure: {type(exc).__name__}",
                        file=sys.stderr,
                    )
                    return None
                time.sleep(0.25 * attempt)
        return None

    def log_message(self, _format: str, *_args: object) -> None:
        return


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--ready-file", type=Path, required=True)
    args = parser.parse_args()

    if args.bind != "127.0.0.1":
        parser.error("--bind must be 127.0.0.1")
    if not 0 <= args.port <= 65535:
        parser.error("--port must be between 0 and 65535")

    server = ThreadingHTTPServer((args.bind, args.port), PackageProxyHandler)
    server.daemon_threads = True
    actual_port = server.server_address[1]
    PackageProxyHandler.public_base = f"http://host.docker.internal:{actual_port}"
    args.ready_file.parent.mkdir(parents=True, exist_ok=True)
    args.ready_file.write_text(f"{actual_port}\n", encoding="utf-8")
    args.ready_file.chmod(0o600)

    def stop(_signum: int, _frame: object) -> None:
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        server.serve_forever(poll_interval=0.2)
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
