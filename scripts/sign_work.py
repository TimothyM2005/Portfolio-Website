#!/usr/bin/env python3
"""
Sign (stamp) all portfolio PDFs and rebuild the SHA-256 work manifest.

Usage (from repo root):
  pip install -r requirements-work.txt
  python scripts/sign_work.py
  python scripts/sign_work.py --manifest-only
"""

from __future__ import annotations

import argparse
import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from work_protection import build_work_manifest, load_copyright_config, sign_all_pdfs  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Stamp PDFs and rebuild the portfolio work manifest.")
    parser.add_argument(
        "--manifest-only",
        action="store_true",
        help="Rebuild data/work-manifest.json without modifying PDFs.",
    )
    args = parser.parse_args()

    config = load_copyright_config()
    if args.manifest_only:
        manifest = build_work_manifest(config)
        print(json.dumps({"manifestPath": "data/work-manifest.json", "fileCount": len(manifest.get("files") or [])}, indent=2))
        return 0

    result = sign_all_pdfs(config)
    print(json.dumps(result, indent=2))
    stamped = sum(1 for item in result.get("pdfs") or [] if item.get("stamped"))
    print("\nStamped %d PDF(s). Manifest lists %d protected file(s)." % (stamped, result.get("fileCount", 0)))
    return 0


if __name__ == "__main__":
    os.chdir(os.path.dirname(SCRIPT_DIR))
    raise SystemExit(main())
