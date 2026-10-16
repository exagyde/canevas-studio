// Diagnostics positionnés sur le texte YAML (vue code).
import { parsePaYaml } from '../pa/yaml.js';
import { validateProject } from './validate.js';
import { t } from '../i18n/index.js';

function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return starts;
}

/**
 * @param {string} text YAML
 * @param {object} project projet courant (pour le contexte de validation)
 * @param {'screen'|'app'|'components'} scope
 * @param {string} screenId écran remplacé par le contenu du texte
 * @returns {{ parsed, diagnostics: Array<{from, to, severity, message}>, issues }}
 */
export function yamlDiagnostics(text, project, scope, screenId) {
  const parsed = parsePaYaml(text);
  const starts = lineStarts(text);
  const posAt = (line, col) => {
    const ls = starts[Math.max(0, Math.min(starts.length - 1, (line || 1) - 1))];
    return Math.min(text.length, ls + Math.max(0, (col || 1) - 1));
  };
  const lineEnd = (pos) => {
    const i = text.indexOf('\n', pos);
    return i < 0 ? text.length : i;
  };
  const diagnostics = [];
  for (const e of parsed.errors) {
    const from = e.offset ?? posAt(e.line, e.col);
    diagnostics.push({ from, to: Math.max(from + 1, Math.min(text.length, e.endOffset ?? lineEnd(from))), severity: 'error', message: e.message });
  }
  for (const w of parsed.warnings) {
    const from = posAt(w.line, w.col);
    diagnostics.push({ from, to: lineEnd(from), severity: 'warning', message: w.message });
  }
  if (parsed.errors.length) return { parsed, diagnostics, issues: [] };

  // Projet temporaire pour valider dans le contexte
  let temp = project;
  if (scope === 'screen') {
    const others = project.screens.filter((s) => s._id !== screenId);
    temp = { ...project, screens: [...parsed.screens, ...others] };
    if (parsed.kind !== 'screens' && parsed.kind !== 'empty') {
      diagnostics.push({ from: 0, to: lineEnd(0), severity: 'error', message: t('validation.screenViewExpectsScreens') });
    } else if (parsed.screens.length !== 1) {
      diagnostics.push({ from: 0, to: lineEnd(0), severity: parsed.screens.length ? 'warning' : 'error', message: t('validation.screenViewCount', { count: parsed.screens.length }) });
    }
  } else if (scope === 'app') {
    temp = { ...project, app: parsed.app || project.app };
  } else if (scope === 'components') {
    temp = { ...project, components: parsed.components };
  }
  const issues = validateProject(temp, { sort: false });
  const ownIds = new Set();
  for (const obj of parsed.positions.keys()) if (obj._id) ownIds.add(obj._id);
  const byId = new Map();
  for (const obj of parsed.positions.keys()) byId.set(obj._id, obj);

  for (const is of issues) {
    if (!ownIds.has(is.nodeId)) continue;
    const obj = byId.get(is.nodeId);
    const pos = parsed.positions.get(obj);
    if (!pos) continue;
    let from = posAt(pos.line, pos.col);
    let to = lineEnd(from);
    if (is.property && pos.props[is.property]) {
      const pp = pos.props[is.property];
      from = posAt(pp.line, pp.col);
      to = lineEnd(from);
      if (is.start !== undefined) {
        const formula = obj.properties?.[is.property] ?? '';
        if (pp.block) {
          const before = formula.slice(0, is.start);
          const k = before.split('\n').length - 1;
          const col = before.length - before.lastIndexOf('\n') - 1;
          from = posAt(pp.contentLine + k, (pp.contentIndent || 0) + col + 1);
        } else if (pp.scalarType === 'PLAIN') {
          from = posAt(pp.valueLine, pp.valueCol + is.start);
        }
        const len = Math.max(1, (is.end ?? is.start + 1) - is.start);
        to = Math.min(lineEnd(from), from + len);
        if (to <= from) to = Math.min(text.length, from + 1);
      }
    }
    diagnostics.push({ from, to, severity: is.severity === 'info' ? 'info' : is.severity, message: is.message });
  }
  return { parsed, diagnostics, issues: issues.filter((i) => ownIds.has(i.nodeId)) };
}
