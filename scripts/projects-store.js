import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";
import { normalizeProject, sortProjects } from "./projects.js";

const PROJECTS_COLLECTION = "projects";
const FIREBASE_VERSION = "10.12.2";
const FIREBASE_CDN = "https://www.gstatic.com/firebasejs/" + FIREBASE_VERSION + "/";

let app = null;
let auth = null;
let db = null;
let storage = null;
let firebaseModulesPromise = null;

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

async function loadLocalProjects() {
  const response = await fetch("data/projects.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Unable to load data/projects.json");
  }
  const data = await response.json();
  return sortProjects((data || []).map(normalizeProject).filter(Boolean));
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
  const preferFirestore = !!(options && options.preferFirestore);

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
  const { db: firestore, fb } = await ensureFirebase();
  const normalized = normalizeProject(project);
  if (!normalized) {
    throw new Error("Project id and fields are required.");
  }
  if (normalized.order == null) {
    normalized.order = Date.now();
  }
  await fb.setDoc(fb.doc(firestore, PROJECTS_COLLECTION, normalized.id), normalized, { merge: true });
  return normalized;
}

export async function deleteProject(projectId) {
  const { db: firestore, fb } = await ensureFirebase();
  const id = String(projectId || "").trim();
  if (!id) throw new Error("Project id is required.");
  await fb.deleteDoc(fb.doc(firestore, PROJECTS_COLLECTION, id));
}

export async function uploadProjectFile(projectId, file, folder) {
  const { storage: firebaseStorage, fb } = await ensureFirebase();
  const id = String(projectId || "").trim();
  if (!id) throw new Error("Save/set a Project ID before uploading files.");
  if (!file) throw new Error("No file selected.");

  const safeFolder = folder === "cad" ? "cad" : "images";
  const safeName = Date.now() + "-" + sanitizeFileName(file.name);
  const path = "projects/" + id + "/" + safeFolder + "/" + safeName;
  const storageRef = fb.ref(firebaseStorage, path);
  await fb.uploadBytes(storageRef, file, {
    contentType: file.type || "application/octet-stream"
  });
  const url = await fb.getDownloadURL(storageRef);
  return { url: url, path: path, name: file.name };
}

export async function deleteStorageUrl(url) {
  if (!url || String(url).indexOf("firebasestorage.googleapis.com") === -1) {
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
