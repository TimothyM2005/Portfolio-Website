/**
 * Scans the images/ folder and writes images/manifest.json with all image
 * files in each project subfolder. No naming convention—any image in the
 * folder is included. Run from repo root: node scripts/build-image-manifest.js
 */

const fs = require('fs');
const path = require('path');

const IMAGES_DIR = path.join(__dirname, '..', 'images');
const MANIFEST_PATH = path.join(IMAGES_DIR, 'manifest.json');
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

function getImagesInDir(dirPath) {
  const base = path.basename(dirPath);
  const relDir = path.relative(path.dirname(IMAGES_DIR), dirPath).replace(/\\/g, '/');
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = entries
    .filter(e => e.isFile() && IMAGE_EXT.has(path.extname(e.name).toLowerCase()))
    .map(e => relDir + '/' + e.name)
    .sort();
  return files;
}

const manifest = {};

if (!fs.existsSync(IMAGES_DIR)) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log('Created empty images/manifest.json (no images folder yet).');
  process.exit(0);
}

const subdirs = fs.readdirSync(IMAGES_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory() && !d.name.startsWith('.'));

for (const d of subdirs) {
  const dirPath = path.join(IMAGES_DIR, d.name);
  const list = getImagesInDir(dirPath);
  if (list.length) manifest[d.name] = list;
}

fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
console.log('Updated images/manifest.json for:', Object.keys(manifest).length, 'project(s).');
