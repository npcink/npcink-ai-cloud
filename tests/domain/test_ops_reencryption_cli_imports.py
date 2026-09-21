from __future__ import annotations

import argparse

from app.ops.reencrypt_runtime_data import (
    build_parser as build_runtime_data_reencryption_parser,
)
from app.ops.reencrypt_runtime_data import main as runtime_data_reencryption_main
from app.ops.reencrypt_service_secrets import (
    build_parser as build_service_secret_reencryption_parser,
)
from app.ops.reencrypt_service_secrets import main as service_secret_reencryption_main


def test_runtime_data_reencryption_cli_public_entries() -> None:
    assert callable(runtime_data_reencryption_main)
    assert callable(build_runtime_data_reencryption_parser)
    parser = build_runtime_data_reencryption_parser()
    assert isinstance(parser, argparse.ArgumentParser)
    assert "re-encrypt" in str(parser.description)


def test_service_secret_reencryption_cli_public_entries() -> None:
    assert callable(service_secret_reencryption_main)
    assert callable(build_service_secret_reencryption_parser)
    parser = build_service_secret_reencryption_parser()
    assert isinstance(parser, argparse.ArgumentParser)
    assert "re-encrypt" in str(parser.description)
