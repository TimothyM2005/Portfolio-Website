"""
Scans the images/ folder and writes images/manifest.json with all image
files in each project subfolder. No naming convention—any image in the
folder is included. Run from repo root: python scripts/build_image_manifest.py
"""

import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
IMAGES_DIR = os.path.join(REPO_ROOT, "images")
MANIFEST_PATH = os.path.join(IMAGES_DIR, "manifest.json")
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp"}

manifest = {}

if not os.path.isdir(IMAGES_DIR):
    os.makedirs(IMAGES_DIR, exist_ok=True)
    with open(MANIFEST_PATH, "w") as f:
        json.dump(manifest, f, indent=2)
    print("Created empty images/manifest.json (images folder was missing).")
    raise SystemExit(0)

for name in sorted(os.listdir(IMAGES_DIR)):
    subdir = os.path.join(IMAGES_DIR, name)
    if not os.path.isdir(subdir) or name.startswith("."):
        continue
    rel_dir = os.path.relpath(subdir, REPO_ROOT).replace("\\", "/")
    files = []
    for f in sorted(os.listdir(subdir)):
        if os.path.splitext(f)[1].lower() in IMAGE_EXT:
            files.append(rel_dir + "/" + f)
    if files:
        manifest[name] = files

with open(MANIFEST_PATH, "w") as f:
    json.dump(manifest, f, indent=2)

print("Updated images/manifest.json for", len(manifest), "project(s).")
