import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/loaders/DRACOLoader.js";

const gltfLoader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/libs/draco/");
gltfLoader.setDRACOLoader(dracoLoader);

let occtModulePromise = null;

function fitCameraToObject(camera, controls, object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;

  const fov = camera.fov * (Math.PI / 180);
  const distance = maxDim / (2 * Math.tan(fov / 2));

  camera.position.set(center.x + distance * 1.4, center.y + distance * 0.8, center.z + distance * 1.4);
  camera.near = Math.max(0.01, maxDim / 1000);
  camera.far = Math.max(1000, maxDim * 50);
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.update();
}

function getExtension(src) {
  const clean = String(src || "").split("?")[0].split("#")[0];
  const parts = clean.split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

async function getOcctModule() {
  if (!occtModulePromise) {
    occtModulePromise = import("https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/occt-import-js.js")
      .then(function (mod) {
        const factory = mod.default || mod;
        return factory({
          locateFile: function (path) {
            return "https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/" + path;
          }
        });
      });
  }
  return occtModulePromise;
}

function meshesFromOcctResult(result) {
  const root = new THREE.Group();
  if (!result || !result.success || !Array.isArray(result.meshes)) {
    throw new Error("STEP parse failed.");
  }

  result.meshes.forEach(function (meshData) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(meshData.attributes.position.array, 3)
    );
    if (meshData.attributes.normal) {
      geometry.setAttribute(
        "normal",
        new THREE.Float32BufferAttribute(meshData.attributes.normal.array, 3)
      );
    } else {
      geometry.computeVertexNormals();
    }
    if (meshData.index) {
      geometry.setIndex(meshData.index.array);
    }

    const color = meshData.color
      ? new THREE.Color(meshData.color[0], meshData.color[1], meshData.color[2])
      : new THREE.Color(0x8b949e);

    const material = new THREE.MeshStandardMaterial({
      color: color,
      metalness: 0.15,
      roughness: 0.55
    });
    root.add(new THREE.Mesh(geometry, material));
  });

  return root;
}

async function loadStepModel(src) {
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error("Unable to fetch STEP file.");
  }
  const buffer = new Uint8Array(await response.arrayBuffer());
  const occt = await getOcctModule();
  const result = occt.ReadStepFile(buffer, null);
  return meshesFromOcctResult(result);
}

function loadGltfModel(src) {
  return new Promise(function (resolve, reject) {
    gltfLoader.load(
      src,
      function (gltf) {
        resolve(gltf.scene);
      },
      undefined,
      function (err) {
        reject(err || new Error("Unable to load glTF model."));
      }
    );
  });
}

export function createViewer(mount, modelSrc) {
  if (!mount) {
    return { dispose: function () {} };
  }

  let disposed = false;
  let frameId = 0;
  const status = document.createElement("div");
  status.className = "model-viewer-status";
  status.textContent = "Loading CAD model…";
  mount.replaceChildren(status);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = "model-viewer-canvas";

  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 1.0);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(3, 5, 2);
  scene.add(dir);

  const resize = function () {
    if (disposed) return;
    const width = mount.clientWidth || 1;
    const height = mount.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  const onResize = function () {
    resize();
  };
  window.addEventListener("resize", onResize);

  const animate = function () {
    if (disposed) return;
    controls.update();
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(animate);
  };

  const ext = getExtension(modelSrc);
  const loadPromise =
    ext === "step" || ext === "stp"
      ? loadStepModel(modelSrc)
      : loadGltfModel(modelSrc);

  loadPromise
    .then(function (object) {
      if (disposed) return;
      mount.replaceChildren(renderer.domElement);
      scene.add(object);
      resize();
      fitCameraToObject(camera, controls, object);
      animate();
    })
    .catch(function () {
      if (disposed) return;
      mount.textContent =
        ext === "step" || ext === "stp"
          ? "Unable to load STEP file. Try exporting as .glb/.gltf."
          : "Unable to load 3D model.";
    });

  return {
    dispose: function () {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
      mount.replaceChildren();
    }
  };
}

export function initModelViewers(manifest) {
  const entries = manifest || {};
  Object.keys(entries).forEach(function (projectId) {
    const card = document.querySelector('.project[data-project="' + projectId + '"]');
    if (!card) return;
    card.classList.add("has-cad-model");
    const header = card.querySelector(".project-meta");
    if (header && !header.querySelector(".pill.cad")) {
      const pill = document.createElement("span");
      pill.className = "pill cad";
      pill.textContent = "3D CAD";
      header.appendChild(pill);
    }
  });
}
