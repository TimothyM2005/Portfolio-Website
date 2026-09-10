# Portfolio

A portfolio site with **Projects**, **Research**, and **Resume** on GitHub Pages. Project editing uses a local **Admin** page (not linked in the public nav).

## View / edit locally (recommended)

Run the local admin server from the repo root (Python 3, no extra packages):

```bash
python scripts/local_admin_server.py
```

Then open:

- Site: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- Admin: [http://127.0.0.1:8000/admin.html](http://127.0.0.1:8000/admin.html)

In Admin you can add/edit/delete projects and upload **images**, **STEP/GLB/GLTF**, and **PDF** slide decks / documents. Changes are written into this repo (`data/projects.json`, `images/`, `models/`, `docs/projects/`).

### Publish to GitHub Pages

After saving in Admin:

```bash
git add -A
git commit -m "Update projects"
git push
```

GitHub Pages will redeploy the static site. The live site is **read-only** — editing only works through the local admin server.

### Upload a PDF into a project’s detail view

1. Run `python scripts/local_admin_server.py` and open Admin.
2. Edit (or create) a project and set the **Project ID**.
3. Under **Detail documents / slide decks (PDF)**, choose your PDF(s) → **Upload selected PDFs**.
4. Click **Save project**.
5. Open the Projects page, click the card — documents appear as short Open/Download links, with a PDF preview below the write-up.

Files land in `docs/projects/<project-id>/` and are listed on the project as a `documents` array in `data/projects.json`.

## Protecting your work (copyright & fingerprints)

Nothing on the public web can fully stop someone from copying a file, but you can **mark ownership**, **discourage casual reuse**, and **prove you had the original**.

1. Install optional signing tools (one time):

   ```bash
   pip install -r requirements-work.txt
   ```

2. Edit `data/copyright.json` if you want different owner text, watermark wording, or to turn stamping on/off.

3. **Automatic:** when you upload a PDF through local Admin, it is stamped with copyright metadata and a light diagonal watermark, and `data/work-manifest.json` is refreshed.

4. **Batch:** sign every PDF under `docs/` and rebuild the manifest:

   ```bash
   python scripts/sign_work.py
   ```

   Or use **Admin → Work protection → Sign all PDFs & refresh manifest**.

The manifest lists SHA-256 hashes for PDFs, images, and CAD under `docs/`, `images/`, and `models/`. Commit it with your site — together with git history, it helps show you published those exact files first.

The live site also shows copyright notices in the footer and a subtle overlay on embedded PDF previews.

**Note:** this is metadata + watermarking + fingerprinting, not a legal digital certificate (Adobe PKI). For court-grade cryptographic signing, export PDFs from Adobe Acrobat or similar with a purchased document-signing certificate.

## Publishing on GitHub Pages (first-time setup)

1. Create a repository and push the project (e.g. branch `main`, root folder).
2. In the repository go to **Settings → Pages**.
3. Under **Source** choose **Deploy from a branch**.
4. Select branch **main** and folder **/ (root)**.
5. The site will be available at `https://<owner>.github.io/<repo>/` after the deployment finishes.

## Adding project images (manual alternative)

Each project can show a cycling image carousel. Folder workflow (also what Admin uses under the hood):

1. Put images in `images/<project-id>/` (any filenames).
2. Run `python scripts/build_image_manifest.py` (or skip this — the local admin server rebuilds the manifest automatically).
3. Commit and push.

Supported formats: JPG, PNG, GIF, WebP.

## Project detail popup + CAD viewer

Click any project card to open a detail modal with goal / details / documents (PDF) / outcome / technical text and an interactive CAD viewer.

### Linking CAD models

**Preferred:** upload via local Admin (writes into `models/` and updates `models/manifest.json`). CAD files can be up to **100 MB** (GitHub’s file-size limit). Large STEP assemblies work for upload but are slower in the in-browser viewer — a `.glb` export is usually better.

Manual alternative:

1. Export from SolidWorks/Onshape as **`.glb` or `.gltf`** (recommended), or use **`.step` / `.stp`**.
2. Put the file (and any companion `.bin` for glTF) in `models/`.
3. Map it in `models/manifest.json`:

```json
{
  "fsae-gps": "models/gps_case.gltf",
  "bell-crank-fea": "models/bell_crank.step"
}
```

Cards with a linked model show a **3D CAD** pill. `.glb/.gltf` is the most reliable for web viewing. STEP files are gzipped on upload and tessellated in a **Web Worker** (Fast preview by default) so the page stays interactive; use **Full quality** in the viewer for a denser mesh.

## Printable export

Open [print.html](print.html) (linked from the site footer as "Printable version") for a single-page, print-friendly version of the portfolio — profile info plus every project's goal/outcome/technical writeup and a thumbnail. Click **Print / Save as PDF** and choose "Save as PDF" in the browser print dialog to generate a document you can hand out or attach to applications. It pulls live from `data/projects.json`, so it always matches the current site content.

## Structure

- **index.html** — Projects page (search, filters, featured highlight, CAD modal).
- **print.html** — Printable/PDF-exportable summary of the portfolio.
- **admin.html** — Local project editor (featured picker, uploads, viewer defaults).
- **data/projects.json** — Project content source of truth for GitHub Pages.
- **data/site-meta.json** — Last-updated date and short changelog.
- **scripts/local_admin_server.py** — Localhost static server + write API for Admin.
- **scripts/projects-store.js** — Loads/saves projects (local API when available).
- **scripts/projects.js** — Project card rendering helpers.
- **scripts/project-modal.js** — Project detail popup + CAD viewer host.
- **scripts/model-viewer.js** / **scripts/step-worker.js** — Three.js viewer + background STEP tessellation.
- **images/** + **images/manifest.json** — Carousel images by project ID.
- **models/** + **models/manifest.json** — CAD models (`.glb` / `.gltf` / `.step`).
- **docs/projects/** — Project PDFs shown in the detail popup.
- **docs/resume/** — Resume PDF for the Resume page.
- **research.html** / **resume.html** / **style.css** / **favicon.svg**

## Optional: Firebase (not required)

Firebase Auth / Firestore / Storage code still exists for an older live-edit workflow, but the supported path is **local admin → git push**. You do not need to fill in `scripts/firebase-config.js` for normal use.
