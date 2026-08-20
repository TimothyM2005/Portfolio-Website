# Portfolio

A portfolio site with **Projects**, **Research**, **Resume**, and an **Admin** page for adding projects. Built for GitHub Pages.

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

## Admin login (add projects from the website)

Projects are rendered from data (not hardcoded HTML). Without Firebase, the site reads [`data/projects.json`](data/projects.json). With Firebase configured, the live site can load projects from Firestore, and you can add/edit them at **`/admin.html`**.

### 1. Create a Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/) and create a project.
2. Add a **Web** app and copy the config object.
3. Paste the values into [`scripts/firebase-config.js`](scripts/firebase-config.js) (replace the `YOUR_*` placeholders).
4. Commit and push that file so GitHub Pages can use it.

### 2. Enable Auth + Firestore + Storage

1. **Authentication → Sign-in method → Email/Password** → enable.
2. **Authentication → Users → Add user** → create your admin email/password.
3. **Firestore Database → Create database** (start in production mode is fine).
4. Set these security rules (**Firestore → Rules**):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /projects/{projectId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

5. **Storage → Get started** and set these rules (**Storage → Rules**):

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /projects/{projectId}/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null
                   && request.resource.size < 50 * 1024 * 1024;
    }
  }
}
```

### 3. Use the admin page

1. Open `https://<your-site>/admin.html` (or `http://localhost:8000/admin.html`).
2. Sign in with the Firebase user you created.
3. Optionally click **Seed from local JSON** once to copy existing projects into Firestore.
4. Add/edit a project, then:
   - Set/confirm the **Project ID**
   - Choose images → **Upload selected images**
   - Choose a STEP/GLB/GLTF file → **Upload CAD file**
   - Click **Save project**
5. Refresh the Projects page — carousels and the CAD popup use the uploaded files automatically.

**Notes**

- Uploaded files live in Firebase Storage under `projects/<id>/...` and their URLs are saved on the project document.
- Local folder images (`images/<id>/`) and `models/manifest.json` still work as fallbacks when a project has no uploaded assets.
- Image upload from admin is supported; you no longer need to edit manifests by hand for portal-managed projects.
- Until Firebase is configured, the public site still works from `data/projects.json`.

## Adding project images

Each project can show a cycling image carousel (auto-advance with optional manual prev/next and dots). You only need to follow the **folder** structure; any image filenames are fine.

1. Put images in the project’s folder under `images/` using the project ID (examples: `fsae-gps`, `gearbox-design`, `bell-crank-fea`, …).
2. From the repo root, run: **`python scripts/build_image_manifest.py`** (or `node scripts/build-image-manifest.js` if you use Node). This scans the folders and updates `images/manifest.json`.
3. Commit and push; the site will load images from the manifest.

Supported formats: JPG, PNG, GIF, WebP. Image order in the carousel follows alphabetical order by filename.

## Project detail popup + CAD viewer

Click any project card to open a detail modal with:

- Full goal / details / outcome / technical text
- Interactive CAD viewer (orbit + zoom)

### Linking CAD models

1. Export from SolidWorks/Onshape as **`.glb` or `.gltf`** (recommended), or use **`.step` / `.stp`**.
2. Put the file (and any companion `.bin` for glTF) in `models/`.
3. Map it in `models/manifest.json`:

```json
{
  "fsae-gps": "models/gps_case.gltf",
  "bell-crank-fea": "models/bell_crank.step"
}
```

Cards with a linked model show a **3D CAD** pill. Opening that card loads the model in the popup viewer.

**Note:** `.glb/.gltf` is the most reliable path for web viewing. STEP support uses an in-browser OCCT importer and may be slower on large assemblies; if a STEP fails to load, convert it to glTF and update the manifest.

## Adding 3D models (.glb/.gltf)

Projects can optionally render interactive 3D viewers on the `index.html` cards.

1. Put your model files in `models/` (you can organize in subfolders, e.g. `models/fsae-gps/mount.glb`).
2. Open `models/manifest.json` and map project IDs to model file paths.
3. The viewer appears automatically for each mapped project.

Example:

```json
{
  "fsae-gps": "models/gps_case.gltf"
}
```

## Structure

- **index.html** — Projects page; loads cards from Firestore or `data/projects.json`.
- **admin.html** — Login + add/edit/delete projects (Firebase Auth required).
- **data/projects.json** — Local/fallback project data.
- **scripts/firebase-config.js** — Your Firebase web config.
- **scripts/projects-store.js** — Firebase Auth/Firestore helpers.
- **scripts/projects.js** — Project card rendering helpers.
- **scripts/project-modal.js** — Project detail popup + CAD viewer host.
- **scripts/model-viewer.js** — Three.js viewer for `.glb/.gltf` and `.step/.stp`.
- **models/manifest.json** — Optional CAD model mappings by project ID.
- **research.html** — Research papers.
- **resume.html** — Resume PDF download/embed.
- **style.css** — Shared layout and theme.
