function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeProject(project) {
  if (!project || typeof project !== "object") return null;
  const id = String(project.id || "").trim();
  if (!id) return null;

  const tags = Array.isArray(project.tags)
    ? project.tags
        .map(function (tag) {
          if (!tag) return null;
          if (typeof tag === "string") {
            return { type: "course", label: tag };
          }
          const type = String(tag.type || "course").trim().toLowerCase();
          const label = String(tag.label || "").trim();
          if (!label) return null;
          return { type: type, label: label };
        })
        .filter(Boolean)
    : [];

  const outcome = Array.isArray(project.outcome)
    ? project.outcome.map(function (item) { return String(item || "").trim(); }).filter(Boolean)
    : String(project.outcome || "")
        .split("\n")
        .map(function (line) { return line.trim(); })
        .filter(Boolean);

  const images = Array.isArray(project.images)
    ? project.images.map(function (url) { return String(url || "").trim(); }).filter(Boolean)
    : [];

  const modelUrl = String(project.modelUrl || project.cadUrl || "").trim();

  const documents = Array.isArray(project.documents)
    ? project.documents
        .map(function (doc) {
          if (!doc) return null;
          if (typeof doc === "string") {
            const url = String(doc).trim();
            if (!url) return null;
            const parts = url.split("/");
            return { url: url, name: parts[parts.length - 1] || "document.pdf" };
          }
          const url = String(doc.url || "").trim();
          if (!url) return null;
          const name = String(doc.name || "").trim() || url.split("/").pop() || "document.pdf";
          return { url: url, name: name };
        })
        .filter(Boolean)
    : [];

  const story = Array.isArray(project.story)
    ? project.story.map(function (item) { return String(item || "").trim(); }).filter(Boolean)
    : String(project.story || "")
        .split("\n")
        .map(function (line) { return line.trim(); })
        .filter(Boolean);

  let viewerPreset = null;
  if (project.viewerPreset && typeof project.viewerPreset === "object") {
    viewerPreset = project.viewerPreset;
  }

  return {
    id: id,
    title: String(project.title || id).trim(),
    date: String(project.date || "").trim(),
    tags: tags,
    goal: String(project.goal || "").trim(),
    details: String(project.details || "").trim(),
    story: story,
    outcome: outcome,
    technical: String(project.technical || "").trim(),
    images: images,
    modelUrl: modelUrl,
    documents: documents,
    featured: !!project.featured,
    viewerPreset: viewerPreset,
    order: typeof project.order === "number" ? project.order : null
  };
}

export function buildImageManifest(projects, folderManifest) {
  const merged = Object.assign({}, folderManifest || {});
  (projects || []).forEach(function (project) {
    if (project && project.id && Array.isArray(project.images) && project.images.length) {
      merged[project.id] = project.images.slice();
    }
  });
  return merged;
}

export function buildModelManifest(projects, fileManifest) {
  const merged = Object.assign({}, fileManifest || {});
  (projects || []).forEach(function (project) {
    if (project && project.id && project.modelUrl) {
      merged[project.id] = project.modelUrl;
    }
  });
  return merged;
}

function sortProjects(projects) {
  return projects.slice().sort(function (a, b) {
    const aHas = a.order != null;
    const bHas = b.order != null;
    if (aHas && bHas && a.order !== b.order) {
      return a.order - b.order;
    }
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    return 0;
  });
}

function renderProjectCard(project) {
  const tagsHtml = project.tags
    .map(function (tag) {
      const safeType = escapeHtml(tag.type);
      return '<span class="pill ' + safeType + '">' + escapeHtml(tag.label) + "</span>";
    })
    .join("");

  const outcomeHtml = project.outcome
    .map(function (item) {
      return "<li>" + escapeHtml(item) + "</li>";
    })
    .join("");

  return (
    '<article class="project" data-project="' + escapeHtml(project.id) + '" tabindex="0" role="button" aria-label="Open details for ' + escapeHtml(project.title) + '">' +
      '<div class="project-carousel" data-project="' + escapeHtml(project.id) + '" role="region" aria-label="Project images"></div>' +
      '<div class="project-body">' +
        '<div class="project-header">' +
          '<span class="project-title">' + escapeHtml(project.title) + "</span>" +
          '<div class="project-meta">' +
            (project.date ? '<span class="pill date">' + escapeHtml(project.date) + "</span>" : "") +
            tagsHtml +
          "</div>" +
        "</div>" +
        "<h3>Goal</h3>" +
        '<p class="goal">' + escapeHtml(project.goal) + "</p>" +
        "<h3>Outcome</h3>" +
        "<ul>" + outcomeHtml + "</ul>" +
        "<h3>Technical</h3>" +
        "<p>" + escapeHtml(project.technical) + "</p>" +
        '<p class="project-open-hint">Click for details &amp; CAD viewer</p>' +
      "</div>" +
    "</article>"
  );
}

export function renderProjects(projects, container) {
  if (!container) return [];
  const normalized = (projects || []).map(normalizeProject).filter(Boolean);
  const sorted = sortProjects(normalized);
  container.innerHTML = sorted.map(renderProjectCard).join("");
  return sorted;
}

export { normalizeProject, sortProjects, escapeHtml };
