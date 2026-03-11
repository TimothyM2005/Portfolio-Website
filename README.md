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

Each project can show a cycling image carousel (auto-advance with optional manual prev/next and dots).

1. Create an `images` folder in the project root.
2. Add one subfolder per project using the project IDs: `fsae-gps`, `rival-fourbar`, `freshman-lego`, `rival-shuttlecock`, `rival-chassis`, `battlebot`, `wcp-arm`, `wcp-basketball`, `wcp-launcher`, `rival-arm`, `frc-intake`, `frc-robot`.
3. Put your image files in the matching subfolder (e.g. `images/fsae-gps/1.jpg`, `images/fsae-gps/2.jpg`).
4. In `index.html`, find the `PROJECT_IMAGES` object and add the image paths for each project, for example:

   ```javascript
   const PROJECT_IMAGES = {
     'fsae-gps': ['images/fsae-gps/1.jpg', 'images/fsae-gps/2.jpg'],
     // ... other projects
   };
   ```

Supported image formats include JPG, PNG, and WebP. Order in the array is the slide order.

## Structure

- **index.html** — Projects: responsive masonry grid of project cards with optional image carousels.
- **research.html** — Research papers: list entries with title, authors, link to PDF, optional abstract.
- **resume.html** — Resume: download link for PDF and optional embedded PDF viewer.
- **style.css** — Shared layout, header, footer, contact bar, and site navigation. Edit this file to change the look of all three pages at once.
- **README.md** — This file.

To add a resume: put your PDF in the repo (e.g. `files/Resume.pdf`), then in `resume.html` set the "Download PDF" link `href` and optionally uncomment the iframe and set its `src` to the same path.
