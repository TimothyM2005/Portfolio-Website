const THREE_VERSION = "0.164.1";
const THREE_CDN = "https://cdn.jsdelivr.net/npm/three@" + THREE_VERSION + "/";

let threeBundlePromise = null;
let stepWorker = null;
let stepJobId = 0;

const HEAVY_TRIANGLE_COUNT = 350000;

const TESSELLATION = {
  preview: {
    linearUnit: "millimeter",
    linearDeflectionType: "bounding_box_ratio",
    linearDeflection: 0.008,
    angularDeflection: 1.0
  },
  full: {
    linearUnit: "millimeter",
    linearDeflectionType: "bounding_box_ratio",
    linearDeflection: 0.0015,
    angularDeflection: 0.6
  }
};

const MATERIAL_PRESETS = {
  imported: null,
  satin: { keepColors: true, roughness: 0.42, metalnessMin: 0.1, envMapIntensity: 0.75 },
  glossy: { keepColors: true, roughness: 0.2, metalnessMin: 0.18, envMapIntensity: 0.95 },
  softMatte: { keepColors: true, roughness: 0.82, metalness: 0.04, envMapIntensity: 0.3 },
  polished: { color: 0xd0d5db, metalness: 0.92, roughness: 0.16, envMapIntensity: 1.05 },
  aluminum: { color: 0xb0b7bf, metalness: 0.85, roughness: 0.28, envMapIntensity: 0.9 },
  steel: { color: 0x8a9299, metalness: 0.88, roughness: 0.34, envMapIntensity: 0.85 },
  plastic: { color: 0x4b5563, metalness: 0.06, roughness: 0.48, envMapIntensity: 0.55 },
  matte: { color: 0x9aa3ad, metalness: 0.02, roughness: 0.88, envMapIntensity: 0.28 },
  glass: { color: 0xc8e7f5, metalness: 0.05, roughness: 0.08, opacity: 0.22, transparent: true, envMapIntensity: 0.95 },
  acrylic: { color: 0xd7e6ef, metalness: 0.0, roughness: 0.22, opacity: 0.42, transparent: true, envMapIntensity: 0.8 },
  frosted: { color: 0xe8eaed, metalness: 0.0, roughness: 0.75, opacity: 0.55, transparent: true, envMapIntensity: 0.45 },
  clear: { color: 0xffffff, metalness: 0.0, roughness: 0.05, opacity: 0.12, transparent: true, envMapIntensity: 1.0 },
  tintBlue: { color: 0x4a90d9, metalness: 0.05, roughness: 0.22, opacity: 0.4, transparent: true, envMapIntensity: 0.8 },
  tintAmber: { color: 0xd4a017, metalness: 0.05, roughness: 0.28, opacity: 0.45, transparent: true, envMapIntensity: 0.8 }
};

const MATERIAL_OPTION_LABELS = {
  imported: "Original colors",
  satin: "Satin (keep colors)",
  glossy: "Glossy (keep colors)",
  softMatte: "Matte (keep colors)",
  polished: "Polished metal",
  aluminum: "Aluminum",
  steel: "Steel",
  plastic: "Plastic",
  matte: "Neutral matte",
  glass: "Glass (clear)",
  acrylic: "Acrylic (translucent)",
  frosted: "Frosted (translucent)",
  clear: "Clear (near invisible)",
  tintBlue: "Tinted blue",
  tintAmber: "Tinted amber"
};

const LIGHT_PRESETS = {
  studio: { key: [3.2, 4.5, 2.8], fill: [-3.5, 1.2, -2.2], hemi: 0.38, keyIntensity: 0.72, fillIntensity: 0.22 },
  front: { key: [0.4, 2.8, 5.2], fill: [-2.5, 1.0, -1.5], hemi: 0.32, keyIntensity: 0.78, fillIntensity: 0.2 },
  top: { key: [0.8, 6.5, 0.6], fill: [2.5, 0.8, -2.0], hemi: 0.28, keyIntensity: 0.82, fillIntensity: 0.18 },
  left: { key: [-5.5, 3.2, 1.5], fill: [3.0, 1.2, 2.0], hemi: 0.3, keyIntensity: 0.78, fillIntensity: 0.2 },
  right: { key: [5.5, 3.2, 1.5], fill: [-3.0, 1.2, 2.0], hemi: 0.3, keyIntensity: 0.78, fillIntensity: 0.2 },
  back: { key: [-1.2, 2.8, -5.2], fill: [2.5, 1.4, 3.0], hemi: 0.34, keyIntensity: 0.72, fillIntensity: 0.24 },
  rim: { key: [-3.5, 2.5, -4.0], fill: [4.2, 1.0, 2.5], hemi: 0.26, keyIntensity: 0.85, fillIntensity: 0.28 }
};

function materialOptionsHtml(selectedId) {
  const selected = selectedId || "imported";
  return Object.keys(MATERIAL_OPTION_LABELS)
    .map(function (id) {
      return (
        '<option value="' +
        id +
        '"' +
        (id === selected ? " selected" : "") +
        ">" +
        MATERIAL_OPTION_LABELS[id] +
        "</option>"
      );
    })
    .join("");
}

function loadThreeBundle() {
  if (!threeBundlePromise) {
    threeBundlePromise = Promise.all([
      import("three"),
      import("three/addons/controls/TrackballControls.js"),
      import("three/addons/loaders/GLTFLoader.js"),
      import("three/addons/loaders/DRACOLoader.js"),
      import("three/addons/environments/RoomEnvironment.js")
    ]).then(function (mods) {
      const THREE = mods[0];
      const TrackballControls = mods[1].TrackballControls;
      const GLTFLoader = mods[2].GLTFLoader;
      const DRACOLoader = mods[3].DRACOLoader;
      const RoomEnvironment = mods[4].RoomEnvironment;
      const gltfLoader = new GLTFLoader();
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath(THREE_CDN + "examples/jsm/libs/draco/");
      gltfLoader.setDRACOLoader(dracoLoader);
      return {
        THREE: THREE,
        TrackballControls: TrackballControls,
        gltfLoader: gltfLoader,
        RoomEnvironment: RoomEnvironment
      };
    });
  }
  return threeBundlePromise;
}

function fitCameraToObject(THREE, camera, controls, object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;

  const fov = camera.fov * (Math.PI / 180);
  const distance = maxDim / (2 * Math.tan(fov / 2));

  camera.up.set(0, 1, 0);
  camera.position.set(center.x + distance * 1.4, center.y + distance * 0.8, center.z + distance * 1.4);
  camera.near = Math.max(0.01, maxDim / 1000);
  camera.far = Math.max(1000, maxDim * 50);
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  if (typeof controls.handleResize === "function") controls.handleResize();
  if (typeof controls.minDistance === "number") {
    controls.minDistance = Math.max(maxDim * 0.05, 0.01);
    controls.maxDistance = Math.max(maxDim * 40, 10);
  }
  controls.update();
}

function getExtension(src) {
  const clean = String(src || "").split("?")[0].split("#")[0];
  const parts = clean.split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function round3(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function vec3ToArray(vec) {
  if (!vec) return [0, 0, 0];
  if (Array.isArray(vec)) {
    return [round3(vec[0] || 0), round3(vec[1] || 0), round3(vec[2] || 0)];
  }
  return [round3(vec.x || 0), round3(vec.y || 0), round3(vec.z || 0)];
}

function toBase64Url(str) {
  const bytes = unescape(encodeURIComponent(str));
  return btoa(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(str) {
  let b64 = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return decodeURIComponent(escape(atob(b64)));
}

function expandCompactViewState(compact) {
  if (!compact || typeof compact !== "object") return null;
  const cam = compact.c || compact.camera;
  const clipSrc = compact.k || compact.clip;
  const state = {
    camera: null,
    explode: compact.e != null ? clamp01(compact.e) : compact.explode != null ? clamp01(compact.explode) : 0,
    materials: compact.m || compact.materials || {},
    allMaterial: compact.a || compact.allMaterial || undefined,
    autoRotate: compact.r != null ? !!compact.r : compact.autoRotate != null ? !!compact.autoRotate : true,
    clip: {
      enabled: false,
      axis: "x",
      amount: 0.5
    }
  };
  if (cam) {
    const pos = cam.p || cam.position;
    const target = cam.t || cam.target;
    state.camera = {
      position: Array.isArray(pos) ? pos.slice(0, 3) : [0, 0, 0],
      target: Array.isArray(target) ? target.slice(0, 3) : [0, 0, 0]
    };
  }
  if (clipSrc && typeof clipSrc === "object") {
    state.clip = {
      enabled: !!clipSrc.enabled || !!clipSrc.on,
      axis: clipSrc.axis === "y" || clipSrc.axis === "z" ? clipSrc.axis : "x",
      amount: clamp01(clipSrc.amount != null ? clipSrc.amount : 0.5)
    };
  }
  if (state.allMaterial == null) delete state.allMaterial;
  return state;
}

function decodeCompactCsv(raw) {
  const parts = String(raw || "").split(",");
  if (parts.length < 6) return null;
  const nums = parts.slice(0, 6).map(Number);
  if (nums.some(function (n) { return !Number.isFinite(n); })) return null;
  const state = {
    camera: {
      position: [nums[0], nums[1], nums[2]],
      target: [nums[3], nums[4], nums[5]]
    },
    explode: 0,
    materials: {},
    autoRotate: true,
    clip: { enabled: false, axis: "x", amount: 0.5 }
  };
  for (let i = 6; i < parts.length; i += 1) {
    const token = parts[i];
    if (!token) continue;
    if (token.charAt(0) === "e") {
      state.explode = clamp01(token.slice(1));
    } else if (token.charAt(0) === "r") {
      state.autoRotate = token.slice(1) !== "0";
    } else if (token.charAt(0) === "a" && token.indexOf(":") < 0) {
      state.allMaterial = token.slice(1) || undefined;
    } else if (token.indexOf("clip:") === 0) {
      const clipParts = token.slice(5).split("|");
      state.clip = {
        enabled: clipParts[0] === "1",
        axis: clipParts[1] === "y" || clipParts[1] === "z" ? clipParts[1] : "x",
        amount: clamp01(clipParts[2] != null ? clipParts[2] : 0.5)
      };
    } else if (token.indexOf("m:") === 0) {
      const pair = token.slice(2).split("=");
      if (pair.length === 2) state.materials[decodeURIComponent(pair[0])] = pair[1];
    }
  }
  if (state.allMaterial == null) delete state.allMaterial;
  return state;
}

/**
 * Encode viewer state for a `#view=` hash fragment (base64url JSON).
 * @returns {string} payload after `#view=` (no leading hash)
 */
export function encodeViewState(state) {
  if (!state || typeof state !== "object") return "";
  const compact = {};
  if (state.camera && state.camera.position && state.camera.target) {
    compact.c = {
      p: vec3ToArray(state.camera.position),
      t: vec3ToArray(state.camera.target)
    };
  }
  if (state.explode != null) compact.e = round3(clamp01(state.explode));
  if (state.materials && typeof state.materials === "object") compact.m = state.materials;
  if (state.allMaterial) compact.a = state.allMaterial;
  if (typeof state.autoRotate === "boolean") compact.r = state.autoRotate ? 1 : 0;
  if (state.clip && typeof state.clip === "object") {
    compact.k = {
      enabled: !!state.clip.enabled,
      axis: state.clip.axis === "y" || state.clip.axis === "z" ? state.clip.axis : "x",
      amount: round3(clamp01(state.clip.amount != null ? state.clip.amount : 0.5))
    };
  }
  return toBase64Url(JSON.stringify(compact));
}

/**
 * Decode `#view=…` (or raw payload / full URL hash) into a view state object.
 * @returns {object|null}
 */
export function decodeViewState(hash) {
  if (hash == null || hash === "") return null;
  let raw = String(hash);
  const hashIdx = raw.indexOf("#");
  if (hashIdx >= 0) raw = raw.slice(hashIdx + 1);
  if (raw.indexOf("view=") === 0) {
    raw = raw.slice(5);
  } else {
    const match = /(?:^|&)view=([^&]*)/.exec(raw);
    if (match) raw = match[1];
  }
  if (!raw) return null;
  try {
    raw = decodeURIComponent(raw);
  } catch (err) {
    /* keep raw */
  }

  try {
    const parsed = JSON.parse(fromBase64Url(raw));
    return expandCompactViewState(parsed);
  } catch (err) {
    return decodeCompactCsv(raw);
  }
}

function getStepWorker() {
  if (!stepWorker) {
    const url = new URL("./step-worker.js", import.meta.url);
    stepWorker = new Worker(url);
  }
  return stepWorker;
}

function terminateStepJob() {
  if (stepWorker) {
    stepWorker.terminate();
    stepWorker = null;
  }
}

function loadStepModel(src, quality, onStatus) {
  const worker = getStepWorker();
  const jobId = (stepJobId += 1);
  const params = TESSELLATION[quality] || TESSELLATION.preview;

  return new Promise(function (resolve, reject) {
    const onMessage = function (event) {
      const data = event.data || {};
      if (data.jobId !== jobId) return;
      if (data.type === "status") {
        if (onStatus) onStatus(data.message);
        return;
      }
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      if (data.type === "done") {
        resolve(data.result);
        return;
      }
      reject(new Error(data.message || "STEP tessellation failed."));
    };
    const onError = function (err) {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      reject(err || new Error("STEP worker failed to start."));
    };
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    if (onStatus) onStatus("Starting background tessellation…");
    const absoluteSrc = new URL(src, window.location.href).href;
    worker.postMessage({ type: "parse", jobId: jobId, src: absoluteSrc, params: params });
  });
}

function waitForFrame() {
  return new Promise(function (resolve) {
    requestAnimationFrame(function () {
      resolve();
    });
  });
}

function buildStepMesh(THREE, geometryMesh) {
  if (
    !geometryMesh ||
    !geometryMesh.attributes ||
    !geometryMesh.attributes.position ||
    !geometryMesh.attributes.position.array ||
    !geometryMesh.index ||
    !geometryMesh.index.array
  ) {
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  const positions = geometryMesh.attributes.position.array;
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3)
  );
  if (geometryMesh.attributes.normal && geometryMesh.attributes.normal.array) {
    geometry.setAttribute(
      "normal",
      new THREE.BufferAttribute(geometryMesh.attributes.normal.array, 3)
    );
  } else {
    geometry.computeVertexNormals();
  }

  const indexArray = geometryMesh.index.array;
  geometry.setIndex(new THREE.BufferAttribute(indexArray, 1));
  geometry.name = geometryMesh.name || "Part";

  const defaultColor = geometryMesh.color
    ? new THREE.Color(geometryMesh.color[0], geometryMesh.color[1], geometryMesh.color[2])
    : new THREE.Color(0x8b949e);

  const defaultMaterial = new THREE.MeshStandardMaterial({
    color: defaultColor,
    metalness: 0.2,
    roughness: 0.55,
    side: THREE.DoubleSide
  });
  const materials = [defaultMaterial];

  const faces = geometryMesh.brep_faces || [];
  if (faces.length > 0) {
    faces.forEach(function (faceColor) {
      const color = faceColor && faceColor.color
        ? new THREE.Color(faceColor.color[0], faceColor.color[1], faceColor.color[2])
        : defaultColor.clone();
      materials.push(
        new THREE.MeshStandardMaterial({
          color: color,
          metalness: 0.2,
          roughness: 0.55,
          side: THREE.DoubleSide
        })
      );
    });

    const triangleCount = geometryMesh.index.array.length / 3;
    let triangleIndex = 0;
    let faceColorGroupIndex = 0;
    while (triangleIndex < triangleCount) {
      const firstIndex = triangleIndex;
      let lastIndex = null;
      let materialIndex = null;
      if (faceColorGroupIndex >= faces.length) {
        lastIndex = triangleCount;
        materialIndex = 0;
      } else if (triangleIndex < faces[faceColorGroupIndex].first) {
        lastIndex = faces[faceColorGroupIndex].first;
        materialIndex = 0;
      } else {
        lastIndex = faces[faceColorGroupIndex].last + 1;
        materialIndex = faceColorGroupIndex + 1;
        faceColorGroupIndex += 1;
      }
      geometry.addGroup(firstIndex * 3, (lastIndex - firstIndex) * 3, materialIndex);
      triangleIndex = lastIndex;
    }
  }

  const mesh = new THREE.Mesh(geometry, materials.length > 1 ? materials : materials[0]);
  mesh.name = geometryMesh.name || "Part";
  mesh.userData.partName = mesh.name;
  mesh.userData.importedMaterials = Array.isArray(mesh.material) ? mesh.material.slice() : [mesh.material];
  return mesh;
}

function countTriangles(root) {
  let count = 0;
  root.traverse(function (obj) {
    if (!obj.isMesh || !obj.geometry) return;
    const indexed = obj.geometry.index;
    if (indexed) count += indexed.count / 3;
    else if (obj.geometry.attributes.position) count += obj.geometry.attributes.position.count / 3;
  });
  return count;
}

function disposeObject3D(object) {
  if (!object) return;
  object.traverse(function (obj) {
    if (obj.geometry) obj.geometry.dispose();
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    materials.forEach(function (mat) {
      if (mat && typeof mat.dispose === "function") mat.dispose();
    });
  });
}

async function meshesFromOcctResult(THREE, result, onProgress) {
  const root = new THREE.Group();
  root.name = (result.root && result.root.name) || "Assembly";
  if (!result || !result.success || !Array.isArray(result.meshes) || result.meshes.length === 0) {
    throw new Error("STEP parse failed or returned no meshes.");
  }

  for (let index = 0; index < result.meshes.length; index += 1) {
    const mesh = buildStepMesh(THREE, result.meshes[index]);
    if (mesh) {
      if (!mesh.name || mesh.name === "Part") {
        mesh.name = "Part " + (index + 1);
        mesh.userData.partName = mesh.name;
      }
      root.add(mesh);
    }
    if (index % 6 === 0) {
      if (onProgress) onProgress(index + 1, result.meshes.length);
      await waitForFrame();
    }
  }

  if (root.children.length === 0) {
    throw new Error("STEP file contained no usable mesh geometry.");
  }
  return root;
}

function loadGltfModel(gltfLoader, src) {
  return new Promise(function (resolve, reject) {
    gltfLoader.load(
      src,
      function (gltf) {
        const root = gltf.scene;
        let partIndex = 0;
        root.traverse(function (obj) {
          if (!obj.isMesh) return;
          partIndex += 1;
          if (!obj.name) obj.name = "Part " + partIndex;
          obj.userData.partName = obj.name;
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          obj.userData.importedMaterials = mats.filter(Boolean).map(function (mat) {
            return mat.clone ? mat.clone() : mat;
          });
        });
        resolve(root);
      },
      undefined,
      function (err) {
        reject(err || new Error("Unable to load glTF model."));
      }
    );
  });
}

function collectPartMeshes(root) {
  const parts = [];
  root.traverse(function (obj) {
    if (obj && obj.isMesh) parts.push(obj);
  });
  return parts;
}

function applyKeepColorFinish(THREE, mesh, preset) {
  const imported = mesh.userData.importedMaterials;
  if (!imported || !imported.length) return false;

  const adjust = function (source) {
    const mat = source && source.clone ? source.clone() : source;
    if (!mat) return mat;
    if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
      if (preset.roughness != null) mat.roughness = preset.roughness;
      if (preset.metalness != null) {
        mat.metalness = preset.metalness;
      } else if (preset.metalnessMin != null) {
        mat.metalness = Math.max(Number(mat.metalness) || 0, preset.metalnessMin);
      }
      mat.envMapIntensity = preset.envMapIntensity != null ? preset.envMapIntensity : 0.7;
      mat.needsUpdate = true;
    } else if (mat.isMeshPhongMaterial) {
      if (preset.roughness != null) mat.shininess = Math.max(8, (1 - preset.roughness) * 80);
      mat.needsUpdate = true;
    }
    return mat;
  };

  mesh.material = imported.length > 1 ? imported.map(adjust) : adjust(imported[0]);
  return true;
}

function applyMaterialPresetToMesh(THREE, mesh, presetId) {
  if (!mesh) return;
  const id = presetId || "imported";
  mesh.userData.materialPreset = id;
  const preset = MATERIAL_PRESETS[id];

  if (!preset || id === "imported") {
    const imported = mesh.userData.importedMaterials;
    if (imported && imported.length) {
      mesh.material = imported.length > 1
        ? imported.map(function (mat) { return mat && mat.clone ? mat.clone() : mat; })
        : (imported[0] && imported[0].clone ? imported[0].clone() : imported[0]);
    }
    return;
  }

  if (preset.keepColors) {
    if (applyKeepColorFinish(THREE, mesh, preset)) return;
  }

  const transparent = !!(preset.transparent || (preset.opacity != null && preset.opacity < 1));
  const opacity = preset.opacity != null ? preset.opacity : 1;
  const envMapIntensity = preset.envMapIntensity != null ? preset.envMapIntensity : 0.7;

  const makeMat = function (baseColor) {
    return new THREE.MeshStandardMaterial({
      color: baseColor != null ? baseColor : preset.color,
      metalness: preset.metalness,
      roughness: preset.roughness,
      envMapIntensity: envMapIntensity,
      side: THREE.DoubleSide,
      transparent: transparent,
      opacity: opacity,
      depthWrite: !transparent
    });
  };

  // Keep per-face hue variation lightly when switching presets from multi-material STEP parts.
  if (Array.isArray(mesh.userData.importedMaterials) && mesh.userData.importedMaterials.length > 1) {
    mesh.material = mesh.userData.importedMaterials.map(function (mat) {
      const color = mat && mat.color ? mat.color.clone() : new THREE.Color(preset.color);
      return makeMat(color);
    });
  } else {
    mesh.material = makeMat(new THREE.Color(preset.color));
  }
}

function applyMaterialPreset(THREE, parts, presetId) {
  (parts || []).forEach(function (mesh) {
    applyMaterialPresetToMesh(THREE, mesh, presetId);
  });
}

function partMaterialKey(mesh, index) {
  return String(mesh.userData.partName || mesh.name || "Part " + (index + 1));
}

function prepareExplodeData(THREE, parts) {
  if (!parts.length) return { center: new THREE.Vector3(), maxSpan: 1, box: new THREE.Box3() };
  const box = new THREE.Box3();
  parts.forEach(function (mesh) {
    box.expandByObject(mesh);
  });
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxSpan = Math.max(size.x, size.y, size.z) || 1;

  parts.forEach(function (mesh) {
    const meshBox = new THREE.Box3().setFromObject(mesh);
    const meshCenter = meshBox.getCenter(new THREE.Vector3());
    const dir = meshCenter.clone().sub(center);
    if (dir.lengthSq() < 1e-8) {
      dir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    } else {
      dir.normalize();
    }
    mesh.userData.homePosition = mesh.position.clone();
    mesh.userData.explodeDir = dir;
  });

  return { center: center, maxSpan: maxSpan, box: box.clone() };
}

function setExplodeAmount(parts, amount, maxSpan) {
  const distance = Math.max(maxSpan, 1) * 0.55 * amount;
  parts.forEach(function (mesh) {
    const home = mesh.userData.homePosition;
    const dir = mesh.userData.explodeDir;
    if (!home || !dir) return;
    mesh.position.copy(home).addScaledVector(dir, distance);
  });
}

/** CAD coordinates are treated as millimeters; display converts to inches. */
const MM_PER_INCH = 25.4;

function formatSizeLabel(size, unitLabel) {
  const fmt = function (n) {
    if (!Number.isFinite(n)) return "?";
    const abs = Math.abs(n);
    if (abs >= 100) return String(Math.round(n));
    if (abs >= 10) return n.toFixed(1);
    return n.toFixed(2);
  };
  return "≈ " + fmt(size.x) + " × " + fmt(size.y) + " × " + fmt(size.z) + " " + unitLabel;
}

function sizeForDisplay(sizeUnits) {
  const max = Math.max(Math.abs(sizeUnits.x), Math.abs(sizeUnits.y), Math.abs(sizeUnits.z)) || 0;
  // GLB/glTF models are often authored in meters; STEP tessellation is mm.
  const scale = max > 0 && max < 8 ? 39.3700787 : 1 / MM_PER_INCH;
  return {
    x: sizeUnits.x * scale,
    y: sizeUnits.y * scale,
    z: sizeUnits.z * scale
  };
}

function setPartsPanelCollapsed(partsPanel, collapsed) {
  if (!partsPanel) return;
  partsPanel.classList.toggle("is-collapsed", !!collapsed);
  const toggle = partsPanel.querySelector('[data-action="toggle-parts"]');
  if (toggle) toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
}

function setSectionOptsVisible(toolbar, enabled) {
  if (!toolbar) return;
  const opts = toolbar.querySelector("[data-section-opts]");
  // Keep section tools visible; only dim them when section is off via class.
  if (opts) opts.classList.toggle("is-disabled", !enabled);
}

function buildViewerChrome(options) {
  const opts = options || {};
  const shell = document.createElement("div");
  shell.className = "model-viewer-shell";

  const stage = document.createElement("div");
  stage.className = "model-viewer-stage";

  const sizeBadge = document.createElement("div");
  sizeBadge.className = "model-viewer-size";
  sizeBadge.hidden = true;
  stage.appendChild(sizeBadge);

  const toolbar = document.createElement("div");
  toolbar.className = "model-viewer-toolbar";
  toolbar.innerHTML =
    '<div class="model-viewer-toolbar-row">' +
      '<label class="model-viewer-field model-viewer-finish-field">Finish' +
        '<select data-action="material" aria-label="Surface finish">' +
          materialOptionsHtml("imported") +
        "</select>" +
      "</label>" +
      '<label class="model-viewer-field" data-detail-field hidden>Detail' +
        '<select data-action="detail" aria-label="Tessellation detail">' +
          '<option value="preview">Fast</option>' +
          '<option value="full">Full</option>' +
        "</select>" +
      "</label>" +
      '<label class="model-viewer-field">Light' +
        '<select data-action="light" aria-label="Lighting direction">' +
          '<option value="studio" selected>Studio</option>' +
          '<option value="front">Front</option>' +
          '<option value="top">Top</option>' +
          '<option value="left">Left</option>' +
          '<option value="right">Right</option>' +
          '<option value="back">Back</option>' +
          '<option value="rim">Rim</option>' +
        "</select>" +
      "</label>" +
      '<label class="model-viewer-field model-viewer-light-intensity">Bright' +
        '<input type="range" min="40" max="140" value="70" data-action="light-intensity" aria-label="Light brightness" />' +
      "</label>" +
    "</div>" +
    '<div class="model-viewer-toolbar-row">' +
      '<label class="model-viewer-toggle"><input type="checkbox" data-action="rotate" checked /> Auto-rotate</label>' +
      '<label class="model-viewer-field">Spin' +
        '<select data-action="rotate-axis" aria-label="Auto-rotate axis">' +
          '<option value="y" selected>Y</option>' +
          '<option value="x">X</option>' +
          '<option value="z">Z</option>' +
        "</select>" +
      "</label>" +
      (opts.showExplode
        ? '<label class="model-viewer-field model-viewer-explode">Explode' +
            '<input type="range" min="0" max="100" value="0" data-action="explode" aria-label="Explode amount" />' +
          "</label>"
        : "") +
      (opts.showClip
        ? '<span class="model-viewer-section-group">' +
            '<label class="model-viewer-toggle"><input type="checkbox" data-action="clip-enabled" /> Section</label>' +
            '<span class="model-viewer-section-opts is-disabled" data-section-opts>' +
              '<label class="model-viewer-field">Axis' +
                '<select data-action="clip-axis" aria-label="Section axis">' +
                  '<option value="x">X</option>' +
                  '<option value="y">Y</option>' +
                  '<option value="z">Z</option>' +
                "</select>" +
              "</label>" +
              '<label class="model-viewer-field model-viewer-clip">Clip' +
                '<input type="range" min="0" max="100" value="50" data-action="clip-amount" aria-label="Section clip" />' +
              "</label>" +
            "</span>" +
          "</span>"
        : "") +
      '<div class="model-viewer-actions">' +
        '<button type="button" data-action="screenshot">Screenshot</button>' +
        '<button type="button" data-action="copy-view">Copy view link</button>' +
      "</div>" +
    "</div>";

  shell.appendChild(stage);
  shell.appendChild(toolbar);

  let partsPanel = null;
  if (opts.showParts) {
    partsPanel = document.createElement("div");
    partsPanel.className = "model-viewer-parts is-collapsed";
    partsPanel.innerHTML =
      '<div class="model-viewer-parts-header">' +
        '<button type="button" class="model-viewer-parts-toggle" data-action="toggle-parts" aria-expanded="false">' +
          'Parts <span data-parts-count></span>' +
        "</button>" +
        '<button type="button" data-action="show-all" class="model-viewer-parts-show-all">Show all</button>' +
      "</div>" +
      '<ul class="model-viewer-parts-list"></ul>';
    shell.appendChild(partsPanel);
  }

  return {
    shell: shell,
    stage: stage,
    toolbar: toolbar,
    partsPanel: partsPanel,
    sizeBadge: sizeBadge
  };
}

function populatePartsList(partsPanel, parts, materialByPart) {
  const list = partsPanel.querySelector(".model-viewer-parts-list");
  if (!list) return;
  const choices = materialByPart || {};
  const countEl = partsPanel.querySelector("[data-parts-count]");
  if (countEl) countEl.textContent = parts.length ? "(" + parts.length + ")" : "";
  list.innerHTML = parts
    .map(function (mesh, index) {
      const name = mesh.userData.partName || mesh.name || "Part " + (index + 1);
      const id = "cad-part-" + index;
      const matId = choices[partMaterialKey(mesh, index)] || mesh.userData.materialPreset || "imported";
      return (
        '<li class="model-viewer-part-row">' +
          '<label class="model-viewer-part-toggle" for="' + id + '">' +
            '<input id="' + id + '" type="checkbox" checked data-part-index="' + index + '" />' +
            "<span>" + escapeHtml(name) + "</span>" +
          "</label>" +
          '<select class="model-viewer-part-material" data-action="part-material" data-part-index="' +
            index +
            '" aria-label="Material for ' +
            escapeHtml(name) +
            '">' +
            materialOptionsHtml(matId) +
          "</select>" +
        "</li>"
      );
    })
    .join("");
  if (!partsPanel.dataset.userToggled) {
    setPartsPanelCollapsed(partsPanel, true);
  }
}

export function createViewer(mount, modelSrc, options) {
  if (!mount) {
    return {
      park: function () {},
      resume: function () {},
      dispose: function () {},
      getViewState: function () {
        return null;
      },
      getPreset: function () {
        return null;
      },
      captureScreenshot: function () {
        return null;
      }
    };
  }

  const opts = options || {};
  const initialPreset = opts.preset && typeof opts.preset === "object" ? opts.preset : null;
  const initialViewState = opts.viewState && typeof opts.viewState === "object" ? opts.viewState : null;
  const projectId = opts.projectId ? String(opts.projectId) : "";

  let mountEl = mount;
  let disposed = false;
  let parked = false;
  let frameId = 0;
  let cleanup = function () {};
  let resizeFn = function () {};
  let restartAnimate = function () {};
  let autoRotate = true;
  let autoRotateAxisId = "y";
  let lightPresetId = "studio";
  let lightIntensityScale = 0.7;
  let explodeAmount = 0;
  let allMaterialId = null;
  let modelRoot = null;
  let partMeshes = [];
  let explodeMeta = { maxSpan: 1, box: null };
  let parseInFlight = false;
  let stepQuality = "preview";
  let animateStarted = false;
  let clipBounds = null;
  let sizeUnitLabel = "in";
  const parkBin = document.createElement("div");
  parkBin.hidden = true;
  parkBin.setAttribute("aria-hidden", "true");
  const materialByPart = {};
  const clipState = {
    enabled: false,
    axis: "x",
    amount: 0.5
  };

  let captureScreenshotImpl = function () {
    return null;
  };
  let getViewStateImpl = function () {
    return {
      camera: null,
      explode: explodeAmount,
      materials: Object.assign({}, materialByPart),
      autoRotate: autoRotate,
      clip: {
        enabled: clipState.enabled,
        axis: clipState.axis,
        amount: clipState.amount
      }
    };
  };
  let getPresetImpl = function () {
    return getViewStateImpl();
  };

  const status = document.createElement("div");
  status.className = "model-viewer-status";
  status.innerHTML =
    '<div class="model-viewer-spinner" aria-hidden="true"></div>' +
    '<p data-status-text>Loading CAD model…</p>' +
    '<p class="model-viewer-status-note">Large STEP files tessellate in a background thread so the page stays responsive.</p>';
  mountEl.replaceChildren(status);

  const attachToMount = function (node) {
    if (parked) {
      if (!parkBin.isConnected) document.body.appendChild(parkBin);
      parkBin.replaceChildren(node);
      return;
    }
    mountEl.replaceChildren(node);
  };

  const setStatus = function (message) {
    const text = status.querySelector("[data-status-text]");
    if (text) text.textContent = message;
    else status.textContent = message;
  };

  loadThreeBundle()
    .then(function (bundle) {
      if (disposed) return;
      const THREE = bundle.THREE;
      const TrackballControls = bundle.TrackballControls;
      const gltfLoader = bundle.gltfLoader;
      const ext = getExtension(modelSrc);
      const isStep = ext === "step" || ext === "stp";
      const showAssemblyTools = isStep;
      sizeUnitLabel = "in";

      const chrome = buildViewerChrome({
        showExplode: showAssemblyTools,
        showParts: showAssemblyTools,
        showClip: showAssemblyTools
      });
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.82;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.localClippingEnabled = false;
      renderer.domElement.className = "model-viewer-canvas";
      chrome.stage.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = null;

      const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
      const controls = new TrackballControls(camera, renderer.domElement);
      controls.rotateSpeed = 2.2;
      controls.zoomSpeed = 1.2;
      controls.panSpeed = 0.6;
      controls.staticMoving = false;
      controls.dynamicDampingFactor = 0.12;

      let userOrbiting = false;
      const autoRotateAxis = new THREE.Vector3(0, 1, 0);
      const autoRotateOffset = new THREE.Vector3();
      const AUTO_ROTATE_SPEED = 0.01;
      const setAutoRotateAxis = function (axisId) {
        autoRotateAxisId = axisId === "x" || axisId === "z" ? axisId : "y";
        autoRotateAxis.set(
          autoRotateAxisId === "x" ? 1 : 0,
          autoRotateAxisId === "y" ? 1 : 0,
          autoRotateAxisId === "z" ? 1 : 0
        );
      };
      setAutoRotateAxis(autoRotateAxisId);
      controls.addEventListener("start", function () {
        userOrbiting = true;
      });
      controls.addEventListener("end", function () {
        userOrbiting = false;
      });

      const clipPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);

      const hemi = new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 0.38);
      scene.add(hemi);
      const dir = new THREE.DirectionalLight(0xffffff, 0.72);
      dir.castShadow = true;
      dir.shadow.mapSize.set(2048, 2048);
      dir.shadow.bias = -0.00015;
      scene.add(dir);
      const fill = new THREE.DirectionalLight(0xffffff, 0.22);
      scene.add(fill);

      try {
        const pmrem = new THREE.PMREMGenerator(renderer);
        const envTex = pmrem.fromScene(new bundle.RoomEnvironment(), 0.08).texture;
        scene.environment = envTex;
        if ("environmentIntensity" in scene) scene.environmentIntensity = 0.45;
        pmrem.dispose();
      } catch (envErr) {
        console.warn("Environment map unavailable:", envErr);
      }

      const applyLightPreset = function (presetId, intensityScale) {
        lightPresetId = LIGHT_PRESETS[presetId] ? presetId : "studio";
        lightIntensityScale = Number.isFinite(intensityScale) ? intensityScale : lightIntensityScale;
        const preset = LIGHT_PRESETS[lightPresetId] || LIGHT_PRESETS.studio;
        const scale = Math.max(0.4, Math.min(1.8, lightIntensityScale));
        dir.position.set(preset.key[0], preset.key[1], preset.key[2]);
        fill.position.set(preset.fill[0], preset.fill[1], preset.fill[2]);
        hemi.intensity = preset.hemi * scale;
        dir.intensity = preset.keyIntensity * scale;
        fill.intensity = preset.fillIntensity * scale;
      };
      applyLightPreset(lightPresetId, lightIntensityScale);

      const updateShadowFrustum = function (object) {
        if (!object) return;
        const box = new THREE.Box3().setFromObject(object);
        if (box.isEmpty()) return;
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const radius = Math.max(size.x, size.y, size.z) * 0.75 || 1;
        dir.target.position.copy(center);
        if (!dir.target.parent) scene.add(dir.target);
        const cam = dir.shadow.camera;
        cam.near = 0.1;
        cam.far = radius * 12;
        cam.left = -radius * 2;
        cam.right = radius * 2;
        cam.top = radius * 2;
        cam.bottom = -radius * 2;
        cam.updateProjectionMatrix();
        dir.shadow.needsUpdate = true;
      };

      const resize = function () {
        if (disposed || parked) return;
        const width = chrome.stage.clientWidth || mountEl.clientWidth || 1;
        const height = chrome.stage.clientHeight || mountEl.clientHeight || 1;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        if (typeof controls.handleResize === "function") controls.handleResize();
      };
      resizeFn = resize;

      const onResize = function () {
        resize();
      };
      window.addEventListener("resize", onResize);
      let resizeObserver = null;
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(onResize);
        resizeObserver.observe(chrome.stage);
      }

      const animate = function () {
        if (disposed || parked) {
          frameId = 0;
          return;
        }
        if (autoRotate && !userOrbiting) {
          autoRotateOffset.copy(camera.position).sub(controls.target);
          autoRotateOffset.applyAxisAngle(autoRotateAxis, AUTO_ROTATE_SPEED);
          camera.position.copy(controls.target).add(autoRotateOffset);
          camera.up.applyAxisAngle(autoRotateAxis, AUTO_ROTATE_SPEED);
        }
        controls.update();
        renderer.render(scene, camera);
        frameId = requestAnimationFrame(animate);
      };
      restartAnimate = function () {
        if (disposed || parked || !animateStarted || frameId) return;
        animate();
      };

      const applyClippingToMaterials = function () {
        const enabled = showAssemblyTools && clipState.enabled;
        renderer.localClippingEnabled = enabled;
        partMeshes.forEach(function (mesh) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach(function (mat) {
            if (!mat) return;
            mat.clippingPlanes = enabled ? [clipPlane] : [];
            mat.needsUpdate = true;
          });
        });
      };

      const refreshClipPlane = function () {
        if (!showAssemblyTools) {
          renderer.localClippingEnabled = false;
          return;
        }
        if (!clipBounds || clipBounds.isEmpty()) {
          applyClippingToMaterials();
          return;
        }
        const min = clipBounds.min;
        const max = clipBounds.max;
        const t = clamp01(clipState.amount);
        const axis = clipState.axis === "y" || clipState.axis === "z" ? clipState.axis : "x";
        const normal = new THREE.Vector3(
          axis === "x" ? 1 : 0,
          axis === "y" ? 1 : 0,
          axis === "z" ? 1 : 0
        );
        const point = new THREE.Vector3(
          axis === "x" ? min.x + (max.x - min.x) * t : (min.x + max.x) * 0.5,
          axis === "y" ? min.y + (max.y - min.y) * t : (min.y + max.y) * 0.5,
          axis === "z" ? min.z + (max.z - min.z) * t : (min.z + max.z) * 0.5
        );
        clipPlane.setFromNormalAndCoplanarPoint(normal, point);
        applyClippingToMaterials();
      };

      const updateSizeBadge = function (box) {
        if (!chrome.sizeBadge) return;
        if (!box || box.isEmpty()) {
          chrome.sizeBadge.hidden = true;
          return;
        }
        const size = box.getSize(new THREE.Vector3());
        chrome.sizeBadge.textContent = formatSizeLabel(sizeForDisplay(size), sizeUnitLabel);
        chrome.sizeBadge.hidden = false;
      };

      const syncToolbarFromState = function () {
        const rotateInput = chrome.toolbar.querySelector('[data-action="rotate"]');
        if (rotateInput) rotateInput.checked = !!autoRotate;

        const rotateAxis = chrome.toolbar.querySelector('[data-action="rotate-axis"]');
        if (rotateAxis) rotateAxis.value = autoRotateAxisId;

        const lightSelect = chrome.toolbar.querySelector('[data-action="light"]');
        if (lightSelect) lightSelect.value = lightPresetId;

        const lightIntensity = chrome.toolbar.querySelector('[data-action="light-intensity"]');
        if (lightIntensity) lightIntensity.value = String(Math.round(lightIntensityScale * 100));

        const explodeInput = chrome.toolbar.querySelector('[data-action="explode"]');
        if (explodeInput) explodeInput.value = String(Math.round(clamp01(explodeAmount) * 100));

        const materialSelect = chrome.toolbar.querySelector('[data-action="material"]');
        if (materialSelect && allMaterialId) materialSelect.value = allMaterialId;

        const clipEnabled = chrome.toolbar.querySelector('[data-action="clip-enabled"]');
        if (clipEnabled) clipEnabled.checked = !!clipState.enabled;
        setSectionOptsVisible(chrome.toolbar, !!clipState.enabled);
        const clipAxis = chrome.toolbar.querySelector('[data-action="clip-axis"]');
        if (clipAxis) clipAxis.value = clipState.axis;
        const clipAmount = chrome.toolbar.querySelector('[data-action="clip-amount"]');
        if (clipAmount) clipAmount.value = String(Math.round(clamp01(clipState.amount) * 100));
      };

      const syncPartMaterialSelects = function (presetId) {
        if (!chrome.partsPanel) return;
        chrome.partsPanel.querySelectorAll('select[data-action="part-material"]').forEach(function (select) {
          if (presetId) {
            select.value = presetId;
            return;
          }
          const index = Number(select.getAttribute("data-part-index"));
          if (!Number.isFinite(index) || !partMeshes[index]) return;
          const key = partMaterialKey(partMeshes[index], index);
          select.value = materialByPart[key] || partMeshes[index].userData.materialPreset || "imported";
        });
      };

      const syncPartMaterialSelectsFromMap = function () {
        syncPartMaterialSelects(null);
      };

      const readViewState = function () {
        const materials = Object.assign({}, materialByPart);
        const state = {
          camera: {
            position: vec3ToArray(camera.position),
            target: vec3ToArray(controls.target),
            up: vec3ToArray(camera.up)
          },
          explode: showAssemblyTools ? round3(clamp01(explodeAmount)) : 0,
          materials: materials,
          autoRotate: !!autoRotate,
          rotateAxis: autoRotateAxisId,
          light: lightPresetId,
          lightIntensity: round3(lightIntensityScale),
          clip: showAssemblyTools
            ? {
                enabled: !!clipState.enabled,
                axis: clipState.axis,
                amount: round3(clamp01(clipState.amount))
              }
            : { enabled: false, axis: "x", amount: 0.5 }
        };
        if (allMaterialId) state.allMaterial = allMaterialId;
        return state;
      };

      const applyCameraState = function (cameraState) {
        if (!cameraState) return;
        const pos = cameraState.position;
        const target = cameraState.target;
        const up = cameraState.up;
        if (Array.isArray(pos) && pos.length >= 3) {
          camera.position.set(Number(pos[0]) || 0, Number(pos[1]) || 0, Number(pos[2]) || 0);
        }
        if (Array.isArray(target) && target.length >= 3) {
          controls.target.set(Number(target[0]) || 0, Number(target[1]) || 0, Number(target[2]) || 0);
        }
        if (Array.isArray(up) && up.length >= 3) {
          camera.up.set(Number(up[0]) || 0, Number(up[1]) || 1, Number(up[2]) || 0);
        } else {
          camera.up.set(0, 1, 0);
        }
        camera.lookAt(controls.target);
        if (typeof controls.handleResize === "function") controls.handleResize();
        controls.update();
      };

      const applyMaterialsState = function (materialsMap, allId) {
        if (allId) {
          allMaterialId = allId;
          applyMaterialPreset(THREE, partMeshes, allId);
          partMeshes.forEach(function (mesh, index) {
            materialByPart[partMaterialKey(mesh, index)] = allId;
          });
        }
        if (materialsMap && typeof materialsMap === "object") {
          partMeshes.forEach(function (mesh, index) {
            const key = partMaterialKey(mesh, index);
            if (Object.prototype.hasOwnProperty.call(materialsMap, key)) {
              const matId = materialsMap[key] || "imported";
              materialByPart[key] = matId;
              applyMaterialPresetToMesh(THREE, mesh, matId);
            }
          });
        }
        const materialSelect = chrome.toolbar.querySelector('[data-action="material"]');
        if (materialSelect && allMaterialId) materialSelect.value = allMaterialId;
        if (chrome.partsPanel) {
          if (allId && (!materialsMap || !Object.keys(materialsMap).length)) {
            syncPartMaterialSelects(allId);
          } else {
            syncPartMaterialSelectsFromMap();
          }
        }
        refreshClipPlane();
      };

      const applyClipState = function (clip) {
        if (!showAssemblyTools || !clip || typeof clip !== "object") return;
        clipState.enabled = !!clip.enabled;
        clipState.axis = clip.axis === "y" || clip.axis === "z" ? clip.axis : "x";
        clipState.amount = clamp01(clip.amount != null ? clip.amount : 0.5);
        refreshClipPlane();
      };

      const applyViewerConfig = function (config) {
        if (!config || typeof config !== "object") return;
        if (typeof config.autoRotate === "boolean") {
          autoRotate = config.autoRotate;
        }
        if (config.rotateAxis) setAutoRotateAxis(config.rotateAxis);
        if (config.light || config.lightIntensity != null) {
          applyLightPreset(config.light || lightPresetId, config.lightIntensity != null ? Number(config.lightIntensity) : lightIntensityScale);
        }
        if (showAssemblyTools && config.explode != null) {
          explodeAmount = clamp01(config.explode);
          setExplodeAmount(partMeshes, explodeAmount, explodeMeta.maxSpan);
        }
        applyMaterialsState(config.materials, config.allMaterial);
        applyClipState(config.clip);
        if (config.camera) {
          applyCameraState(config.camera);
        }
        syncToolbarFromState();
      };

      const presentObject = function (object, configOptions) {
        const cfg = configOptions || {};
        if (modelRoot) {
          scene.remove(modelRoot);
          disposeObject3D(modelRoot);
        }
        modelRoot = object;
        partMeshes = collectPartMeshes(object);
        partMeshes.forEach(function (mesh, index) {
          const key = partMaterialKey(mesh, index);
          const presetId = materialByPart[key] || mesh.userData.materialPreset || "imported";
          materialByPart[key] = presetId;
          applyMaterialPresetToMesh(THREE, mesh, presetId);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        });
        object.traverse(function (obj) {
          if (obj && obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });
        updateShadowFrustum(object);
        if (showAssemblyTools) {
          explodeMeta = prepareExplodeData(THREE, partMeshes);
          clipBounds = explodeMeta.box ? explodeMeta.box.clone() : null;
          updateSizeBadge(clipBounds);
          if (chrome.partsPanel) populatePartsList(chrome.partsPanel, partMeshes, materialByPart);
          setExplodeAmount(partMeshes, explodeAmount, explodeMeta.maxSpan);
        } else {
          explodeMeta = { maxSpan: 1, box: null };
          explodeAmount = 0;
          const box = new THREE.Box3().setFromObject(object);
          clipBounds = box.clone();
          updateSizeBadge(clipBounds);
        }
        scene.add(object);
        if (countTriangles(object) >= HEAVY_TRIANGLE_COUNT) {
          renderer.setPixelRatio(1);
        } else {
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        }
        resize();
        if (!cfg.skipFit) {
          fitCameraToObject(THREE, camera, controls, object);
        }
        refreshClipPlane();
        if (!animateStarted) {
          animateStarted = true;
          animate();
        }
      };

      const stageOverlay = document.createElement("div");
      stageOverlay.className = "model-viewer-overlay";
      stageOverlay.hidden = true;
      stageOverlay.innerHTML =
        '<div class="model-viewer-spinner" aria-hidden="true"></div>' +
        '<p data-overlay-text>Updating tessellation…</p>';
      chrome.stage.appendChild(stageOverlay);

      const setOverlay = function (message) {
        stageOverlay.hidden = !message;
        const text = stageOverlay.querySelector("[data-overlay-text]");
        if (text && message) text.textContent = message;
      };

      const loadCadObject = function (quality) {
        if (ext === "step" || ext === "stp") {
          parseInFlight = true;
          return loadStepModel(modelSrc, quality, function (message) {
            if (modelRoot) setOverlay(message);
            else setStatus(message);
          }).then(function (result) {
            if (disposed) return null;
            const progress = function (done, total) {
              const message = "Building scene… " + done + "/" + total + " parts";
              if (modelRoot) setOverlay(message);
              else setStatus(message);
            };
            return meshesFromOcctResult(THREE, result, progress);
          }).finally(function () {
            parseInFlight = false;
          });
        }
        return loadGltfModel(gltfLoader, modelSrc);
      };

      const downloadDataUrl = function (dataUrl, filename) {
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = filename || "model-view.png";
        document.body.appendChild(link);
        link.click();
        link.remove();
      };

      const copyViewLink = function () {
        const encoded = encodeViewState(readViewState());
        const url = new URL(window.location.href);
        url.hash = "view=" + encoded;
        const href = url.toString();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(href).catch(function () {
            window.prompt("Copy view link:", href);
          });
        } else {
          window.prompt("Copy view link:", href);
        }
      };

      captureScreenshotImpl = function () {
        if (disposed) return null;
        renderer.render(scene, camera);
        try {
          return renderer.domElement.toDataURL("image/png");
        } catch (err) {
          console.warn("Screenshot failed:", err);
          return null;
        }
      };

      getViewStateImpl = function () {
        return readViewState();
      };

      getPresetImpl = function () {
        const state = readViewState();
        const preset = {
          explode: state.explode,
          materials: state.materials,
          autoRotate: state.autoRotate,
          rotateAxis: state.rotateAxis,
          light: state.light,
          lightIntensity: state.lightIntensity,
          camera: state.camera,
          clip: state.clip
        };
        if (state.allMaterial) preset.allMaterial = state.allMaterial;
        return preset;
      };

      const onToolbarChange = function (event) {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const actionEl = target.closest("[data-action]");
        if (!(actionEl instanceof HTMLElement)) return;
        const action = actionEl.getAttribute("data-action");
        const control =
          target.getAttribute("data-action") != null ? target : actionEl;
        const isClick = event.type === "click";
        const isFormEvent = event.type === "change" || event.type === "input";

        if (action === "material") {
          if (!isFormEvent) return;
          allMaterialId = control.value;
          applyMaterialPreset(THREE, partMeshes, control.value);
          partMeshes.forEach(function (mesh, index) {
            materialByPart[partMaterialKey(mesh, index)] = control.value;
          });
          syncPartMaterialSelects(control.value);
          refreshClipPlane();
        } else if (action === "part-material") {
          if (!isFormEvent) return;
          const index = Number(control.getAttribute("data-part-index"));
          if (!Number.isFinite(index) || !partMeshes[index]) return;
          const presetId = control.value || "imported";
          materialByPart[partMaterialKey(partMeshes[index], index)] = presetId;
          applyMaterialPresetToMesh(THREE, partMeshes[index], presetId);
          refreshClipPlane();
        } else if (action === "rotate") {
          if (event.type !== "change") return;
          if (!(control instanceof HTMLInputElement)) return;
          autoRotate = !!control.checked;
        } else if (action === "rotate-axis") {
          if (!isFormEvent) return;
          setAutoRotateAxis(control.value);
        } else if (action === "light") {
          if (!isFormEvent) return;
          applyLightPreset(control.value, lightIntensityScale);
        } else if (action === "light-intensity") {
          if (!isFormEvent) return;
          applyLightPreset(lightPresetId, Number(control.value || 100) / 100);
        } else if (action === "explode") {
          if (!isFormEvent) return;
          explodeAmount = Number(control.value || 0) / 100;
          setExplodeAmount(partMeshes, explodeAmount, explodeMeta.maxSpan);
        } else if (action === "clip-enabled") {
          if (event.type !== "change") return;
          if (!(control instanceof HTMLInputElement)) return;
          clipState.enabled = !!control.checked;
          setSectionOptsVisible(chrome.toolbar, clipState.enabled);
          refreshClipPlane();
        } else if (action === "clip-axis") {
          if (!isFormEvent) return;
          clipState.axis = control.value === "y" || control.value === "z" ? control.value : "x";
          refreshClipPlane();
        } else if (action === "clip-amount") {
          if (!isFormEvent) return;
          clipState.amount = Number(control.value || 0) / 100;
          refreshClipPlane();
        } else if (action === "screenshot") {
          if (!isClick) return;
          event.preventDefault();
          const dataUrl = captureScreenshotImpl();
          if (dataUrl) {
            downloadDataUrl(dataUrl, (projectId || "model") + "-view.png");
          }
        } else if (action === "copy-view") {
          if (!isClick) return;
          event.preventDefault();
          copyViewLink();
        } else if (action === "detail") {
          if (!isFormEvent) return;
          const nextQuality = control.value === "full" ? "full" : "preview";
          if (nextQuality === stepQuality || parseInFlight) return;
          stepQuality = nextQuality;
          const preserved = readViewState();
          loadCadObject(stepQuality)
            .then(function (object) {
              if (disposed || !object) return;
              presentObject(object, { skipFit: true });
              applyViewerConfig(preserved);
              setOverlay(null);
            })
            .catch(function (err) {
              console.warn("STEP retessellate failed:", err);
              setOverlay(null);
            });
        } else if (action === "toggle-parts") {
          if (!isClick) return;
          event.preventDefault();
          if (!chrome.partsPanel) return;
          chrome.partsPanel.dataset.userToggled = "1";
          setPartsPanelCollapsed(chrome.partsPanel, !chrome.partsPanel.classList.contains("is-collapsed"));
        } else if (action === "show-all") {
          if (!isClick) return;
          event.preventDefault();
          partMeshes.forEach(function (mesh) {
            mesh.visible = true;
          });
          if (chrome.partsPanel) {
            chrome.partsPanel.querySelectorAll('input[type="checkbox"][data-part-index]').forEach(function (input) {
              input.checked = true;
            });
          }
        }
      };

      const onPartsChange = function (event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        const index = Number(target.getAttribute("data-part-index"));
        if (!Number.isFinite(index) || !partMeshes[index]) return;
        partMeshes[index].visible = !!target.checked;
      };

      chrome.toolbar.addEventListener("change", onToolbarChange);
      chrome.toolbar.addEventListener("click", onToolbarChange);
      chrome.toolbar.addEventListener("input", onToolbarChange);
      if (chrome.partsPanel) {
        chrome.partsPanel.addEventListener("change", onPartsChange);
        chrome.partsPanel.addEventListener("change", onToolbarChange);
        chrome.partsPanel.addEventListener("click", onToolbarChange);
      }

      cleanup = function () {
        cancelAnimationFrame(frameId);
        frameId = 0;
        window.removeEventListener("resize", onResize);
        if (resizeObserver) resizeObserver.disconnect();
        chrome.toolbar.removeEventListener("change", onToolbarChange);
        chrome.toolbar.removeEventListener("click", onToolbarChange);
        chrome.toolbar.removeEventListener("input", onToolbarChange);
        if (chrome.partsPanel) {
          chrome.partsPanel.removeEventListener("change", onPartsChange);
          chrome.partsPanel.removeEventListener("change", onToolbarChange);
          chrome.partsPanel.removeEventListener("click", onToolbarChange);
        }
        if (parseInFlight) terminateStepJob();
        disposeObject3D(modelRoot);
        modelRoot = null;
        controls.dispose();
        renderer.dispose();
        if (parkBin.isConnected) parkBin.remove();
        parkBin.replaceChildren();
        mountEl.replaceChildren();
      };

      const detailField = chrome.toolbar.querySelector("[data-detail-field]");
      if (detailField && isStep) {
        detailField.hidden = false;
        const select = detailField.querySelector("select");
        if (select) select.value = stepQuality;
      }

      return loadCadObject(stepQuality)
        .then(function (object) {
          if (disposed || !object) return;
          attachToMount(chrome.shell);
          const hasCameraOverride =
            (initialViewState && initialViewState.camera) ||
            (initialPreset && initialPreset.camera);
          presentObject(object, { skipFit: !!hasCameraOverride });
          if (initialPreset) applyViewerConfig(initialPreset);
          if (initialViewState) applyViewerConfig(initialViewState);
          syncToolbarFromState();
          setOverlay(null);
          if (!parked) {
            resize();
            restartAnimate();
          }
        })
        .catch(function (err) {
          console.warn("Model load failed:", modelSrc, err);
          if (disposed) return;
          const message =
            ext === "step" || ext === "stp"
              ? "Unable to load STEP file" +
                (err && err.message ? " (" + err.message + ")" : "") +
                ". Large assemblies can be slow — try exporting as .glb/.gltf for best results."
              : "Unable to load 3D model.";
          if (parked) {
            parkBin.textContent = message;
          } else {
            mountEl.textContent = message;
          }
        });
    })
    .catch(function (err) {
      console.warn("Unable to load Three.js viewer.", err);
      if (!disposed) {
        mountEl.textContent = "Unable to load 3D viewer. Check your network connection.";
      }
    });

  return {
    park: function () {
      if (disposed || parked) return;
      parked = true;
      cancelAnimationFrame(frameId);
      frameId = 0;
      if (!parkBin.isConnected) document.body.appendChild(parkBin);
      while (mountEl.firstChild) {
        parkBin.appendChild(mountEl.firstChild);
      }
    },
    resume: function (nextMount) {
      if (disposed) return;
      if (nextMount) mountEl = nextMount;
      parked = false;
      while (parkBin.firstChild) {
        mountEl.appendChild(parkBin.firstChild);
      }
      if (parkBin.isConnected) parkBin.remove();
      resizeFn();
      restartAnimate();
    },
    dispose: function () {
      disposed = true;
      parked = false;
      cleanup();
    },
    getViewState: function () {
      return getViewStateImpl();
    },
    getPreset: function () {
      return getPresetImpl();
    },
    captureScreenshot: function () {
      return captureScreenshotImpl();
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
