from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

DEFAULT_RUNTIME_FILE = Path.home() / ".mentorion" / "runtime.json"


def _detect_cli_arg(flag: str) -> Optional[str]:
    argv = sys.argv[1:]
    for i, arg in enumerate(argv):
        if arg == flag and i + 1 < len(argv):
            return argv[i + 1]
        if arg.startswith(f"{flag}="):
            return arg.split("=", 1)[1]
    return None


def detect_bound_api_url(default_host: str, default_port: int) -> str:
    host = _detect_cli_arg("--host") or default_host
    port_raw = _detect_cli_arg("--port")
    port = int(port_raw) if (port_raw and port_raw.isdigit()) else default_port
    public_host = "127.0.0.1" if host in ("0.0.0.0", "::", "") else host
    return f"http://{public_host}:{port}"


def write_runtime_entry(
    updates: Dict[str, Any],
    runtime_file: Path = DEFAULT_RUNTIME_FILE,
) -> Dict[str, Any]:
    runtime_file.parent.mkdir(parents=True, exist_ok=True)
    current: Dict[str, Any] = {}
    if runtime_file.is_file():
        try:
            current = json.loads(runtime_file.read_text(encoding="utf-8"))
        except Exception:
            current = {}

    current.update(updates)
    current["updated_at"] = datetime.now(timezone.utc).isoformat()
    runtime_file.write_text(
        json.dumps(current, indent=2) + "\n",
        encoding="utf-8",
    )
    return current


def register_backend_runtime(default_host: str, default_port: int) -> None:
    api_url = detect_bound_api_url(default_host, default_port)
    write_runtime_entry(
        {
            "api_url": api_url,
            "backend_pid": os.getpid(),
        }
    )
