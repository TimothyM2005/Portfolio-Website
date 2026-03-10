# Portfolio

A single-page portfolio site for design, CAD, and programming projects. Built for GitHub Pages.

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

- **index.html** — Single-page layout: responsive patchwork grid of project cards, each with an optional image carousel and Goal / Outcome / Technical sections.
- **README.md** — This file.
