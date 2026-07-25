#!/usr/bin/env python3
"""Loopback-only PyPI/npm reverse proxy for M4 Docker builds.

Docker Desktop networking on the M4 cannot currently complete outbound TLS,
while the macOS host can. This helper exposes only two fixed package registries
to build containers through ``host.docker.internal``. It is started only for a
dependency build and never forwards credentials or arbitrary destinations.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import signal
import sys
import tempfile
import threading
import time
from http import HTTPStatus
from http.client import HTTPException
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, BinaryIO, NamedTuple, cast
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import ProxyHandler, Request, build_opener

USER_AGENT = "Npcink-M4-Package-Proxy/1"
DIRECT_OPENER = build_opener(ProxyHandler({}))
STREAM_CHUNK_BYTES = 256 * 1024
CACHE_SCHEMA_VERSION = 1
DEFAULT_CACHE_MAX_BYTES = 2 * 1024 * 1024 * 1024
DEFAULT_CACHE_MAX_AGE_SECONDS = 14 * 24 * 60 * 60


class Route(NamedTuple):
    kind: str
    upstream_url: str


class CachedArtifact(NamedTuple):
    path: Path
    content_type: str
    content_length: int


class PackageProxyMetrics:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.requests = 0
        self.cache_hits = 0
        self.cache_misses = 0
        self.upstream_bytes = 0
        self.cache_bytes = 0
        self.downstream_disconnects = 0

    def add(self, field: str, value: int = 1) -> None:
        with self._lock:
            setattr(self, field, getattr(self, field) + value)

    def summary(self) -> str:
        with self._lock:
            return (
                "[m4-package-proxy] summary "
                f"requests={self.requests} "
                f"cache_hits={self.cache_hits} "
                f"cache_misses={self.cache_misses} "
                f"upstream_bytes={self.upstream_bytes} "
                f"cache_bytes={self.cache_bytes} "
                f"downstream_disconnects={self.downstream_disconnects}"
            )


class PackageCache:
    """Bounded cache for immutable public package artifacts."""

    def __init__(
        self,
        root: Path,
        *,
        max_bytes: int,
        max_age_seconds: int,
    ) -> None:
        self.root = root
        self.objects = root / "objects"
        self.metadata = root / "metadata"
        self.max_bytes = max_bytes
        self.max_age_seconds = max_age_seconds
        self._state_lock = threading.Lock()
        self._key_locks_lock = threading.Lock()
        self._key_locks: dict[str, threading.Lock] = {}
        self._prepare_directory(self.root)
        self._prepare_directory(self.objects)
        self._prepare_directory(self.metadata)
        self._known_size = self._prune()

    @staticmethod
    def _prepare_directory(path: Path) -> None:
        if path.is_symlink():
            raise ValueError(f"cache directory must not be a symlink: {path}")
        path.mkdir(parents=True, exist_ok=True, mode=0o700)
        if path.is_symlink() or not path.is_dir():
            raise ValueError(f"cache path is not a directory: {path}")
        path.chmod(0o700)

    @staticmethod
    def key_for(upstream_url: str) -> str:
        return hashlib.sha256(upstream_url.encode("utf-8")).hexdigest()

    def lock_for(self, upstream_url: str) -> threading.Lock:
        key = self.key_for(upstream_url)
        with self._key_locks_lock:
            return self._key_locks.setdefault(key, threading.Lock())

    def _paths(self, upstream_url: str) -> tuple[Path, Path]:
        key = self.key_for(upstream_url)
        return self.objects / f"{key}.body", self.metadata / f"{key}.json"

    @staticmethod
    def _unlink(path: Path) -> None:
        try:
            path.unlink()
        except FileNotFoundError:
            pass

    def lookup(self, upstream_url: str) -> CachedArtifact | None:
        object_path, metadata_path = self._paths(upstream_url)
        with self._state_lock:
            try:
                if object_path.is_symlink() or metadata_path.is_symlink():
                    raise ValueError("cache entries must not be symlinks")
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                content_length = int(metadata["content_length"])
                content_type = str(metadata["content_type"])
                if metadata.get("schema_version") != CACHE_SCHEMA_VERSION:
                    raise ValueError("unsupported cache metadata")
                if metadata.get("url_key") != self.key_for(upstream_url):
                    raise ValueError("cache URL key mismatch")
                if content_length < 0 or object_path.stat().st_size != content_length:
                    raise ValueError("cache object length mismatch")
                now = time.time()
                os.utime(object_path, (now, now))
                os.utime(metadata_path, (now, now))
            except (
                FileNotFoundError,
                KeyError,
                OSError,
                TypeError,
                ValueError,
                json.JSONDecodeError,
            ):
                invalid_size = 0
                if not object_path.is_symlink():
                    try:
                        invalid_size = object_path.stat().st_size
                    except OSError:
                        pass
                self._unlink(object_path)
                self._unlink(metadata_path)
                if invalid_size:
                    self._known_size = max(0, self._known_size - invalid_size)
                return None

        return CachedArtifact(object_path, content_type, content_length)

    def new_partial(self, upstream_url: str) -> tuple[str, Path, BinaryIO]:
        key = self.key_for(upstream_url)
        file_handle = cast(
            BinaryIO,
            tempfile.NamedTemporaryFile(
                mode="w+b",
                prefix=f".{key}.",
                suffix=".partial",
                dir=self.objects,
                delete=False,
            ),
        )
        partial_path = Path(file_handle.name)
        partial_path.chmod(0o600)
        return key, partial_path, file_handle

    def commit(
        self,
        upstream_url: str,
        partial_path: Path,
        *,
        content_type: str,
        content_length: int,
    ) -> None:
        object_path, metadata_path = self._paths(upstream_url)
        if partial_path.stat().st_size != content_length:
            raise ValueError("partial cache object length mismatch")

        with self._state_lock:
            previous_size = 0
            if object_path.is_symlink():
                self._unlink(object_path)
            else:
                try:
                    previous_size = object_path.stat().st_size
                except FileNotFoundError:
                    pass
            if metadata_path.is_symlink():
                self._unlink(metadata_path)
            os.replace(partial_path, object_path)
            object_path.chmod(0o600)
            metadata_payload = {
                "schema_version": CACHE_SCHEMA_VERSION,
                "url_key": self.key_for(upstream_url),
                "content_type": content_type,
                "content_length": content_length,
            }
            metadata_partial = metadata_path.with_suffix(".json.partial")
            try:
                metadata_partial.write_text(
                    json.dumps(metadata_payload, sort_keys=True) + "\n",
                    encoding="utf-8",
                )
                metadata_partial.chmod(0o600)
                os.replace(metadata_partial, metadata_path)
            except BaseException:
                self._unlink(metadata_partial)
                self._unlink(object_path)
                if previous_size:
                    self._known_size = max(0, self._known_size - previous_size)
                raise

            self._known_size += content_length - previous_size
            if self._known_size > self.max_bytes:
                self._known_size = self._prune_locked()

    def discard(self, partial_path: Path | None) -> None:
        if partial_path is not None:
            self._unlink(partial_path)

    def _prune(self) -> int:
        with self._state_lock:
            return self._prune_locked()

    def _prune_locked(self) -> int:
        now = time.time()
        for partial in self.objects.glob("*.partial"):
            self._unlink(partial)
        for partial in self.metadata.glob("*.partial"):
            self._unlink(partial)

        entries: list[tuple[float, int, Path, Path]] = []
        metadata_names = {path.stem for path in self.metadata.glob("*.json")}
        for object_path in self.objects.glob("*.body"):
            metadata_path = self.metadata / f"{object_path.stem}.json"
            if object_path.is_symlink():
                self._unlink(object_path)
                self._unlink(metadata_path)
                continue
            try:
                stat = object_path.stat()
            except OSError:
                self._unlink(object_path)
                self._unlink(metadata_path)
                continue
            if (
                not metadata_path.is_file()
                or metadata_path.is_symlink()
                or now - stat.st_mtime > self.max_age_seconds
            ):
                self._unlink(object_path)
                self._unlink(metadata_path)
                continue
            entries.append((stat.st_mtime, stat.st_size, object_path, metadata_path))
            metadata_names.discard(object_path.stem)

        for orphan_name in metadata_names:
            self._unlink(self.metadata / f"{orphan_name}.json")

        total = sum(entry[1] for entry in entries)
        for _mtime, size, object_path, metadata_path in sorted(entries):
            if total <= self.max_bytes:
                break
            self._unlink(object_path)
            self._unlink(metadata_path)
            total -= size
        return total


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
            "npm_binary" if "/-/" in upstream_path else "npm",
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
    cache: PackageCache | None = None
    metrics = PackageProxyMetrics()

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

        self.metrics.add("requests")
        if route.kind in {"binary", "npm_binary"}:
            self._serve_binary(route, send_body=send_body)
            return

        accept = "text/html" if route.kind == "pypi" else "*/*"
        request = Request(
            route.upstream_url,
            method="GET" if send_body else "HEAD",
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
                    self._write_downstream(body)
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
                if not self._write_downstream(chunk):
                    return

    def _serve_binary(self, route: Route, *, send_body: bool) -> None:
        cache = self.cache
        if cache is None:
            self._stream_binary(route, send_body=send_body, cache=None)
            return

        with cache.lock_for(route.upstream_url):
            cached = cache.lookup(route.upstream_url)
            if cached is not None and self._send_cached(
                cached,
                send_body=send_body,
            ):
                self.metrics.add("cache_hits")
                return
            self.metrics.add("cache_misses")
            self._stream_binary(route, send_body=send_body, cache=cache)

    def _send_cached(self, cached: CachedArtifact, *, send_body: bool) -> bool:
        try:
            cached_file = cached.path.open("rb")
        except OSError:
            return False

        with cached_file:
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", cached.content_type)
            self.send_header("Content-Length", str(cached.content_length))
            self.send_header("X-Npcink-M4-Cache", "hit")
            self.end_headers()
            if not send_body:
                return True
            while True:
                try:
                    chunk = cached_file.read(STREAM_CHUNK_BYTES)
                except OSError:
                    self.close_connection = True
                    return True
                if not chunk:
                    break
                if not self._write_downstream(chunk):
                    return True
                self.metrics.add("cache_bytes", len(chunk))
        return True

    def _stream_binary(
        self,
        route: Route,
        *,
        send_body: bool,
        cache: PackageCache | None,
    ) -> None:
        request = Request(
            route.upstream_url,
            method="GET" if send_body else "HEAD",
            headers={"Accept": "*/*", "User-Agent": USER_AGENT},
        )
        response = self._open_upstream(request)
        if response is None:
            upstream_host = urlsplit(route.upstream_url).hostname or "unknown"
            print(
                f"[m4-package-proxy] upstream failed before response: {upstream_host}",
                file=sys.stderr,
            )
            self.send_error(HTTPStatus.BAD_GATEWAY)
            return

        partial_path: Path | None = None
        partial_file: BinaryIO | None = None
        try:
            with response:
                status = getattr(response, "status", response.getcode())
                content_type = response.headers.get(
                    "Content-Type",
                    "application/octet-stream",
                )
                content_length_header = response.headers.get("Content-Length")
                try:
                    expected_length = (
                        int(content_length_header)
                        if content_length_header is not None
                        else None
                    )
                except ValueError:
                    expected_length = None

                self.send_response(status)
                self.send_header("Content-Type", content_type)
                if expected_length is not None:
                    self.send_header("Content-Length", str(expected_length))
                else:
                    self.send_header("Connection", "close")
                    self.close_connection = True
                self.send_header("X-Npcink-M4-Cache", "miss")
                self.end_headers()
                if not send_body:
                    return

                if cache is not None and status == HTTPStatus.OK:
                    _key, partial_path, partial_file = cache.new_partial(
                        route.upstream_url
                    )

                downloaded = 0
                downstream_open = True
                while True:
                    chunk = response.read(STREAM_CHUNK_BYTES)
                    if not chunk:
                        break
                    downloaded += len(chunk)
                    self.metrics.add("upstream_bytes", len(chunk))
                    if partial_file is not None:
                        partial_file.write(chunk)
                    if downstream_open and not self._write_downstream(chunk):
                        downstream_open = False

                if expected_length is not None and downloaded != expected_length:
                    raise OSError(
                        "upstream content length mismatch "
                        f"(expected {expected_length}, received {downloaded})"
                    )
                if partial_file is not None and partial_path is not None:
                    assert cache is not None
                    partial_file.flush()
                    os.fsync(partial_file.fileno())
                    partial_file.close()
                    partial_file = None
                    cache.commit(
                        route.upstream_url,
                        partial_path,
                        content_type=content_type,
                        content_length=downloaded,
                    )
                    partial_path = None
        except (HTTPException, OSError, URLError, ValueError) as exc:
            self.close_connection = True
            print(
                f"[m4-package-proxy] upstream stream failure: {type(exc).__name__}",
                file=sys.stderr,
            )
        finally:
            if partial_file is not None:
                partial_file.close()
            if cache is not None:
                cache.discard(partial_path)

    @staticmethod
    def _open_upstream(request: Request) -> Any | None:
        for attempt in range(1, 4):
            try:
                try:
                    return DIRECT_OPENER.open(request, timeout=120)
                except HTTPError as exc:
                    return exc
            except (HTTPException, OSError, URLError) as exc:
                if attempt == 3:
                    print(
                        "[m4-package-proxy] upstream open failure: "
                        f"{type(exc).__name__}",
                        file=sys.stderr,
                    )
                    return None
                time.sleep(0.25 * attempt)
        return None

    def _write_downstream(self, payload: bytes) -> bool:
        try:
            self.wfile.write(payload)
            return True
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True
            self.metrics.add("downstream_disconnects")
            return False

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
    parser.add_argument("--cache-dir", type=Path)
    parser.add_argument(
        "--cache-max-bytes",
        type=int,
        default=DEFAULT_CACHE_MAX_BYTES,
    )
    parser.add_argument(
        "--cache-max-age-seconds",
        type=int,
        default=DEFAULT_CACHE_MAX_AGE_SECONDS,
    )
    args = parser.parse_args()

    if args.bind != "127.0.0.1":
        parser.error("--bind must be 127.0.0.1")
    if not 0 <= args.port <= 65535:
        parser.error("--port must be between 0 and 65535")
    if args.cache_max_bytes <= 0:
        parser.error("--cache-max-bytes must be positive")
    if args.cache_max_age_seconds <= 0:
        parser.error("--cache-max-age-seconds must be positive")

    server = ThreadingHTTPServer((args.bind, args.port), PackageProxyHandler)
    server.daemon_threads = True
    actual_port = server.server_address[1]
    PackageProxyHandler.public_base = f"http://host.docker.internal:{actual_port}"
    PackageProxyHandler.metrics = PackageProxyMetrics()
    PackageProxyHandler.cache = (
        PackageCache(
            args.cache_dir,
            max_bytes=args.cache_max_bytes,
            max_age_seconds=args.cache_max_age_seconds,
        )
        if args.cache_dir is not None
        else None
    )
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
        print(PackageProxyHandler.metrics.summary(), file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
