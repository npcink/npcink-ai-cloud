#!/usr/bin/env python3
"""Check UI window choices against API validation and runtime clamps without importing services."""

from __future__ import annotations

import ast
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "frontend/src/features/admin/observability/window-capabilities.json"
API_SOURCE = "app/api/routes/service.py"


def function_node(source: str, name: str) -> ast.FunctionDef | ast.AsyncFunctionDef:
    # PEP 695 aliases are unrelated to window logic; tolerate older CI Python parsers.
    source = re.sub(r"(?m)^(\s*)type [A-Za-z_]\w* =[^\n]+$", r"\1pass", source)
    matches = [
        node
        for node in ast.walk(ast.parse(source))
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name
    ]
    if len(matches) != 1:
        raise ValueError(f"{name}: expected one owning function, found {len(matches)}")
    return matches[0]


def validate(
    capabilities: dict, root: Path = ROOT, overrides: dict[str, str] | None = None
) -> None:
    def read(path: str) -> str:
        return overrides[path] if overrides and path in overrides else (root / path).read_text()

    for key, capability in capabilities.items():
        hours = capability["hours"]
        if (
            not hours
            or hours != sorted(set(hours))
            or any(type(value) is not int or value <= 0 for value in hours)
        ):
            raise ValueError(f"{key}: window choices must be ordered positive unique hours")
        if capability["defaultHours"] not in hours:
            raise ValueError(f"{key}: default is not a supported choice")
        parameter = capability["queryParameter"]
        api = function_node(read(API_SOURCE), capability["apiFunction"])
        default_arguments = api.args.args[len(api.args.args) - len(api.args.defaults) :]
        query = next(
            (
                default
                for arg, default in zip(default_arguments, api.args.defaults, strict=True)
                if arg.arg == parameter
            ),
            None,
        )
        if (
            not isinstance(query, ast.Call)
            or not isinstance(query.func, ast.Name)
            or query.func.id != "Query"
        ):
            raise ValueError(f"{key}: query validation cannot be proved")
        bounds = {
            item.arg: ast.literal_eval(item.value)
            for item in query.keywords
            if item.arg in {"ge", "le"}
        }
        if "ge" not in bounds or "le" not in bounds:
            raise ValueError(f"{key}: API query bounds cannot be proved")
        if (
            min(hours) * capability["unitsPerHour"] < bounds["ge"]
            or max(hours) * capability["unitsPerHour"] > bounds["le"]
        ):
            raise ValueError(f"{key}: UI exceeds API query ceiling or falls below its minimum")
        runtime = function_node(read(capability["runtimeSource"]), capability["runtimeFunction"])
        clamps = []
        for call in ast.walk(runtime):
            if (
                not isinstance(call, ast.Call)
                or not isinstance(call.func, ast.Name)
                or call.func.id != "min"
            ):
                continue
            if not any(
                isinstance(node, ast.Name) and node.id == parameter for node in ast.walk(call)
            ):
                continue
            constants = [
                arg.value
                for arg in call.args
                if isinstance(arg, ast.Constant) and type(arg.value) is int
            ]
            if len(constants) != 1:
                raise ValueError(f"{key}: runtime clamp changed; inspect its semantics")
            clamps.append(constants[0] / capability["unitsPerHour"])
        actual = min(clamps) if clamps else None
        if actual != capability["runtimeMaxHours"]:
            raise ValueError(
                f"{key}: runtime limit changed ({actual}); reconcile capabilities and UI"
            )
        if actual is not None and max(hours) > actual:
            raise ValueError(f"{key}: UI requests a window silently narrowed by runtime")


def main() -> None:
    capabilities = json.loads(REGISTRY.read_text())
    validate(capabilities)
    print(f"admin_window_capabilities: ok ({len(capabilities)} API/runtime owners)")


if __name__ == "__main__":
    main()
