// Import / export de projets : fichiers YAML, archives ZIP.
import JSZip from 'jszip';
import { parsePaYaml } from '../pa/yaml.js';
import { createProject, mergeParsed, screenYaml, appYaml, componentsYaml, safeFileName, projectMeta } from './model.js';
import { t } from '../i18n/index.js';

export const PROJECT_JSON = 'canevas-project.json';

/**
 * Lit une liste de fichiers (File / {name, text}) : .yml, .yaml, .zip, canevas-project.json
 * @returns {Promise<{ entries: Array<{name, text}>, meta: object|null }>}
 */
export async function readInputFiles(files) {
  const entries = [];
  let meta = null;
  for (const f of files) {
    const name = f.name || t('project.defaultInputFileName');
    if (/\.zip$/i.test(name) || /\.msapp$/i.test(name)) {
      const zip = await JSZip.loadAsync(f.arrayBuffer ? await f.arrayBuffer() : f.data);
      const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir && !/(^|\/)__MACOSX\//.test(n) && !/(^|\/)\./.test(n.split('/').pop()));
      names.sort();
      for (const n of names) {
        const base = n.split('/').pop();
        if (base === PROJECT_JSON) {
          try {
            meta = JSON.parse(await zip.files[n].async('string'));
          } catch {
            /* méta illisible */
          }
          continue;
        }
        if (/\.(ya?ml)$/i.test(n)) entries.push({ name: n, text: await zip.files[n].async('string') });
      }
      continue;
    }
    const text = f.text ? (typeof f.text === 'function' ? await f.text() : f.text) : '';
    if (name === PROJECT_JSON) {
      try {
        meta = JSON.parse(text);
      } catch {
        /* ignore */
      }
      continue;
    }
    entries.push({ name, text });
  }
  return { entries, meta };
}

/** Ordre de tri : App, écrans, composants (pour un import déterministe) */
function entryRank(e) {
  if (/(^|\/)App\.pa\.ya?ml$/i.test(e.name)) return 0;
  if (/component/i.test(e.name)) return 2;
  return 1;
}

/**
 * Construit ou complète un projet à partir de fichiers YAML.
 * @returns {{ project, report: Array<{file, ok, message, screens: string[]}> }}
 */
export function importEntries(project, entries, meta, { mode = 'replace' } = {}) {
  let p = project || createProject(t('project.importedName'), { screens: [] });
  if (meta && !project) {
    p = { ...p, ...meta, id: p.id, screens: p.screens, components: p.components, app: p.app };
  } else if (meta) {
    p = { ...p, dataSources: meta.dataSources || p.dataSources, flows: meta.flows || p.flows, settings: { ...p.settings, ...(meta.settings || {}) } };
  }
  const report = [];
  const sorted = [...entries].sort((a, b) => entryRank(a) - entryRank(b));
  for (const e of sorted) {
    const parsed = parsePaYaml(e.text);
    if (parsed.errors.length) {
      report.push({ file: e.name, ok: false, message: parsed.errors.map((x) => `L${x.line}:${x.col} ${x.message}`).join(' ; '), screens: [] });
      continue;
    }
    if (parsed.kind === 'controls') {
      report.push({ file: e.name, ok: false, message: t('project.controlsWithoutScreen'), screens: [] });
      continue;
    }
    if (!parsed.screens.length && !parsed.app && !parsed.components.length) {
      report.push({ file: e.name, ok: false, message: t('project.nothingFound'), screens: [] });
      continue;
    }
    const base = e.name.split('/').pop();
    const r = mergeParsed(p, parsed, { mode, fileName: base });
    p = r.project;
    const parts = [];
    if (r.added.length) parts.push(t('project.screensCount', { count: r.added.length }));
    if (parsed.app) parts.push('App');
    if (parsed.components.length) parts.push(t('project.componentsCount', { count: parsed.components.length }));
    report.push({ file: e.name, ok: true, message: t('project.imported', { items: parts.join(', ') }), screens: r.added.map((s) => s.name), warnings: parsed.warnings });
  }
  if (!p.screens.length) p = { ...p, screens: [] };
  return { project: p, report };
}

/** Archive ZIP du projet : un YAML par écran + App + composants + métadonnées */
export async function exportProjectZip(project, { includeMeta = true } = {}) {
  const zip = new JSZip();
  const used = new Set();
  for (const s of project.screens) {
    let fname = project.files?.[s.name] || `${safeFileName(s.name)}.pa.yaml`;
    if (used.has(fname)) fname = `${safeFileName(s.name)}_${used.size}.pa.yaml`;
    used.add(fname);
    zip.file(`Screens/${fname}`, screenYaml(s));
  }
  if (project.app && Object.keys(project.app.properties || {}).length) zip.file('App.pa.yaml', appYaml(project.app));
  if (project.components?.length) zip.file('Components/Components.pa.yaml', componentsYaml(project.components));
  if (includeMeta) {
    const meta = projectMeta(project);
    zip.file(PROJECT_JSON, JSON.stringify({ ...meta, chat: undefined }, null, 2));
  }
  return zip.generateAsync({ type: 'blob' });
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadText(text, fileName, type = 'text/yaml') {
  downloadBlob(new Blob([text], { type: `${type};charset=utf-8` }), fileName);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // repli : zone de texte temporaire
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}
