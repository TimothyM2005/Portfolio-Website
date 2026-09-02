#!/usr/bin/env python3
"""
Stamp PDF metadata/watermarks and build a SHA-256 work manifest for the portfolio.

Used by the local admin server on PDF upload and by scripts/sign_work.py for batch runs.
Requires: pip install -r requirements-work.txt
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from datetime import date
from typing import Any

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
COPYRIGHT_PATH = os.path.join(REPO_ROOT, "data", "copyright.json")
MANIFEST_PATH = os.path.join(REPO_ROOT, "data", "work-manifest.json")

PROTECTED_ROOTS = (
    os.path.join(REPO_ROOT, "docs"),
    os.path.join(REPO_ROOT, "images"),
    os.path.join(REPO_ROOT, "models"),
)
SKIP_DIR_NAMES = {".git", "__pycache__", "node_modules"}
SKIP_EXTENSIONS = {".gz"}


def read_json(path: str, default: Any) -> Any:
    if not os.path.isfile(path):
        return default
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: str, payload: Any) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")


def load_copyright_config() -> dict[str, Any]:
    config = read_json(
        COPYRIGHT_PATH,
        {
            "owner": "Timothy Mitchell",
            "copyright": "© Timothy Mitchell. All rights reserved.",
            "notice": "Unauthorized copying or redistribution is prohibited.",
            "watermark": "© Timothy Mitchell",
            "stampPdfs": True,
            "watermarkPdfs": True,
        },
    )
    if not isinstance(config, dict):
        raise ValueError("data/copyright.json must be a JSON object.")
    return config


def sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def repo_rel(path: str) -> str:
    return os.path.relpath(path, REPO_ROOT).replace("\\", "/")


def _make_watermark_page(text: str):
    from io import BytesIO

    from pypdf import PdfReader
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas

    width, height = letter
    buffer = BytesIO()
    page = canvas.Canvas(buffer, pagesize=letter)
    page.saveState()
    page.setFillColorRGB(0.45, 0.45, 0.45, alpha=0.18)
    page.setFont("Helvetica-Bold", 42)
    page.translate(width * 0.5, height * 0.5)
    page.rotate(35)
    page.drawCentredString(0, 0, text)
    page.restoreState()
    page.save()
    buffer.seek(0)
    return PdfReader(buffer).pages[0]


def stamp_pdf(path: str, config: dict[str, Any] | None = None) -> dict[str, Any]:
    """Embed ownership metadata and an optional diagonal watermark into a PDF."""
    config = config or load_copyright_config()
    result: dict[str, Any] = {
        "path": repo_rel(path),
        "sha256": sha256_file(path),
        "stamped": False,
        "watermarked": False,
    }

    if not config.get("stampPdfs", True):
        return result

    try:
        from pypdf import PdfReader, PdfWriter
    except ImportError:
        result["note"] = "Install pypdf: pip install -r requirements-work.txt"
        return result

    reader = PdfReader(path)
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)

    prior = reader.metadata or {}
    owner = str(config.get("owner") or "Timothy Mitchell")
    notice = str(config.get("notice") or "")
    writer.add_metadata(
        {
            "/Author": owner,
            "/Creator": "Portfolio work protection",
            "/Producer": "%s Portfolio" % owner,
            "/Subject": notice,
            "/Title": prior.get("/Title") or os.path.basename(path),
            "/Keywords": "copyright,%s,portfolio" % owner.replace(" ", ""),
        }
    )

    if config.get("watermarkPdfs", True):
        watermark_text = str(config.get("watermark") or owner)
        try:
            watermark_page = _make_watermark_page(watermark_text)
            for index in range(len(writer.pages)):
                writer.pages[index].merge_page(watermark_page, over=False)
            result["watermarked"] = True
        except ImportError:
            result["note"] = "Watermark skipped. Install reportlab: pip install -r requirements-work.txt"
        except Exception as exc:
            result["watermarkError"] = str(exc)

    directory = os.path.dirname(path) or "."
    fd, temp_path = tempfile.mkstemp(prefix=".stamp-", suffix=".pdf", dir=directory)
    os.close(fd)
    try:
        with open(temp_path, "wb") as handle:
            writer.write(handle)
        os.replace(temp_path, path)
        result["stamped"] = True
        result["sha256"] = sha256_file(path)
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass

    return result


def iter_protected_files() -> list[str]:
    files: list[str] = []
    for root in PROTECTED_ROOTS:
        if not os.path.isdir(root):
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [name for name in dirnames if name not in SKIP_DIR_NAMES]
            for name in filenames:
                ext = os.path.splitext(name)[1].lower()
                if ext in SKIP_EXTENSIONS:
                    continue
                files.append(os.path.join(dirpath, name))
    files.sort()
    return files


def build_work_manifest(config: dict[str, Any] | None = None) -> dict[str, Any]:
    config = config or load_copyright_config()
    entries = []
    for abs_path in iter_protected_files():
        try:
            stat = os.stat(abs_path)
        except OSError:
            continue
        entries.append(
            {
                "path": repo_rel(abs_path),
                "sha256": sha256_file(abs_path),
                "bytes": stat.st_size,
                "modified": date.fromtimestamp(stat.st_mtime).isoformat(),
            }
        )

    manifest = {
        "owner": config.get("owner", "Timothy Mitchell"),
        "copyright": config.get("copyright", ""),
        "notice": config.get("notice", ""),
        "generated": date.today().isoformat(),
        "purpose": "Content fingerprint record. Git commit history plus these hashes help prove you published this work first.",
        "files": entries,
    }
    write_json(MANIFEST_PATH, manifest)
    return manifest


def find_pdf_files() -> list[str]:
    docs_root = os.path.join(REPO_ROOT, "docs")
    if not os.path.isdir(docs_root):
        return []
    pdfs: list[str] = []
    for dirpath, _, filenames in os.walk(docs_root):
        for name in filenames:
            if name.lower().endswith(".pdf"):
                pdfs.append(os.path.join(dirpath, name))
    pdfs.sort()
    return pdfs


def sign_all_pdfs(config: dict[str, Any] | None = None) -> dict[str, Any]:
    config = config or load_copyright_config()
    results = [stamp_pdf(path, config) for path in find_pdf_files()]
    manifest = build_work_manifest(config)
    return {
        "pdfs": results,
        "manifestPath": repo_rel(MANIFEST_PATH),
        "fileCount": len(manifest.get("files") or []),
    }


def protect_uploaded_pdf(path: str) -> dict[str, Any]:
    """Stamp one uploaded PDF and refresh the work manifest."""
    config = load_copyright_config()
    stamped = stamp_pdf(path, config)
    manifest = build_work_manifest(config)
    stamped["manifestPath"] = repo_rel(MANIFEST_PATH)
    stamped["manifestFiles"] = len(manifest.get("files") or [])
    return stamped
