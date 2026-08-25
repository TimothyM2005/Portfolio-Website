import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";
import { normalizeProject, sortProjects } from "./projects.js?v=feat11";

const PROJECTS_COLLECTION = "projects";
const FIREBASE_VERSION = "10.12.2";
const FIREBASE_CDN = "https://www.gstatic.com/firebasejs/" + FIREBASE_VERSION + "/";

let app = null;
let auth = null;
let db = null;
let storage = null;
let firebaseModulesPromise = null;
let localApiAvailable = null;

function loadFirebaseModules() {
  if (!firebaseModulesPromise) {
    firebaseModulesPromise = Promise.all([
      import(FIREBASE_CDN + "firebase-app.js"),
      import(FIREBASE_CDN + "firebase-auth.js"),
      import(FIREBASE_CDN + "firebase-firestore.js"),
      import(FIREBASE_CDN + "firebase-storage.js")
    ]).then(function (mods) {
      return {
        initializeApp: mods[0].initializeApp,
        getAuth: mods[1].getAuth,
        onAuthStateChanged: mods[1].onAuthStateChanged,
        signInWithEmailAndPassword: mods[1].signInWithEmailAndPassword,
        signOut: mods[1].signOut,
        getFirestore: mods[2].getFirestore,
        collection: mods[2].collection,
        getDocs: mods[2].getDocs,
        doc: mods[2].doc,
        setDoc: mods[2].setDoc,
        deleteDoc: mods[2].deleteDoc,
        query: mods[2].query,
        orderBy: mods[2].orderBy,
        getStorage: mods[3].getStorage,
        ref: mods[3].ref,
        uploadBytes: mods[3].uploadBytes,
        getDownloadURL: mods[3].getDownloadURL,
        deleteObject: mods[3].deleteObject
      };
    });
  }
  return firebaseModulesPromise;
}

async function ensureFirebase() {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured. Update scripts/firebase-config.js.");
  }
  const fb = await loadFirebaseModules();
  if (!app) {
    app = fb.initializeApp(firebaseConfig);
    auth = fb.getAuth(app);
    db = fb.getFirestore(app);
    storage = fb.getStorage(app);
  }
  return { app: app, auth: auth, db: db, storage: storage, fb: fb };
}

function sanitizeFileName(name) {
  return String(name || "file")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "file";
}

const MAX_LOCAL_UPLOAD_BYTES = 100 * 1024 * 1024;

async function apiJson(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (err) {
    throw new Error(
      "Failed to reach the local admin server. If you were uploading a large CAD file, keep it under 100 MB, restart python scripts/local_admin_server.py, then hard-refresh Admin (Ctrl+F5)."
    );
  }
  let payload = null;
  try {
    payload = await response.json();
  } catch (err) {
    payload = null;
  }
  if (!response.ok) {
    const message = payload && payload.error ? payload.error : "Request failed (" + response.status + ")";
    throw new Error(message);
  }
  return payload || {};
}

export async function detectLocalAdmin() {
  if (localApiAvailable !== null) return localApiAvailable;
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (!response.ok) {
      localApiAvailable = false;
      return false;
    }
    const data = await response.json();
    localApiAvailable = !!(data && data.ok && data.mode === "local");
  } catch (err) {
    localApiAvailable = false;
  }
  return localApiAvailable;
}

export function isLocalAdminMode() {
  return localApiAvailable === true;
}

async function loadLocalProjects() {
  const response = await fetch("data/projects.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Unable to load data/projects.json");
  }
  const data = await response.json();
  return sortProjects((data || []).map(normalizeProject).filter(Boolean));
}

async function loadLocalApiProjects() {
  const data = await apiJson("/api/projects", { cache: "no-store" });
  return sortProjects((data.projects || []).map(normalizeProject).filter(Boolean));
}

async function loadFirestoreProjects() {
  const { db: firestore, fb } = await ensureFirebase();
  let snapshot;
  try {
    snapshot = await fb.getDocs(fb.query(fb.collection(firestore, PROJECTS_COLLECTION), fb.orderBy("order")));
  } catch (err) {
    snapshot = await fb.getDocs(fb.collection(firestore, PROJECTS_COLLECTION));
  }

  const projects = [];
  snapshot.forEach(function (item) {
    const data = item.data() || {};
    const normalized = normalizeProject(Object.assign({}, data, { id: data.id || item.id }));
    if (normalized) projects.push(normalized);
  });
  return sortProjects(projects);
}

export async function loadProjects(options) {
  const preferLocalAdmin = !!(options && options.preferLocalAdmin);
  const preferFirestore = !!(options && options.preferFirestore);

  if (preferLocalAdmin || (await detectLocalAdmin())) {
    try {
      return {
        source: "local-api",
        projects: await loadLocalApiProjects()
      };
    } catch (err) {
      if (preferLocalAdmin) throw err;
      console.warn("Local admin API failed; using static JSON.", err);
    }
  }

  if (!isFirebaseConfigured()) {
    return {
      source: "local",
      projects: await loadLocalProjects()
    };
  }

  try {
    const projects = await loadFirestoreProjects();
    if (projects.length === 0 && !preferFirestore) {
      const local = await loadLocalProjects();
      return { source: "local-fallback", projects: local };
    }
    return { source: "firestore", projects: projects };
  } catch (err) {
    if (preferFirestore) throw err;
    console.warn("Firestore load failed; using local projects.", err);
    return {
      source: "local-fallback",
      projects: await loadLocalProjects()
    };
  }
}

export async function saveProject(project) {
  if (await detectLocalAdmin()) {
    const normalized = normalizeProject(project);
    if (!normalized) {
      throw new Error("Project id and fields are required.");
    }
    if (normalized.order == null) {
      normalized.order = Date.now();
    }
    const result = await apiJson("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: normalized })
    });
    return normalizeProject(result.project || normalized);
  }

  const { db: firestore, fb } = await ensureFirebase();
  const normalized = normalizeProject(project);
  if (!normalized) {
    throw new Error("Project id and fields are required.");
  }
  if (normalized.order == null) {
    normalized.order = Date.now();
  }
  // Keep a single featured project in Firestore too.
  if (normalized.featured) {
    const snapshot = await fb.getDocs(fb.collection(firestore, PROJECTS_COLLECTION));
    const clears = [];
    snapshot.forEach(function (item) {
      if (item.id === normalized.id) return;
      const data = item.data() || {};
      if (data.featured) {
        clears.push(fb.setDoc(fb.doc(firestore, PROJECTS_COLLECTION, item.id), { featured: false }, { merge: true }));
      }
    });
    await Promise.all(clears);
  }
  await fb.setDoc(fb.doc(firestore, PROJECTS_COLLECTION, normalized.id), normalized, { merge: true });
  return normalized;
}

export async function setFeaturedProject(projectId) {
  const id = String(projectId || "").trim();

  if (await detectLocalAdmin()) {
    const result = await apiJson("/api/featured", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: id || null })
    });
    return sortProjects((result.projects || []).map(normalizeProject).filter(Boolean));
  }

  const projects = await loadProjects({ preferFirestore: true });
  const next = projects.projects.map(function (project) {
    return Object.assign({}, project, { featured: !!id && project.id === id });
  });
  for (let i = 0; i < next.length; i += 1) {
    await saveProject(next[i]);
  }
  return next;
}

export async function deleteProject(projectId) {
  const id = String(projectId || "").trim();
  if (!id) throw new Error("Project id is required.");

  if (await detectLocalAdmin()) {
    await apiJson("/api/projects/" + encodeURIComponent(id), { method: "DELETE" });
    return;
  }

  const { db: firestore, fb } = await ensureFirebase();
  await fb.deleteDoc(fb.doc(firestore, PROJECTS_COLLECTION, id));
}

export async function uploadProjectFile(projectId, file, folder) {
  const id = String(projectId || "").trim();
  if (!id) throw new Error("Save/set a Project ID before uploading files.");
  if (!file) throw new Error("No file selected.");

  const folderKey =
    folder === "cad" ? "cad" : folder === "documents" ? "documents" : "images";

  if (await detectLocalAdmin()) {
    if (file.size > MAX_LOCAL_UPLOAD_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      throw new Error(
        "File is too large (" + sizeMb + " MB). Maximum is 100 MB so it can be published to GitHub."
      );
    }
    const result = await apiJson("/api/projects/" + encodeURIComponent(id) + "/" + folderKey, {
      method: "POST",
      headers: {
        "X-Filename": encodeURIComponent(file.name || sanitizeFileName("file"))
      },
      body: file
    });
    return {
      url: result.url,
      path: result.path || result.url,
      name: result.name || file.name,
      document: result.document || null
    };
  }

  const { storage: firebaseStorage, fb } = await ensureFirebase();
  const safeName = Date.now() + "-" + sanitizeFileName(file.name);
  const path = "projects/" + id + "/" + folderKey + "/" + safeName;
  const storageRef = fb.ref(firebaseStorage, path);
  await fb.uploadBytes(storageRef, file, {
    contentType: file.type || "application/octet-stream"
  });
  const url = await fb.getDownloadURL(storageRef);
  return {
    url: url,
    path: path,
    name: file.name,
    document: folderKey === "documents" ? { url: url, name: file.name } : null
  };
}

export async function deleteStorageUrl(url) {
  if (!url) return;

  if (await detectLocalAdmin()) {
    const rel = String(url).replace(/^\.\//, "").replace(/^\//, "");
    if (
      rel.indexOf("images/") === 0 ||
      rel.indexOf("models/") === 0 ||
      rel.indexOf("docs/projects/") === 0
    ) {
      await apiJson("/api/files?path=" + encodeURIComponent(rel), { method: "DELETE" });
    }
    return;
  }

  if (String(url).indexOf("firebasestorage.googleapis.com") === -1) {
    return;
  }
  try {
    const { storage: firebaseStorage, fb } = await ensureFirebase();
    const encodedPath = decodeURIComponent(String(url).split("/o/")[1].split("?")[0]);
    await fb.deleteObject(fb.ref(firebaseStorage, encodedPath));
  } catch (err) {
    console.warn("Unable to delete storage object:", err);
  }
}

export async function seedProjectsFromLocal() {
  if (await detectLocalAdmin()) {
    throw new Error("Local mode already uses data/projects.json — no seed needed.");
  }
  const local = await loadLocalProjects();
  for (let i = 0; i < local.length; i += 1) {
    const project = Object.assign({}, local[i], { order: i + 1 });
    await saveProject(project);
  }
  return local.length;
}

export function watchAuth(callback) {
  if (!isFirebaseConfigured()) {
    callback(null);
    return function () {};
  }
  let unsubscribe = function () {};
  ensureFirebase()
    .then(function (ctx) {
      unsubscribe = ctx.fb.onAuthStateChanged(ctx.auth, callback);
    })
    .catch(function (err) {
      console.error(err);
      callback(null);
    });
  return function () {
    unsubscribe();
  };
}

export async function login(email, password) {
  const { auth: firebaseAuth, fb } = await ensureFirebase();
  const result = await fb.signInWithEmailAndPassword(firebaseAuth, email, password);
  return result.user;
}

export async function logout() {
  if (!isFirebaseConfigured()) return;
  const { auth: firebaseAuth, fb } = await ensureFirebase();
  await fb.signOut(firebaseAuth);
}

export { isFirebaseConfigured };
