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

  return {
    id: id,
    title: String(project.title || id).trim(),
    date: String(project.date || "").trim(),
    tags: tags,
    goal: String(project.goal || "").trim(),
    outcome: outcome,
    technical: String(project.technical || "").trim(),
    order: typeof project.order === "number" ? project.order : null
  };
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
    '<article class="project" data-project="' + escapeHtml(project.id) + '">' +
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
