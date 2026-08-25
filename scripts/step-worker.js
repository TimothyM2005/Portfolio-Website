/* global occtimportjs */
/**
 * Background STEP tessellation. Keeps occt-import-js off the page's main thread
 * so the modal stays interactive while large assemblies convert to meshes.
 */
const OCCT_BASE = "https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/";

let occtPromise = null;

function getOcct() {
  if (!occtPromise) {
    importScripts(OCCT_BASE + "occt-import-js.js");
    occtPromise = occtimportjs({
      locateFile: function (path) {
        return OCCT_BASE + path;
      }
    });
  }
  return occtPromise;
}

function isGzip(bytes) {
  return bytes && bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

async function gunzipBytes(bytes) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot decompress gzip STEP files.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Unable to fetch STEP file (" + response.status + ").");
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function loadStepBytes(src, postStatus) {
  const gzUrl = src + ".gz";
  try {
    postStatus("Downloading compressed STEP…");
    const gzBytes = await fetchBytes(gzUrl);
    if (isGzip(gzBytes)) {
      postStatus("Decompressing STEP…");
      return gunzipBytes(gzBytes);
    }
  } catch (err) {
    // Fall through to the uncompressed original.
  }

  postStatus("Downloading STEP…");
  const bytes = await fetchBytes(src);
  if (isGzip(bytes)) {
    postStatus("Decompressing STEP…");
    return gunzipBytes(bytes);
  }
  return bytes;
}

function toFloat32(values) {
  if (!values) return null;
  return new Float32Array(values);
}

function toIndexArray(values) {
  if (!values) return null;
  let high = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] > high) high = values[i];
  }
  if (high > 65535) return Uint32Array.from(values);
  return Uint16Array.from(values);
}

function packResult(result) {
  const transfer = [];
  const meshes = (result.meshes || []).map(function (mesh) {
    const packed = {
      name: mesh.name || "",
      color: mesh.color || null,
      brep_faces: mesh.brep_faces || [],
      attributes: {},
      index: null
    };

    if (mesh.attributes && mesh.attributes.position && mesh.attributes.position.array) {
      const pos = toFloat32(mesh.attributes.position.array);
      packed.attributes.position = { array: pos };
      if (pos && pos.buffer) transfer.push(pos.buffer);
    }
    if (mesh.attributes && mesh.attributes.normal && mesh.attributes.normal.array) {
      const nrm = toFloat32(mesh.attributes.normal.array);
      packed.attributes.normal = { array: nrm };
      if (nrm && nrm.buffer) transfer.push(nrm.buffer);
    }
    if (mesh.index && mesh.index.array) {
      const idx = toIndexArray(mesh.index.array);
      packed.index = { array: idx };
      if (idx && idx.buffer) transfer.push(idx.buffer);
    }
    return packed;
  });

  return {
    payload: {
      success: !!(result && result.success),
      root: result && result.root ? { name: result.root.name || "Assembly" } : { name: "Assembly" },
      meshes: meshes
    },
    transfer: transfer
  };
}

self.onmessage = async function (event) {
  const data = event.data || {};
  const jobId = data.jobId;
  const postStatus = function (message) {
    self.postMessage({ type: "status", jobId: jobId, message: message });
  };

  try {
    if (data.type !== "parse") return;
    const bytes = await loadStepBytes(data.src, postStatus);
    if (!bytes.length) {
      throw new Error("STEP file is empty.");
    }

    postStatus("Preparing CAD kernel…");
    const occt = await getOcct();

    const mb = (bytes.length / (1024 * 1024)).toFixed(1);
    postStatus("Tessellating " + mb + " MB STEP in a background thread…");
    const result = occt.ReadStepFile(bytes, data.params || null);
    if (!result || !result.success) {
      throw new Error("STEP parse failed or returned no meshes.");
    }

    postStatus("Packing mesh data…");
    const packed = packResult(result);
    self.postMessage(
      { type: "done", jobId: jobId, result: packed.payload },
      packed.transfer
    );
  } catch (err) {
    self.postMessage({
      type: "error",
      jobId: jobId,
      message: (err && err.message) || "STEP tessellation failed."
    });
  }
};
