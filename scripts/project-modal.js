import { escapeHtml } from "./projects.js?v=feat10";
import { detectLocalAdmin, saveProject } from "./projects-store.js?v=feat10";
import { loadCopyrightConfig, pdfOverlayHtml, watermarkText } from "./copyright.js?v=protect1";

loadCopyrightConfig();

let activeViewer = null;
let activeProjectId = null;
const viewerCache = new Map();
let modelManifest = {};
let projectsById = {};

function flushStaleParkedViewers() {
  if (window.__portfolioCadUi13) return;
  window.__portfolioCadUi13 = true;
  viewerCache.forEach(function (viewer) {
    if (viewer && typeof viewer.dispose === "function") viewer.dispose();
  });
  viewerCache.clear();
  if (activeViewer && typeof activeViewer.dispose === "function") {
    activeViewer.dispose();
  }
  activeViewer = null;
  activeProjectId = null;
}

function ensureModal() {
  let modal = document.getElementById("project-modal");
  if (modal) {
    // Upgrade older modal shells created before this layout.
    if (!modal.querySelector(".project-modal-layout") || modal.querySelector("#project-modal-docs")) {
      if (activeViewer && typeof activeViewer.dispose === "function") activeViewer.dispose();
      activeViewer = null;
      activeProjectId = null;
      viewerCache.forEach(function (viewer) {
        if (viewer && typeof viewer.dispose === "function") viewer.dispose();
      });
      viewerCache.clear();
      modal.remove();
      modal = null;
    } else {
      return modal;
    }
  }

  modal = document.createElement("div");
  modal.id = "project-modal";
  modal.className = "project-modal";
  modal.setAttribute("hidden", "");
  modal.innerHTML =
    '<div class="project-modal-backdrop" data-close="true"></div>' +
    '<div class="project-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="project-modal-title">' +
      '<button type="button" class="project-modal-close" data-close="true" aria-label="Close">&times;</button>' +
      '<div class="project-modal-layout" id="project-modal-layout">' +
        '<div class="project-modal-viewer-wrap">' +
          '<div id="project-modal-viewer" class="project-modal-viewer">No CAD model for this project yet.</div>' +
          '<div id="project-modal-downloads" class="project-modal-downloads" hidden></div>' +
          '<p class="project-modal-hint">Drag to orbit · Scroll to zoom</p>' +
        "</div>" +
        '<div class="project-modal-content">' +
          '<h2 id="project-modal-title"></h2>' +
          '<div id="project-modal-meta" class="project-modal-meta"></div>' +
          '<div id="project-modal-body" class="project-modal-body"></div>' +
        "</div>" +
      "</div>" +
    "</div>";

  document.body.appendChild(modal);

  modal.addEventListener("click", function (event) {
    const target = event.target;
    if (target && target.getAttribute && target.getAttribute("data-close") === "true") {
      closeProjectModal();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !modal.hasAttribute("hidden")) {
      closeProjectModal();
    }
  });

  return modal;
}

function parkActiveViewer() {
  if (!activeViewer) {
    activeProjectId = null;
    return;
  }
  if (activeProjectId && typeof activeViewer.park === "function") {
    activeViewer.park();
    viewerCache.set(activeProjectId, activeViewer);
  } else if (typeof activeViewer.dispose === "function") {
    activeViewer.dispose();
  }
  activeViewer = null;
  activeProjectId = null;
}

function bindSavePreset(project, projectId) {
  detectLocalAdmin().then(function (isLocal) {
    const saveWrap = document.getElementById("project-modal-save-preset");
    if (!saveWrap || !isLocal || !activeViewer) return;
    saveWrap.hidden = false;
    saveWrap.innerHTML =
      '<button type="button" class="btn" data-save-preset>Save current viewer as project default</button>' +
      '<p class="muted" style="margin:0.4rem 0 0;font-size:0.78rem;">Writes explode, materials, camera, and clip into this project on disk.</p>';
    saveWrap.querySelector("[data-save-preset]").addEventListener("click", function () {
      if (!activeViewer || typeof activeViewer.getPreset !== "function") return;
      const next = Object.assign({}, project, { viewerPreset: activeViewer.getPreset() });
      saveProject(next)
        .then(function () {
          projectsById[projectId] = next;
          saveWrap.querySelector("p").textContent = "Saved viewer defaults to disk. Commit & push to publish.";
        })
        .catch(function (err) {
          saveWrap.querySelector("p").textContent = err.message || "Unable to save preset.";
        });
    });
  });
}

function fileNameFromUrl(url) {
  const clean = String(url || "").split("?")[0].split("#")[0];
  const parts = clean.split("/");
  return parts[parts.length - 1] || "download";
}

function documentLabel(doc) {
  const raw = String((doc && doc.name) || "").trim();
  if (!raw) return "Document";
  if (/\.(pdf|docx?|pptx?|xlsx?)$/i.test(raw) && raw.length > 40) {
    return "PDF document";
  }
  if (/\.(pdf|docx?|pptx?|xlsx?)$/i.test(raw)) {
    return raw.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim() || "Document";
  }
  return raw;
}

function renderDownloads(modelSrc) {
  const wrap = document.getElementById("project-modal-downloads");
  if (!wrap) return;
  if (!modelSrc) {
    wrap.hidden = true;
    wrap.innerHTML = "";
    return;
  }
  wrap.hidden = false;
  wrap.innerHTML =
    '<a class="project-download-link" href="' +
    escapeHtml(modelSrc) +
    '" download="' +
    escapeHtml(fileNameFromUrl(modelSrc)) +
    '">Download CAD</a>';
}

function supportsInlinePdfPreview() {
  try {
    const ua = navigator.userAgent || "";
    const touchMac = navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua);
    const mobileUa = /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    if (mobileUa || touchMac) return false;
    if (typeof navigator.pdfViewerEnabled === "boolean") return !!navigator.pdfViewerEnabled;
  } catch (err) {
    return false;
  }
  return true;
}

function documentsSectionHtml(documents) {
  if (!documents.length) return "";
  const first = documents[0];
  const firstUrl = first && first.url ? String(first.url) : "";
  const inlineOk = supportsInlinePdfPreview();
  const previewBlock = !firstUrl
    ? ""
    : inlineOk
      ? '<details class="project-modal-pdf-fold" open>' +
          '<summary><span data-pdf-fold-label>Hide PDF preview</span></summary>' +
          '<div class="project-modal-pdf-frame pdf-viewer-wrap">' +
            '<iframe class="project-modal-pdf" src="' +
            escapeHtml(firstUrl) +
            '#page=1&zoom=page-width" title="' +
            escapeHtml(documentLabel(first)) +
            '"></iframe>' +
            pdfOverlayHtml() +
          "</div>" +
        "</details>"
      : '<div class="project-modal-pdf-mobile">' +
          '<a class="project-modal-pdf-open" href="' +
          escapeHtml(firstUrl) +
          '" target="_blank" rel="noopener">View PDF</a>' +
          '<p class="project-modal-pdf-mobile-note">Mobile browsers can’t show PDFs inside the page. Opens in your device’s PDF viewer.</p>' +
        "</div>";

  return (
    '<section class="project-modal-section project-modal-docs-inline">' +
      "<h3>Documents</h3>" +
      '<ul class="project-modal-doc-list">' +
      documents
        .map(function (doc) {
          const url = escapeHtml(doc.url || "");
          const label = escapeHtml(documentLabel(doc));
          const fileName = escapeHtml(doc.name || fileNameFromUrl(doc.url));
          return (
            "<li>" +
              '<span class="project-modal-doc-title">' + label + "</span>" +
              '<span class="project-modal-doc-actions">' +
                '<a href="' + url + '" target="_blank" rel="noopener">Open</a>' +
                '<a href="' + url + '" download="' + fileName + '">Download</a>' +
              "</span>" +
            "</li>"
          );
        })
        .join("") +
      "</ul>" +
      '<p class="work-copyright-notice">' +
      escapeHtml(watermarkText()) +
      " — " +
      "This document is for portfolio viewing only. See " +
      '<a href="data/work-manifest.json" target="_blank" rel="noopener">work manifest</a> for content fingerprints.</p>' +
      previewBlock +
    "</section>"
  );
}

function bindPdfFoldToggles(root) {
  if (!root) return;
  root.querySelectorAll(".project-modal-pdf-fold").forEach(function (fold) {
    const label = fold.querySelector("[data-pdf-fold-label]");
    if (!label) return;
    const sync = function () {
      label.textContent = fold.open ? "Hide PDF preview" : "Show PDF preview";
    };
    sync();
    fold.addEventListener("toggle", sync);
  });
}

function parseHashViewState() {
  const hash = window.location.hash || "";
  if (hash.indexOf("view=") === -1) return null;
  return hash;
}

export function closeProjectModal() {
  const modal = document.getElementById("project-modal");
  if (!modal) return;
  parkActiveViewer();
  modal.setAttribute("hidden", "");
  document.body.classList.remove("modal-open");
  if (window.history && window.history.replaceState) {
    const url = new URL(window.location.href);
    url.searchParams.delete("project");
    url.hash = "";
    window.history.replaceState({}, "", url.pathname + url.search);
  }
}

export function openProjectModal(projectId, options) {
  flushStaleParkedViewers();
  const project = projectsById[projectId];
  if (!project) return;
  const opts = options || {};

  const modal = ensureModal();
  const titleEl = document.getElementById("project-modal-title");
  const metaEl = document.getElementById("project-modal-meta");
  const bodyEl = document.getElementById("project-modal-body");
  const viewerEl = document.getElementById("project-modal-viewer");

  titleEl.textContent = project.title;

  const documents = Array.isArray(project.documents) ? project.documents : [];

  const tagsHtml = (project.tags || [])
    .map(function (tag) {
      return '<span class="pill ' + escapeHtml(tag.type) + '">' + escapeHtml(tag.label) + "</span>";
    })
    .join("");

  metaEl.innerHTML =
    (project.date ? '<span class="pill date">' + escapeHtml(project.date) + "</span>" : "") +
    tagsHtml +
    (project.featured ? '<span class="pill featured">Featured</span>' : "") +
    (documents.length ? '<span class="pill pdf">' + (documents.length === 1 ? "PDF" : documents.length + " PDFs") + "</span>" : "");

  const details = project.details || "";
  const story = project.story || [];
  const storyHtml = story.length
    ? '<section class="project-modal-section"><h3>Design story</h3><ul class="project-story">' +
      story.map(function (item) { return "<li>" + escapeHtml(item) + "</li>"; }).join("") +
      "</ul></section>"
    : "";

  const outcomeItems = project.outcome || [];
  const outcomeHtml = outcomeItems.length
    ? '<section class="project-modal-section"><h3>Outcome</h3><ul>' +
      outcomeItems.map(function (item) { return "<li>" + escapeHtml(item) + "</li>"; }).join("") +
      "</ul></section>"
    : "";

  bodyEl.innerHTML =
    '<section class="project-modal-section">' +
      "<h3>Goal</h3>" +
      '<p class="goal">' + escapeHtml(project.goal) + "</p>" +
    "</section>" +
    documentsSectionHtml(documents) +
    storyHtml +
    (details
      ? '<section class="project-modal-section"><h3>Details</h3><p>' + escapeHtml(details) + "</p></section>"
      : "") +
    outcomeHtml +
    (project.technical
      ? '<section class="project-modal-section"><h3>Technical</h3><p>' + escapeHtml(project.technical) + "</p></section>"
      : "") +
    '<div id="project-modal-save-preset" class="project-modal-save-preset" hidden></div>';

  bindPdfFoldToggles(bodyEl);

  const modelSrc = modelManifest[projectId] || project.modelUrl || "";
  renderDownloads(modelSrc);

  if (window.history && window.history.replaceState) {
    const url = new URL(window.location.href);
    url.searchParams.set("project", projectId);
    window.history.replaceState({}, "", url.pathname + url.search + (opts.preserveHash ? window.location.hash : ""));
  }

  const reuseActive = activeProjectId === projectId && activeViewer;
  if (!reuseActive) {
    parkActiveViewer();
  }

  if (modelSrc) {
    if (reuseActive) {
      bindSavePreset(project, projectId);
    } else if (viewerCache.has(projectId)) {
      activeViewer = viewerCache.get(projectId);
      viewerCache.delete(projectId);
      activeProjectId = projectId;
      if (typeof activeViewer.resume === "function") {
        activeViewer.resume(viewerEl);
      }
      bindSavePreset(project, projectId);
    } else {
      viewerEl.textContent = "Loading CAD model…";
      activeProjectId = projectId;
      import("./model-viewer.js?v=cadui13")
        .then(function (mod) {
          if (activeProjectId !== projectId) return;
          const viewState = opts.viewState || (mod.decodeViewState ? mod.decodeViewState(parseHashViewState() || "") : null);
          activeViewer = mod.createViewer(viewerEl, modelSrc, {
            projectId: projectId,
            preset: project.viewerPreset || null,
            viewState: viewState
          });
          bindSavePreset(project, projectId);
        })
        .catch(function (err) {
          console.warn("3D viewer failed to load.", err);
          if (activeProjectId === projectId) {
            viewerEl.textContent = "Unable to load 3D viewer. Check your network connection.";
          }
        });
    }
  } else {
    viewerEl.textContent =
      "No CAD model linked yet. Add a .glb/.gltf (or .step/.stp) path for \"" +
      projectId +
      "\" in models/manifest.json (or upload via local Admin).";
  }

  modal.removeAttribute("hidden");
  document.body.classList.add("modal-open");
}

export function initProjectModal(projects, manifest) {
  projectsById = {};
  (projects || []).forEach(function (project) {
    if (project && project.id) projectsById[project.id] = project;
  });
  modelManifest = manifest || {};

  ensureModal();

  const grid = document.getElementById("projects-grid");
  const featured = document.getElementById("featured-project");

  function bindOpen(root) {
    if (!root || root.dataset.modalBound === "true") return;
    root.dataset.modalBound = "true";
    root.addEventListener("click", function (event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const card = target.closest(".project, .featured-card");
      if (!card || !root.contains(card)) return;
      if (target.closest(".carousel-btn, .carousel-dot")) return;
      const id = card.getAttribute("data-project");
      if (id) openProjectModal(id);
    });
    root.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const card = target.closest(".project, .featured-card");
      if (!card || !root.contains(card)) return;
      event.preventDefault();
      const id = card.getAttribute("data-project");
      if (id) openProjectModal(id);
    });
  }

  bindOpen(grid);
  bindOpen(featured);

  const params = new URLSearchParams(window.location.search);
  const deepId = params.get("project");
  if (deepId && projectsById[deepId]) {
    openProjectModal(deepId, { preserveHash: true });
  }
}
