import { escapeHtml } from "./projects.js?v=feat10";
import { detectLocalAdmin, saveProject } from "./projects-store.js?v=feat10";

let activeViewer = null;
let modelManifest = {};
let projectsById = {};

function ensureModal() {
  let modal = document.getElementById("project-modal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "project-modal";
  modal.className = "project-modal";
  modal.setAttribute("hidden", "");
  modal.innerHTML =
    '<div class="project-modal-backdrop" data-close="true"></div>' +
    '<div class="project-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="project-modal-title">' +
      '<button type="button" class="project-modal-close" data-close="true" aria-label="Close">&times;</button>' +
      '<div class="project-modal-layout">' +
        '<div class="project-modal-viewer-wrap">' +
          '<div id="project-modal-viewer" class="project-modal-viewer">No CAD model for this project yet.</div>' +
          '<div id="project-modal-downloads" class="project-modal-downloads" hidden></div>' +
          '<p class="project-modal-hint">Drag to orbit · Scroll to zoom · Screenshot / copy view in the viewer toolbar</p>' +
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

function disposeActiveViewer() {
  if (activeViewer && typeof activeViewer.dispose === "function") {
    activeViewer.dispose();
  }
  activeViewer = null;
}

function fileNameFromUrl(url) {
  const clean = String(url || "").split("?")[0].split("#")[0];
  const parts = clean.split("/");
  return parts[parts.length - 1] || "download";
}

function renderDownloads(project, modelSrc) {
  const wrap = document.getElementById("project-modal-downloads");
  if (!wrap) return;
  const links = [];
  if (modelSrc) {
    links.push(
      '<a class="project-download-link" href="' +
        escapeHtml(modelSrc) +
        '" download="' +
        escapeHtml(fileNameFromUrl(modelSrc)) +
        '">Download CAD</a>'
    );
  }
  (project.documents || []).forEach(function (doc) {
    if (!doc || !doc.url) return;
    links.push(
      '<a class="project-download-link" href="' +
        escapeHtml(doc.url) +
        '" download="' +
        escapeHtml(doc.name || fileNameFromUrl(doc.url)) +
        '" target="_blank" rel="noopener">Download ' +
        escapeHtml(doc.name || "PDF") +
        "</a>"
    );
  });
  if (!links.length) {
    wrap.hidden = true;
    wrap.innerHTML = "";
    return;
  }
  wrap.hidden = false;
  wrap.innerHTML = links.join("");
}

function parseHashViewState() {
  const hash = window.location.hash || "";
  if (hash.indexOf("view=") === -1) return null;
  return hash;
}

export function closeProjectModal() {
  const modal = document.getElementById("project-modal");
  if (!modal) return;
  disposeActiveViewer();
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
  const project = projectsById[projectId];
  if (!project) return;
  const opts = options || {};

  const modal = ensureModal();
  const titleEl = document.getElementById("project-modal-title");
  const metaEl = document.getElementById("project-modal-meta");
  const bodyEl = document.getElementById("project-modal-body");
  const viewerEl = document.getElementById("project-modal-viewer");

  titleEl.textContent = project.title;

  const tagsHtml = (project.tags || [])
    .map(function (tag) {
      return '<span class="pill ' + escapeHtml(tag.type) + '">' + escapeHtml(tag.label) + "</span>";
    })
    .join("");

  metaEl.innerHTML =
    (project.date ? '<span class="pill date">' + escapeHtml(project.date) + "</span>" : "") +
    tagsHtml +
    (project.featured ? '<span class="pill featured">Featured</span>' : "");

  const details = project.details || "";
  const story = project.story || [];
  const storyHtml = story.length
    ? "<h3>Design story</h3><ul class=\"project-story\">" +
      story.map(function (item) { return "<li>" + escapeHtml(item) + "</li>"; }).join("") +
      "</ul>"
    : "";

  const outcomeHtml = (project.outcome || [])
    .map(function (item) {
      return "<li>" + escapeHtml(item) + "</li>";
    })
    .join("");

  const documents = Array.isArray(project.documents) ? project.documents : [];
  const documentsHtml = documents.length
    ? "<h3>Documents</h3>" +
      documents
        .map(function (doc) {
          const url = escapeHtml(doc.url || "");
          const name = escapeHtml(doc.name || "document.pdf");
          return (
            '<div class="project-modal-document">' +
              '<div class="project-modal-document-header">' +
                "<strong>" + name + "</strong>" +
                '<a href="' + url + '" target="_blank" rel="noopener">Open PDF</a>' +
              "</div>" +
              '<iframe class="project-modal-pdf" src="' + url + '#view=FitH" title="' + name + '" loading="lazy"></iframe>' +
            "</div>"
          );
        })
        .join("")
    : "";

  bodyEl.innerHTML =
    "<h3>Goal</h3>" +
    '<p class="goal">' + escapeHtml(project.goal) + "</p>" +
    storyHtml +
    (details ? "<h3>Details</h3><p>" + escapeHtml(details) + "</p>" : "") +
    documentsHtml +
    "<h3>Outcome</h3>" +
    "<ul>" + outcomeHtml + "</ul>" +
    "<h3>Technical</h3>" +
    "<p>" + escapeHtml(project.technical) + "</p>" +
    '<div id="project-modal-save-preset" class="project-modal-save-preset" hidden></div>';

  disposeActiveViewer();
  const modelSrc = modelManifest[projectId] || project.modelUrl || "";
  renderDownloads(project, modelSrc);

  if (window.history && window.history.replaceState) {
    const url = new URL(window.location.href);
    url.searchParams.set("project", projectId);
    window.history.replaceState({}, "", url.pathname + url.search + (opts.preserveHash ? window.location.hash : ""));
  }

  if (modelSrc) {
    viewerEl.textContent = "Loading CAD model…";
    import("./model-viewer.js?v=cadui6")
      .then(function (mod) {
        if (modal.hasAttribute("hidden")) return;
        const viewState = opts.viewState || (mod.decodeViewState ? mod.decodeViewState(parseHashViewState() || "") : null);
        activeViewer = mod.createViewer(viewerEl, modelSrc, {
          projectId: projectId,
          preset: project.viewerPreset || null,
          viewState: viewState
        });

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
      })
      .catch(function (err) {
        console.warn("3D viewer failed to load.", err);
        if (!modal.hasAttribute("hidden")) {
          viewerEl.textContent = "Unable to load 3D viewer. Check your network connection.";
        }
      });
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
