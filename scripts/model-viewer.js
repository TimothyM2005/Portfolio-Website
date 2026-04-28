import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/loaders/DRACOLoader.js";

const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/libs/draco/");
loader.setDRACOLoader(dracoLoader);

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

function createViewer(mount, modelSrc) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = "model-viewer-canvas";
  mount.replaceChildren(renderer.domElement);

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

  const resize = () => {
    const width = mount.clientWidth || 1;
    const height = mount.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  resize();
  window.addEventListener("resize", resize);

  loader.load(
    modelSrc,
    (gltf) => {
      scene.add(gltf.scene);
      fitCameraToObject(camera, controls, gltf.scene);
    },
    undefined,
    () => {
      mount.textContent = "Unable to load 3D model.";
    }
  );

  const animate = () => {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };

  animate();
}

export function initModelViewers(manifest) {
  const entries = manifest || {};
  const projects = Object.keys(entries);
  if (projects.length === 0) return;

  projects.forEach((projectId) => {
    const card = document.querySelector('.project[data-project="' + projectId + '"]');
    const src = entries[projectId];
    if (!card || !src) return;

    const body = card.querySelector(".project-body");
    if (!body) return;

    const title = document.createElement("h3");
    title.textContent = "3D Model";

    const mount = document.createElement("div");
    mount.className = "project-model-viewer";
    mount.textContent = "Loading 3D viewer...";

    body.appendChild(title);
    body.appendChild(mount);

    createViewer(mount, src);
  });
}
