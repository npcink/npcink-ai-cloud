"""Pytest plugin for the critical suite's in-process fake API tests only."""

from __future__ import annotations

import socket
import sys

import pytest

_attempts: list[str] = []


def _deny_network(event: str, args: tuple[object, ...]) -> None:
    # An audit hook still sees real connects if a fixture replaces a Python wrapper.
    # TestClient/SQLite use no TCP; any attempted DNS/TCP/UDP invalidates this lane.
    internet_socket = (
        event in {"socket.connect", "socket.sendto"}
        and getattr(args[0], "family", None) in {socket.AF_INET, socket.AF_INET6}
    )
    if event == "socket.getaddrinfo" or internet_socket:
        _attempts.append(event)
        raise RuntimeError("critical offline suite forbids network access")


sys.addaudithook(_deny_network)


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    if _attempts:
        session.exitstatus = pytest.ExitCode.TESTS_FAILED
        reporter = session.config.pluginmanager.get_plugin("terminalreporter")
        if reporter:
            reporter.write_line(f"[fail] offline network attempts: {len(_attempts)}")
