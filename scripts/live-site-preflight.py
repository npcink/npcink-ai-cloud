#!/usr/bin/env -S uv run python
from __future__ import annotations

import sys

from app.ops.live_site_preflight import main

if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
