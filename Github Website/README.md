# Timothy Mitchell — Portfolio

A GitHub portfolio site showcasing design, CAD, and programming projects. Content is based on the official portfolio PDF.

## View locally

Open `index.html` in your browser, or run a simple server:

```bash
# Python
python -m http.server 8000

# Node (npx)
npx serve
```

Then visit `http://localhost:8000`.

## Publish on GitHub Pages

1. Create a new repository on GitHub (e.g. `timothy-mitchell` or `portfolio`).
2. Initialize git in this folder (if not already):
   ```bash
   git init
   git add .
   git commit -m "Initial portfolio"
   ```
3. Add your repo and push:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git branch -M main
   git push -u origin main
   ```
4. In the repo: **Settings → Pages**.
5. Under **Source**, choose **Deploy from a branch**.
6. Branch: **main**, folder: **/ (root)**. Save.
7. Your site will be at `https://YOUR_USERNAME.github.io/YOUR_REPO/` after a minute or two.

## Customize

- **Footer link**: Edit the `GitHub` link in `index.html` to point to your profile or repo.
- **Projects**: Edit the project cards in `index.html` to add links (e.g. to Onshape docs or images).
- **PDF**: The original portfolio is at `Portfolio - Timothy Mitchell Official.pdf` (in your Downloads). You can add a “Download PDF” link in the footer if you add the PDF to the repo.

## Structure

- `index.html` — Single-page portfolio with all projects (FSAE, Rival Robotics, Freshman Design, WCP Cadathon, FRC, Battle Bot, etc.).
- Dark theme, responsive layout, SolidWorks/Onshape tags, and Goal / Outcome / Technical sections per project.
