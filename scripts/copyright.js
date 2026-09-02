let cachedConfig = null;

const FALLBACK = {
  owner: "Timothy Mitchell",
  copyright: "© 2026 Timothy Mitchell. All rights reserved.",
  notice: "Unauthorized copying, redistribution, or commercial use is prohibited.",
  watermark: "© Timothy Mitchell",
  contact: "https://github.com/TimothyM2005"
};

export async function loadCopyrightConfig() {
  if (cachedConfig) return cachedConfig;
  try {
    const response = await fetch("./data/copyright.json");
    if (response.ok) {
      cachedConfig = Object.assign({}, FALLBACK, await response.json());
      return cachedConfig;
    }
  } catch (err) {
    /* offline or missing file */
  }
  cachedConfig = Object.assign({}, FALLBACK);
  return cachedConfig;
}

export function watermarkText(config) {
  const cfg = config || cachedConfig || FALLBACK;
  return String(cfg.watermark || cfg.owner || FALLBACK.watermark);
}

export function copyrightFooterLines(config) {
  const cfg = config || cachedConfig || FALLBACK;
  const lines = [];
  if (cfg.copyright) lines.push(String(cfg.copyright));
  if (cfg.notice) lines.push(String(cfg.notice));
  return lines;
}

export function applySiteCopyrightFooter(hostId) {
  const host = document.getElementById(hostId);
  if (!host) return;
  loadCopyrightConfig().then(function (cfg) {
    const lines = copyrightFooterLines(cfg);
    if (!lines.length) return;
    host.innerHTML =
      '<p class="site-copyright">' +
      lines.map(function (line) {
        return escapeHtml(line);
      }).join(" · ") +
      ' <a href="data/work-manifest.json" target="_blank" rel="noopener">Work manifest</a></p>';
    host.hidden = false;
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function pdfOverlayHtml(config) {
  const text = watermarkText(config);
  return (
    '<div class="pdf-copyright-overlay" aria-hidden="true">' +
    escapeHtml(text) +
    "</div>"
  );
}
