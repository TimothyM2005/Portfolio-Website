# Portfolio

A portfolio site with three pages: **Projects**, **Research**, and **Resume**. Same header, contact bar, and footer on every page; only the main content changes. Built for GitHub Pages.

## View locally

Open `index.html` in a browser, or run a local server:

```bash
# Python
python -m http.server 8000

# Node
npx serve
```

Then open `http://localhost:8000`.

## Publishing on GitHub Pages

1. Create a repository and push the project (e.g. branch `main`, root folder).
2. In the repository go to **Settings → Pages**.
3. Under **Source** choose **Deploy from a branch**.
4. Select branch **main** and folder **/ (root)**.
5. The site will be available at `https://<owner>.github.io/<repo>/` after the deployment finishes.

## Adding project images

Each project can show a cycling image carousel (auto-advance with optional manual prev/next and dots). You only need to follow the **folder** structure; any image filenames are fine.

1. Put images in the project’s folder under `images/` using these folder names: `fsae-gps`, `rival-fourbar`, `freshman-lego`, `rival-shuttlecock`, `rival-chassis`, `battlebot`, `wcp-arm`, `wcp-basketball`, `wcp-launcher`, `rival-arm`, `frc-intake`, `frc-robot`.
2. From the repo root, run: **`python scripts/build_image_manifest.py`** (or `node scripts/build-image-manifest.js` if you use Node). This scans the folders and updates `images/manifest.json`.
3. Commit and push; the site will load images from the manifest. No need to edit `index.html` or use a specific naming format—only the folder matters.

Supported formats: JPG, PNG, GIF, WebP. Image order in the carousel follows alphabetical order by filename.

## Structure

- **index.html** — Projects: responsive masonry grid of project cards with optional image carousels.
- **research.html** — Research papers: list entries with title, authors, link to PDF, optional abstract.
- **resume.html** — Resume: download link for PDF and optional embedded PDF viewer.
- **style.css** — Shared layout, header, footer, contact bar, and site navigation. Edit this file to change the look of all three pages at once.
- **README.md** — This file.

To add a resume: put your PDF in the repo (e.g. `files/Resume.pdf`), then in `resume.html` set the "Download PDF" link `href` and optionally uncomment the iframe and set its `src` to the same path.
