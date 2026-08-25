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
  aluminum: { color: 0xb0b7bf, metalness: 0.85, roughness: 0.28 },
  steel: { color: 0x8a9299, metalness: 0.9, roughness: 0.35 },
  plastic: { color: 0x4b5563, metalness: 0.05, roughness: 0.55 },
  matte: { color: 0x9aa3ad, metalness: 0.05, roughness: 0.9 },
  glass: { color: 0xc8e7f5, metalness: 0.05, roughness: 0.05, opacity: 0.22, transparent: true },
  acrylic: { color: 0xd7e6ef, metalness: 0.0, roughness: 0.18, opacity: 0.42, transparent: true },
  frosted: { color: 0xe8eaed, metalness: 0.0, roughness: 0.72, opacity: 0.55, transparent: true },
  clear: { color: 0xffffff, metalness: 0.0, roughness: 0.04, opacity: 0.12, transparent: true },
  tintBlue: { color: 0x4a90d9, metalness: 0.05, roughness: 0.2, opacity: 0.4, transparent: true },
  tintAmber: { color: 0xd4a017, metalness: 0.05, roughness: 0.25, opacity: 0.45, transparent: true }
};

const MATERIAL_OPTION_LABELS = {
  imported: "Imported colors",
  aluminum: "Aluminum",
  steel: "Steel",
  plastic: "Plastic",
  matte: "Matte",
  glass: "Glass (clear)",
  acrylic: "Acrylic (translucent)",
  frosted: "Frosted (translucent)",
  clear: "Clear (near invisible)",
  tintBlue: "Tinted blue",
  tintAmber: "Tinted amber"
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
      import("three/addons/controls/OrbitControls.js"),
      import("three/addons/loaders/GLTFLoader.js"),
      import("three/addons/loaders/DRACOLoader.js")
    ]).then(function (mods) {
      const THREE = mods[0];
      const OrbitControls = mods[1].OrbitControls;
      const GLTFLoader = mods[2].GLTFLoader;
      const DRACOLoader = mods[3].DRACOLoader;
      const gltfLoader = new GLTFLoader();
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath(THREE_CDN + "examples/jsm/libs/draco/");
      gltfLoader.setDRACOLoader(dracoLoader);
      return {
        THREE: THREE,
        OrbitControls: OrbitControls,
        gltfLoader: gltfLoader
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

function applyMaterialPresetToMesh(THREE, mesh, presetId) {
  if (!mesh) return;
  const id = presetId || "imported";
  mesh.userData.materialPreset = id;
  const preset = MATERIAL_PRESETS[id];

  if (!preset || id === "imported") {
    const imported = mesh.userData.importedMaterials;
    if (imported && imported.length) {
      mesh.material = imported.length > 1 ? imported : imported[0];
    }
    return;
  }

  const transparent = !!(preset.transparent || (preset.opacity != null && preset.opacity < 1));
  const opacity = preset.opacity != null ? preset.opacity : 1;

  const makeMat = function (baseColor) {
    return new THREE.MeshStandardMaterial({
      color: baseColor != null ? baseColor : preset.color,
      metalness: preset.metalness,
      roughness: preset.roughness,
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
    '<label class="model-viewer-field">All parts' +
      '<select data-action="material">' +
        materialOptionsHtml("imported") +
      "</select>" +
    "</label>" +
    '<label class="model-viewer-field" data-detail-field hidden>Detail' +
      '<select data-action="detail">' +
        '<option value="preview">Fast preview</option>' +
        '<option value="full">Full quality</option>' +
      "</select>" +
    "</label>" +
    '<label class="model-viewer-toggle"><input type="checkbox" data-action="rotate" checked /> Auto-rotate</label>' +
    (opts.showExplode
      ? '<label class="model-viewer-field model-viewer-explode">Explode' +
          '<input type="range" min="0" max="100" value="0" data-action="explode" />' +
        "</label>"
      : "") +
    (opts.showClip
      ? '<label class="model-viewer-toggle"><input type="checkbox" data-action="clip-enabled" /> Section</label>' +
        '<label class="model-viewer-field">Axis' +
          '<select data-action="clip-axis">' +
            '<option value="x">X</option>' +
            '<option value="y">Y</option>' +
            '<option value="z">Z</option>' +
          "</select>" +
        "</label>" +
        '<label class="model-viewer-field model-viewer-clip">Clip' +
          '<input type="range" min="0" max="100" value="50" data-action="clip-amount" />' +
        "</label>"
      : "") +
    '<div class="model-viewer-actions">' +
      '<button type="button" data-action="screenshot">Screenshot</button>' +
      '<button type="button" data-action="copy-view">Copy view link</button>' +
    "</div>";

  shell.appendChild(stage);
  shell.appendChild(toolbar);

  let partsPanel = null;
  if (opts.showParts) {
    partsPanel = document.createElement("div");
    partsPanel.className = "model-viewer-parts";
    partsPanel.innerHTML =
      '<div class="model-viewer-parts-header">' +
        "<span>Parts</span>" +
        '<button type="button" data-action="show-all">Show all</button>' +
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
}

export function createViewer(mount, modelSrc, options) {
  if (!mount) {
    return {
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

  let disposed = false;
  let frameId = 0;
  let cleanup = function () {};
  let autoRotate = true;
  let explodeAmount = 0;
  let allMaterialId = null;
  let modelRoot = null;
  let partMeshes = [];
  let explodeMeta = { maxSpan: 1, box: null };
  let parseInFlight = false;
  let stepQuality = "preview";
  let animateStarted = false;
  let clipBounds = null;
  let sizeUnitLabel = "mm";
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
  mount.replaceChildren(status);

  const setStatus = function (message) {
    const text = status.querySelector("[data-status-text]");
    if (text) text.textContent = message;
    else status.textContent = message;
  };

  loadThreeBundle()
    .then(function (bundle) {
      if (disposed) return;
      const THREE = bundle.THREE;
      const OrbitControls = bundle.OrbitControls;
      const gltfLoader = bundle.gltfLoader;
      const ext = getExtension(modelSrc);
      const isStep = ext === "step" || ext === "stp";
      const showAssemblyTools = isStep;
      sizeUnitLabel = isStep ? "mm" : "mm";

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
      renderer.localClippingEnabled = false;
      renderer.domElement.className = "model-viewer-canvas";
      chrome.stage.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = null;

      const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 1.2;

      const clipPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);

      const hemi = new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 1.0);
      scene.add(hemi);
      const dir = new THREE.DirectionalLight(0xffffff, 1.15);
      dir.position.set(3, 5, 2);
      scene.add(dir);
      const fill = new THREE.DirectionalLight(0xffffff, 0.35);
      fill.position.set(-4, 1, -2);
      scene.add(fill);

      const resize = function () {
        if (disposed) return;
        const width = chrome.stage.clientWidth || mount.clientWidth || 1;
        const height = chrome.stage.clientHeight || mount.clientHeight || 1;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };

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
        if (disposed) return;
        controls.autoRotate = autoRotate;
        controls.update();
        renderer.render(scene, camera);
        frameId = requestAnimationFrame(animate);
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
        chrome.sizeBadge.textContent = formatSizeLabel(size, sizeUnitLabel);
        chrome.sizeBadge.hidden = false;
      };

      const syncToolbarFromState = function () {
        const rotateInput = chrome.toolbar.querySelector('[data-action="rotate"]');
        if (rotateInput) rotateInput.checked = !!autoRotate;

        const explodeInput = chrome.toolbar.querySelector('[data-action="explode"]');
        if (explodeInput) explodeInput.value = String(Math.round(clamp01(explodeAmount) * 100));

        const materialSelect = chrome.toolbar.querySelector('[data-action="material"]');
        if (materialSelect && allMaterialId) materialSelect.value = allMaterialId;

        const clipEnabled = chrome.toolbar.querySelector('[data-action="clip-enabled"]');
        if (clipEnabled) clipEnabled.checked = !!clipState.enabled;
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
            target: vec3ToArray(controls.target)
          },
          explode: showAssemblyTools ? round3(clamp01(explodeAmount)) : 0,
          materials: materials,
          autoRotate: !!autoRotate,
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
        if (Array.isArray(pos) && pos.length >= 3) {
          camera.position.set(Number(pos[0]) || 0, Number(pos[1]) || 0, Number(pos[2]) || 0);
        }
        if (Array.isArray(target) && target.length >= 3) {
          controls.target.set(Number(target[0]) || 0, Number(target[1]) || 0, Number(target[2]) || 0);
        }
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
        });
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
          camera: state.camera,
          clip: state.clip
        };
        if (state.allMaterial) preset.allMaterial = state.allMaterial;
        return preset;
      };

      const onToolbarChange = function (event) {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const action = target.getAttribute("data-action");
        if (action === "material") {
          allMaterialId = target.value;
          applyMaterialPreset(THREE, partMeshes, target.value);
          partMeshes.forEach(function (mesh, index) {
            materialByPart[partMaterialKey(mesh, index)] = target.value;
          });
          syncPartMaterialSelects(target.value);
          refreshClipPlane();
        } else if (action === "part-material") {
          const index = Number(target.getAttribute("data-part-index"));
          if (!Number.isFinite(index) || !partMeshes[index]) return;
          const presetId = target.value || "imported";
          materialByPart[partMaterialKey(partMeshes[index], index)] = presetId;
          applyMaterialPresetToMesh(THREE, partMeshes[index], presetId);
          refreshClipPlane();
        } else if (action === "rotate") {
          autoRotate = !!target.checked;
        } else if (action === "explode") {
          explodeAmount = Number(target.value || 0) / 100;
          setExplodeAmount(partMeshes, explodeAmount, explodeMeta.maxSpan);
        } else if (action === "clip-enabled") {
          clipState.enabled = !!target.checked;
          refreshClipPlane();
        } else if (action === "clip-axis") {
          clipState.axis = target.value === "y" || target.value === "z" ? target.value : "x";
          refreshClipPlane();
        } else if (action === "clip-amount") {
          clipState.amount = Number(target.value || 0) / 100;
          refreshClipPlane();
        } else if (action === "screenshot") {
          const dataUrl = captureScreenshotImpl();
          if (dataUrl) {
            downloadDataUrl(dataUrl, (projectId || "model") + "-view.png");
          }
        } else if (action === "copy-view") {
          copyViewLink();
        } else if (action === "detail") {
          const nextQuality = target.value === "full" ? "full" : "preview";
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
        } else if (action === "show-all") {
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
        controls.dispose();
        renderer.dispose();
        mount.replaceChildren();
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
          mount.replaceChildren(chrome.shell);
          const hasCameraOverride =
            (initialViewState && initialViewState.camera) ||
            (initialPreset && initialPreset.camera);
          presentObject(object, { skipFit: !!hasCameraOverride });
          if (initialPreset) applyViewerConfig(initialPreset);
          if (initialViewState) applyViewerConfig(initialViewState);
          syncToolbarFromState();
          setOverlay(null);
        })
        .catch(function (err) {
          console.warn("Model load failed:", modelSrc, err);
          if (disposed) return;
          if (ext === "step" || ext === "stp") {
            mount.textContent =
              "Unable to load STEP file" +
              (err && err.message ? " (" + err.message + ")" : "") +
              ". Large assemblies can be slow — try exporting as .glb/.gltf for best results.";
          } else {
            mount.textContent = "Unable to load 3D model.";
          }
        });
    })
    .catch(function (err) {
      console.warn("Unable to load Three.js viewer.", err);
      if (!disposed) {
        mount.textContent = "Unable to load 3D viewer. Check your network connection.";
      }
    });

  return {
    dispose: function () {
      disposed = true;
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
