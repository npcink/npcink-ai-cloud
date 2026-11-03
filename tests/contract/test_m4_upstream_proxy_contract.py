"""M4 package proxy can route upstream registry fetches through the VPN proxy."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from urllib.request import ProxyHandler

ROOT = Path(__file__).resolve().parents[2]
PREVIEW = (ROOT / "scripts" / "m4-preview.sh").read_text()
PROXY_PATH = ROOT / "scripts" / "m4-package-proxy.py"


def _load_proxy():
    spec = importlib.util.spec_from_file_location("m4_package_proxy", PROXY_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _proxies(opener) -> dict[str, str]:
    handlers = [h for h in opener.handlers if isinstance(h, ProxyHandler)]
    assert len(handlers) == 1
    return dict(handlers[0].proxies)


def test_default_upstream_is_direct_and_ignores_ambient_env(monkeypatch) -> None:
    monkeypatch.setenv("HTTPS_PROXY", "http://ambient.invalid:1")
    proxy = _load_proxy()
    assert proxy.UPSTREAM_OPENER is None
    assert proxy._upstream_opener() is proxy.DIRECT_OPENER
    assert proxy.upstream_opener_for("") is proxy.DIRECT_OPENER


def test_explicit_upstream_proxy_routes_http_and_https() -> None:
    proxy = _load_proxy()
    assert _proxies(proxy.upstream_opener_for("http://127.0.0.1:7890")) == {
        "http": "http://127.0.0.1:7890",
        "https": "http://127.0.0.1:7890",
    }


def test_upstream_fetches_use_upstream_opener() -> None:
    source = PROXY_PATH.read_text()
    assert "DIRECT_OPENER.open(" not in source
    assert source.count("_upstream_opener().open(") == 2
    assert '"--upstream-proxy"' in source


def test_preview_auto_detects_vpn_proxy_with_direct_fallback() -> None:
    assert 'm4_upstream_proxy_setting="${NPCINK_CLOUD_M4_UPSTREAM_PROXY:-auto}"' in PREVIEW
    assert 'm4_upstream_proxy_default="http://127.0.0.1:7890"' in PREVIEW
    assert "off|none|direct|" in PREVIEW
    assert '-x "${candidate}" https://pypi.org/simple/' in PREVIEW
    assert "unreachable; package proxy fetches upstream directly" in PREVIEW
    assert '--upstream-proxy "${upstream_proxy}"' in PREVIEW
