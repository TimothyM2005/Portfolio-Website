#!/usr/bin/env python3
"""
Local-only admin server for the portfolio site.

Serves static files and exposes write APIs that update data/projects.json,
images/, models/, and docs/projects/ on disk. Bind to 127.0.0.1 only — not for production.

Usage (from repo root):
  python scripts/local_admin_server.py
Then open http://127.0.0.1:8000/admin.html
"""

from __future__ import annotations

import base64
import gzip
import json
import os
import re
import shutil
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

try:
    from work_protection import build_work_manifest, protect_uploaded_pdf, sign_all_pdfs
except ImportError:
    build_work_manifest = None
    protect_uploaded_pdf = None
    sign_all_pdfs = None

HOST = "127.0.0.1"
PORT = 8000

SITE_META_PATH = os.path.join(REPO_ROOT, "data", "site-meta.json")
PROJECTS_PATH = os.path.join(REPO_ROOT, "data", "projects.json")
IMAGES_DIR = os.path.join(REPO_ROOT, "images")
IMAGE_MANIFEST_PATH = os.path.join(IMAGES_DIR, "manifest.json")
MODELS_DIR = os.path.join(REPO_ROOT, "models")
MODEL_MANIFEST_PATH = os.path.join(MODELS_DIR, "manifest.json")
DOCS_DIR = os.path.join(REPO_ROOT, "docs", "projects")


def touch_site_meta(note: str | None = None) -> None:
    from datetime import date

    meta = read_json(SITE_META_PATH, {"lastUpdated": "", "changelog": []})
    today = date.today().isoformat()
    meta["lastUpdated"] = today
    changelog = meta.get("changelog")
    if not isinstance(changelog, list):
        changelog = []
    entry = {"date": today, "text": note or "Projects updated via local admin"}
    if not changelog or changelog[0] != entry:
        changelog.insert(0, entry)
    meta["changelog"] = changelog[:12]
    write_json(SITE_META_PATH, meta)


IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
CAD_EXT = {".step", ".stp", ".glb", ".gltf", ".bin"}
DOC_EXT = {".pdf"}
SAFE_ID_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}$")
SAFE_FILE_RE = re.compile(r"^[a-zA-Z0-9._-]+$")
MAX_JSON_BYTES = 5 * 1024 * 1024
MAX_UPLOAD_BYTES = 100 * 1024 * 1024
UPLOAD_CHUNK = 1024 * 1024


def repo_rel(path: str) -> str:
    return os.path.relpath(path, REPO_ROOT).replace("\\", "/")


def gzip_step_companion(abs_path: str) -> None:
    """Write a .step.gz / .stp.gz next to a STEP file for faster GitHub Pages downloads."""
    ext = os.path.splitext(abs_path)[1].lower()
    if ext not in {".step", ".stp"} or not os.path.isfile(abs_path):
        return
    gz_path = abs_path + ".gz"
    with open(abs_path, "rb") as src, gzip.open(gz_path, "wb", compresslevel=6) as dst:
        shutil.copyfileobj(src, dst)


def ensure_step_gzip_files() -> None:
    if not os.path.isdir(MODELS_DIR):
        return
    for name in os.listdir(MODELS_DIR):
        ext = os.path.splitext(name)[1].lower()
        if ext not in {".step", ".stp"}:
            continue
        abs_path = os.path.join(MODELS_DIR, name)
        gz_path = abs_path + ".gz"
        if os.path.isfile(gz_path) and os.path.getmtime(gz_path) >= os.path.getmtime(abs_path):
            continue
        print("Compressing %s for faster CAD loads…" % repo_rel(abs_path))
        gzip_step_companion(abs_path)


def ensure_dirs() -> None:
    os.makedirs(os.path.dirname(PROJECTS_PATH), exist_ok=True)
    os.makedirs(IMAGES_DIR, exist_ok=True)
    os.makedirs(MODELS_DIR, exist_ok=True)
    os.makedirs(DOCS_DIR, exist_ok=True)


def read_json(path: str, default):
    if not os.path.isfile(path):
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: str, data) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def rebuild_image_manifest() -> dict:
    manifest = {}
    if not os.path.isdir(IMAGES_DIR):
        write_json(IMAGE_MANIFEST_PATH, manifest)
        return manifest

    for name in sorted(os.listdir(IMAGES_DIR)):
        subdir = os.path.join(IMAGES_DIR, name)
        if not os.path.isdir(subdir) or name.startswith("."):
            continue
        rel_dir = repo_rel(subdir)
        files = []
        for filename in sorted(os.listdir(subdir)):
            if os.path.splitext(filename)[1].lower() in IMAGE_EXT:
                files.append(rel_dir + "/" + filename)
        if files:
            manifest[name] = files

    write_json(IMAGE_MANIFEST_PATH, manifest)
    return manifest


def read_model_manifest() -> dict:
    data = read_json(MODEL_MANIFEST_PATH, {})
    return data if isinstance(data, dict) else {}


def write_model_manifest(manifest: dict) -> None:
    write_json(MODEL_MANIFEST_PATH, manifest)


def sanitize_id(project_id: str) -> str:
    value = str(project_id or "").strip()
    if not SAFE_ID_RE.match(value):
        raise ValueError("Invalid project id. Use letters, numbers, dots, underscores, or hyphens.")
    return value


def sanitize_filename(name: str) -> str:
    base = os.path.basename(str(name or "file")).replace(" ", "-")
    base = re.sub(r"[^a-zA-Z0-9._-]+", "-", base)
    base = re.sub(r"-+", "-", base).strip("-._")
    if not base or not SAFE_FILE_RE.match(base):
        raise ValueError("Invalid file name.")
    return base.lower()


def resolve_under(root: str, *parts: str) -> str:
    candidate = os.path.abspath(os.path.join(root, *parts))
    root_abs = os.path.abspath(root)
    if candidate != root_abs and not candidate.startswith(root_abs + os.sep):
        raise ValueError("Path escapes repository root.")
    return candidate


def decode_base64_payload(content_b64: str) -> bytes:
    raw = str(content_b64 or "").strip()
    if "," in raw and raw.lower().startswith("data:"):
        raw = raw.split(",", 1)[1]
    try:
        return base64.b64decode(raw, validate=False)
    except Exception as exc:
        raise ValueError("Invalid base64 file content.") from exc


def load_projects() -> list:
    data = read_json(PROJECTS_PATH, [])
    if not isinstance(data, list):
        raise ValueError("data/projects.json must be a JSON array.")
    return data


def list_project_documents(project_id: str) -> list:
    """Return [{url, name}, ...] for PDFs under docs/projects/<id>/."""
    project_id = str(project_id or "").strip()
    if not project_id:
        return []
    dest_dir = os.path.join(DOCS_DIR, project_id)
    if not os.path.isdir(dest_dir):
        return []
    docs = []
    for filename in sorted(os.listdir(dest_dir)):
        if os.path.splitext(filename)[1].lower() not in DOC_EXT:
            continue
        abs_path = os.path.join(dest_dir, filename)
        if not os.path.isfile(abs_path):
            continue
        docs.append({"url": repo_rel(abs_path), "name": filename})
    return docs


def enrich_projects(projects: list) -> list:
    """Fill missing images/modelUrl/documents from on-disk folders for admin editing."""
    image_manifest = rebuild_image_manifest()
    model_manifest = read_model_manifest()
    enriched = []
    for item in projects:
        if not isinstance(item, dict):
            continue
        project = dict(item)
        project_id = str(project.get("id") or "").strip()
        images = project.get("images")
        if not isinstance(images, list) or not images:
            project["images"] = list(image_manifest.get(project_id) or [])
        if not str(project.get("modelUrl") or "").strip():
            project["modelUrl"] = str(model_manifest.get(project_id) or "")
        documents = project.get("documents")
        if not isinstance(documents, list) or not documents:
            project["documents"] = list_project_documents(project_id)
        enriched.append(project)
    return enriched


def save_projects(projects: list) -> None:
    if not isinstance(projects, list):
        raise ValueError("Projects payload must be a JSON array.")
    write_json(PROJECTS_PATH, projects)


def upsert_project(project: dict) -> dict:
    if not isinstance(project, dict):
        raise ValueError("Project must be an object.")
    project_id = sanitize_id(project.get("id"))
    project = dict(project)
    project["id"] = project_id

    projects = load_projects()
    updated = False
    for i, item in enumerate(projects):
        if isinstance(item, dict) and str(item.get("id") or "") == project_id:
            projects[i] = project
            updated = True
            break
    if not updated:
        projects.append(project)

    # Only one featured project at a time.
    if project.get("featured"):
        for item in projects:
            if isinstance(item, dict) and str(item.get("id") or "") != project_id:
                item["featured"] = False

    # Keep models/manifest.json in sync when modelUrl is a local models/ path
    model_url = str(project.get("modelUrl") or "").strip()
    manifest = read_model_manifest()
    if model_url.startswith("models/"):
        manifest[project_id] = model_url
        write_model_manifest(manifest)
    elif project_id in manifest and not model_url:
        del manifest[project_id]
        write_model_manifest(manifest)

    save_projects(projects)
    rebuild_image_manifest()
    touch_site_meta("Updated project \"" + project_id + "\"")
    return project


def set_featured_project(project_id: str | None) -> list:
    """Mark at most one project as featured. Pass None/\"\" to clear."""
    projects = load_projects()
    target = str(project_id or "").strip()
    changed = False
    for item in projects:
        if not isinstance(item, dict):
            continue
        should_feature = bool(target) and str(item.get("id") or "") == target
        if bool(item.get("featured")) != should_feature:
            item["featured"] = should_feature
            changed = True
    if changed:
        save_projects(projects)
        touch_site_meta(
            ("Set featured project to \"" + target + "\"") if target else "Cleared featured project"
        )
    return enrich_projects(projects)


def delete_project(project_id: str) -> None:
    project_id = sanitize_id(project_id)
    projects = [p for p in load_projects() if not (isinstance(p, dict) and str(p.get("id") or "") == project_id)]
    save_projects(projects)

    manifest = read_model_manifest()
    if project_id in manifest:
        del manifest[project_id]
        write_model_manifest(manifest)


def delete_local_file(rel_path: str) -> None:
    rel = str(rel_path or "").replace("\\", "/").lstrip("/")
    if ".." in rel.split("/"):
        raise ValueError("Invalid path.")
    if not (
        rel.startswith("images/")
        or rel.startswith("models/")
        or rel.startswith("docs/projects/")
    ):
        raise ValueError("Only images/, models/, and docs/projects/ files can be deleted.")

    abs_path = resolve_under(REPO_ROOT, *rel.split("/"))
    if os.path.isfile(abs_path):
        os.remove(abs_path)
    gz_path = abs_path + ".gz"
    if os.path.isfile(gz_path):
        os.remove(gz_path)

    if rel.startswith("images/"):
        rebuild_image_manifest()
    elif rel.startswith("models/"):
        manifest = read_model_manifest()
        changed = False
        for key, value in list(manifest.items()):
            if value == rel:
                del manifest[key]
                changed = True
        if changed:
            write_model_manifest(manifest)


class AdminHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=REPO_ROOT, **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))

    def _client_is_local(self) -> bool:
        host = self.client_address[0]
        return host in ("127.0.0.1", "::1", "localhost")

    def _send_json(self, status: int, payload) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _content_length(self) -> int:
        try:
            return max(0, int(self.headers.get("Content-Length") or "0"))
        except ValueError:
            return 0

    def _discard_body(self, length: int) -> None:
        remaining = max(0, int(length or 0))
        while remaining > 0:
            chunk = self.rfile.read(min(UPLOAD_CHUNK, remaining))
            if not chunk:
                break
            remaining -= len(chunk)

    def _is_json_body(self) -> bool:
        ctype = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        return ctype == "application/json"

    def _upload_filename(self, default: str) -> str:
        raw = str(self.headers.get("X-Filename") or "").strip()
        if raw:
            return sanitize_filename(unquote(raw))
        return sanitize_filename(default)

    def _read_json_body(self) -> dict:
        length = self._content_length()
        if length <= 0:
            return {}
        if length > MAX_JSON_BYTES:
            self._discard_body(length)
            raise ValueError("Request body too large (max 5MB for JSON).")
        raw = self.rfile.read(length)
        if not raw:
            return {}
        data = json.loads(raw.decode("utf-8"))
        if not isinstance(data, dict):
            raise ValueError("JSON body must be an object.")
        return data

    def _read_upload_bytes(self):
        """Return (filename, data) from a binary POST, or legacy JSON+base64."""
        if self._is_json_body():
            body = self._read_json_body()
            filename = sanitize_filename(body.get("filename") or "file")
            data = decode_base64_payload(body.get("contentBase64") or "")
            return filename, data

        filename = self._upload_filename("file")
        length = self._content_length()
        if length <= 0:
            raise ValueError("Empty upload.")
        if length > MAX_UPLOAD_BYTES:
            self._discard_body(length)
            size_mb = length / (1024.0 * 1024.0)
            limit_mb = MAX_UPLOAD_BYTES // (1024 * 1024)
            raise ValueError(
                "File too large (%.1f MB). Maximum is %d MB so it can be published to GitHub."
                % (size_mb, limit_mb)
            )

        chunks = []
        remaining = length
        while remaining > 0:
            chunk = self.rfile.read(min(UPLOAD_CHUNK, remaining))
            if not chunk:
                raise ValueError("Upload ended before all bytes were received.")
            chunks.append(chunk)
            remaining -= len(chunk)
        return filename, b"".join(chunks)

    def _require_local(self) -> bool:
        if self._client_is_local():
            return True
        self._send_json(403, {"error": "Local admin API is only available on localhost."})
        return False

    def do_OPTIONS(self) -> None:
        if not self._require_local():
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Filename")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/health":
            if not self._require_local():
                return
            self._send_json(200, {"ok": True, "mode": "local"})
            return

        if path == "/api/projects":
            if not self._require_local():
                return
            try:
                self._send_json(200, {"projects": enrich_projects(load_projects())})
            except Exception as exc:
                self._send_json(500, {"error": str(exc)})
            return

        super().do_GET()

    def do_PUT(self) -> None:
        if not self._require_local():
            return
        parsed = urlparse(self.path)
        if parsed.path != "/api/projects":
            self._send_json(404, {"error": "Not found"})
            return
        try:
            body = self._read_json_body()
            projects = body.get("projects")
            if not isinstance(projects, list):
                raise ValueError('Body must include a "projects" array.')
            save_projects(projects)
            rebuild_image_manifest()
            self._send_json(200, {"ok": True, "count": len(projects)})
        except Exception as exc:
            self._send_json(400, {"error": str(exc)})

    def do_POST(self) -> None:
        if not self._require_local():
            return
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        try:
            if path == "/api/projects":
                body = self._read_json_body()
                project = upsert_project(body.get("project") or body)
                self._send_json(200, {"ok": True, "project": project})
                return

            if path == "/api/featured":
                body = self._read_json_body()
                project_id = body.get("projectId")
                if project_id is not None and str(project_id).strip() == "":
                    project_id = None
                projects = set_featured_project(project_id)
                self._send_json(200, {"ok": True, "projects": projects})
                return

            match_images = re.match(r"^/api/projects/([^/]+)/images$", path)
            if match_images:
                project_id = sanitize_id(unquote(match_images.group(1)))
                filename, data = self._read_upload_bytes()
                if not os.path.splitext(filename)[1]:
                    filename = sanitize_filename(filename + ".png")
                ext = os.path.splitext(filename)[1].lower()
                if ext not in IMAGE_EXT:
                    raise ValueError("Unsupported image type. Use jpg, png, gif, or webp.")
                if not data:
                    raise ValueError("Empty image upload.")
                dest_dir = resolve_under(IMAGES_DIR, project_id)
                os.makedirs(dest_dir, exist_ok=True)
                # Avoid overwrite collisions
                stem, extension = os.path.splitext(filename)
                candidate = filename
                n = 1
                while os.path.exists(os.path.join(dest_dir, candidate)):
                    candidate = "%s-%d%s" % (stem, n, extension)
                    n += 1
                abs_path = os.path.join(dest_dir, candidate)
                with open(abs_path, "wb") as f:
                    f.write(data)
                rebuild_image_manifest()
                rel = repo_rel(abs_path)
                self._send_json(200, {"ok": True, "url": rel, "path": rel, "name": candidate})
                return

            match_cad = re.match(r"^/api/projects/([^/]+)/cad$", path)
            if match_cad:
                project_id = sanitize_id(unquote(match_cad.group(1)))
                filename, data = self._read_upload_bytes()
                if not os.path.splitext(filename)[1]:
                    filename = sanitize_filename(filename + ".glb")
                ext = os.path.splitext(filename)[1].lower()
                if ext not in CAD_EXT:
                    raise ValueError("Unsupported CAD type. Use step, stp, glb, or gltf.")
                if not data:
                    raise ValueError("Empty CAD upload.")
                os.makedirs(MODELS_DIR, exist_ok=True)
                stem = project_id
                candidate = stem + ext
                n = 1
                while os.path.exists(os.path.join(MODELS_DIR, candidate)):
                    candidate = "%s-%d%s" % (stem, n, ext)
                    n += 1
                abs_path = resolve_under(MODELS_DIR, candidate)
                with open(abs_path, "wb") as f:
                    f.write(data)
                gzip_step_companion(abs_path)
                rel = repo_rel(abs_path)
                manifest = read_model_manifest()
                manifest[project_id] = rel
                write_model_manifest(manifest)
                self._send_json(200, {"ok": True, "url": rel, "path": rel, "name": candidate})
                return

            match_docs = re.match(r"^/api/projects/([^/]+)/documents$", path)
            if match_docs:
                project_id = sanitize_id(unquote(match_docs.group(1)))
                filename, data = self._read_upload_bytes()
                if not os.path.splitext(filename)[1]:
                    filename = sanitize_filename(filename + ".pdf")
                ext = os.path.splitext(filename)[1].lower()
                if ext not in DOC_EXT:
                    raise ValueError("Unsupported document type. Use PDF.")
                if not data:
                    raise ValueError("Empty document upload.")
                dest_dir = resolve_under(DOCS_DIR, project_id)
                os.makedirs(dest_dir, exist_ok=True)
                stem, extension = os.path.splitext(filename)
                candidate = filename
                n = 1
                while os.path.exists(os.path.join(dest_dir, candidate)):
                    candidate = "%s-%d%s" % (stem, n, extension)
                    n += 1
                abs_path = os.path.join(dest_dir, candidate)
                with open(abs_path, "wb") as f:
                    f.write(data)
                protection = None
                if protect_uploaded_pdf:
                    try:
                        protection = protect_uploaded_pdf(abs_path)
                    except Exception as exc:
                        protection = {"error": str(exc)}
                rel = repo_rel(abs_path)
                self._send_json(
                    200,
                    {
                        "ok": True,
                        "url": rel,
                        "path": rel,
                        "name": candidate,
                        "document": {"url": rel, "name": candidate},
                        "protection": protection,
                    },
                )
                return

            if path == "/api/protect/sign-all":
                if not sign_all_pdfs:
                    raise ValueError(
                        "Work protection is unavailable. Run: pip install -r requirements-work.txt"
                    )
                result = sign_all_pdfs()
                self._send_json(200, {"ok": True, **result})
                return

            if path == "/api/protect/manifest":
                if not build_work_manifest:
                    raise ValueError(
                        "Work protection is unavailable. Run: pip install -r requirements-work.txt"
                    )
                manifest = build_work_manifest()
                self._send_json(
                    200,
                    {"ok": True, "path": "data/work-manifest.json", "fileCount": len(manifest.get("files") or [])},
                )
                return

            self._send_json(404, {"error": "Not found"})
        except Exception as exc:
            self._send_json(400, {"error": str(exc)})

    def do_DELETE(self) -> None:
        if not self._require_local():
            return
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        query = parse_qs(parsed.query)

        try:
            match_project = re.match(r"^/api/projects/([^/]+)$", path)
            if match_project:
                delete_project(unquote(match_project.group(1)))
                self._send_json(200, {"ok": True})
                return

            if path == "/api/files":
                rel = (query.get("path") or [""])[0]
                delete_local_file(unquote(rel))
                self._send_json(200, {"ok": True})
                return

            self._send_json(404, {"error": "Not found"})
        except Exception as exc:
            self._send_json(400, {"error": str(exc)})


class ExclusiveHTTPServer(ThreadingHTTPServer):
    # On Windows, SO_REUSEADDR allows a second process to bind the same port,
    # which produces "Connection was reset" / empty replies for clients.
    allow_reuse_address = False


def main() -> None:
    ensure_dirs()
    if not os.path.isfile(PROJECTS_PATH):
        write_json(PROJECTS_PATH, [])
    rebuild_image_manifest()
    ensure_step_gzip_files()

    try:
        server = ExclusiveHTTPServer((HOST, PORT), AdminHandler)
    except OSError as exc:
        print(
            "Could not bind http://%s:%d/ — port may already be in use.\n"
            "Stop the other local_admin_server.py process (or free port %d), then retry.\n"
            "Details: %s" % (HOST, PORT, PORT, exc),
            file=sys.stderr,
        )
        sys.exit(1)

    print("Local admin server running at http://%s:%d/" % (HOST, PORT))
    print("Open http://%s:%d/admin.html to edit projects." % (HOST, PORT))
    print("After saving, commit and push to publish on GitHub Pages.")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
