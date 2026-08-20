import { escapeHtml } from "./projects.js";
import { createViewer } from "./model-viewer.js";

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

function disposeActiveViewer() {
  if (activeViewer && typeof activeViewer.dispose === "function") {
    activeViewer.dispose();
  }
  activeViewer = null;
}

export function closeProjectModal() {
  const modal = document.getElementById("project-modal");
  if (!modal) return;
  disposeActiveViewer();
  modal.setAttribute("hidden", "");
  document.body.classList.remove("modal-open");
}

export function openProjectModal(projectId) {
  const project = projectsById[projectId];
  if (!project) return;

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
    tagsHtml;

  const details = project.details || "";
  const outcomeHtml = (project.outcome || [])
    .map(function (item) {
      return "<li>" + escapeHtml(item) + "</li>";
    })
    .join("");

  bodyEl.innerHTML =
    "<h3>Goal</h3>" +
    '<p class="goal">' + escapeHtml(project.goal) + "</p>" +
    (details
      ? "<h3>Details</h3><p>" + escapeHtml(details) + "</p>"
      : "") +
    "<h3>Outcome</h3>" +
    "<ul>" + outcomeHtml + "</ul>" +
    "<h3>Technical</h3>" +
    "<p>" + escapeHtml(project.technical) + "</p>";

  disposeActiveViewer();
  const modelSrc = modelManifest[projectId];
  if (modelSrc) {
    viewerEl.textContent = "Loading CAD model…";
    activeViewer = createViewer(viewerEl, modelSrc);
  } else {
    viewerEl.textContent =
      "No CAD model linked yet. Add a .glb/.gltf (or .step/.stp) path for \"" +
      projectId +
      "\" in models/manifest.json.";
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
  if (!grid || grid.dataset.modalBound === "true") return;
  grid.dataset.modalBound = "true";

  grid.addEventListener("click", function (event) {
    const card = event.target.closest(".project");
    if (!card || !grid.contains(card)) return;
    // Ignore carousel controls so navigation still works.
    if (event.target.closest(".carousel-btn, .carousel-dot")) return;
    openProjectModal(card.getAttribute("data-project"));
  });

  grid.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest(".project");
    if (!card || !grid.contains(card)) return;
    event.preventDefault();
    openProjectModal(card.getAttribute("data-project"));
  });
}
