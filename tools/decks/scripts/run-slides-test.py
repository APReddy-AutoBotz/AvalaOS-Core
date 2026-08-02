#!/usr/bin/env python3
"""Run the bundled slide overflow test while tolerating a known renderer exit-code quirk.

The artifact renderer can return exit code 1 after successfully writing every PNG.
This wrapper accepts that condition only when its JSON payload names existing files;
all other failures still propagate through the official slides_test.py implementation.
"""

from __future__ import annotations

import json
import runpy
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
LOCAL_PACKAGES = REPO_ROOT / "tools" / "decks" / ".python"
TOOLS_ROOT = Path.home() / ".codex" / "plugins" / "cache" / "openai-primary-runtime" / "presentations"


def find_container_tools() -> Path:
    candidates = sorted(TOOLS_ROOT.glob("*/skills/presentations/container_tools"))
    if not candidates:
        raise FileNotFoundError(f"Bundled presentation tools not found under {TOOLS_ROOT}")
    return candidates[-1]


container_tools = find_container_tools()
sys.path.insert(0, str(LOCAL_PACKAGES))
sys.path.insert(0, str(container_tools))

import render_slides  # type: ignore  # noqa: E402


original_render = render_slides._render_presentation_with_artifact_tool


def render_with_verified_outputs(input_path: str, out_dir: str, dpi: int):
    try:
        return original_render(input_path, out_dir, dpi)
    except RuntimeError as exc:
        message = str(exc)
        json_start = message.find("{")
        if json_start < 0:
            raise
        payload = json.loads(message[json_start:])
        paths = payload.get("paths", [])
        if not paths or not all(Path(item).is_file() for item in paths):
            raise
        return paths


render_slides._render_presentation_with_artifact_tool = render_with_verified_outputs
sys.argv = ["slides_test.py", *sys.argv[1:]]
runpy.run_path(str(container_tools / "slides_test.py"), run_name="__main__")
