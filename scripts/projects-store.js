import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";
import { normalizeProject, sortProjects } from "./projects.js";

const PROJECTS_COLLECTION = "projects";
let app = null;
let auth = null;
let db = null;

function ensureFirebase() {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured. Update scripts/firebase-config.js.");
  }
  if (!app) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  }
  return { app: app, auth: auth, db: db };
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
  const { db: firestore } = ensureFirebase();
  let snapshot;
  try {
    snapshot = await getDocs(query(collection(firestore, PROJECTS_COLLECTION), orderBy("order")));
  } catch (err) {
    // Fallback if order field/index is missing.
    snapshot = await getDocs(collection(firestore, PROJECTS_COLLECTION));
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
  const { db: firestore } = ensureFirebase();
  const normalized = normalizeProject(project);
  if (!normalized) {
    throw new Error("Project id and fields are required.");
  }
  if (normalized.order == null) {
    normalized.order = Date.now();
  }
  await setDoc(doc(firestore, PROJECTS_COLLECTION, normalized.id), normalized, { merge: true });
  return normalized;
}

export async function deleteProject(projectId) {
  const { db: firestore } = ensureFirebase();
  const id = String(projectId || "").trim();
  if (!id) throw new Error("Project id is required.");
  await deleteDoc(doc(firestore, PROJECTS_COLLECTION, id));
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
  const { auth: firebaseAuth } = ensureFirebase();
  return onAuthStateChanged(firebaseAuth, callback);
}

export async function login(email, password) {
  const { auth: firebaseAuth } = ensureFirebase();
  const result = await signInWithEmailAndPassword(firebaseAuth, email, password);
  return result.user;
}

export async function logout() {
  if (!isFirebaseConfigured()) return;
  const { auth: firebaseAuth } = ensureFirebase();
  await signOut(firebaseAuth);
}

export { isFirebaseConfigured };
