// Repérage des contrôles dans le texte YAML (lien entre le rendu et l'éditeur).
// Un contrôle commence par une ligne « - Nom: » ; son bloc s'arrête à la première ligne moins indentée.

const ITEM_RE = /^(\s*)-\s+(?:'((?:[^']|'')*)'|"((?:[^"\\]|\\.)*)"|([^'"#][^#]*?)):\s*$/;

function itemAt(line) {
  const m = ITEM_RE.exec(line);
  if (!m) return null;
  const name = m[2] !== undefined ? m[2].replace(/''/g, "'") : m[3] !== undefined ? m[3] : m[4].trim();
  return { indent: m[1].length, name };
}

const indentOf = (line) => line.length - line.trimStart().length;

/** Lignes (1-based, incluses) du bloc d'un contrôle, ou null */
export function findControlBlock(text, name) {
  const lines = String(text || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const it = itemAt(lines[i]);
    if (!it || it.name !== name) continue;
    let end = i;
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j].trim()) continue;
      if (indentOf(lines[j]) <= it.indent) break;
      end = j;
    }
    return { from: i + 1, to: end + 1 };
  }
  return null;
}

/** Ligne d'une propriété dans le bloc d'un contrôle (ou de l'écran si name est null) */
export function findPropertyLine(text, name, prop) {
  const lines = String(text || '').split('\n');
  const block = name ? findControlBlock(text, name) : { from: 1, to: lines.length };
  if (!block) return null;
  let propsIndent = -1;
  for (let i = block.from - 1; i < block.to; i++) {
    const l = lines[i];
    if (/^\s*Properties:\s*$/.test(l)) {
      // premier Properties du bloc (celui du contrôle, pas d'un enfant)
      if (propsIndent < 0) propsIndent = indentOf(l);
      continue;
    }
    if (propsIndent >= 0 && indentOf(l) === propsIndent + 2 && l.trimStart().startsWith(`${prop}:`)) return i + 1;
    if (propsIndent >= 0 && l.trim() && indentOf(l) <= propsIndent && !/^\s*Properties:/.test(l)) break;
  }
  return null;
}

/** Nom du contrôle qui contient la ligne donnée (1-based), ou null */
export function controlAtLine(text, lineNo) {
  const lines = String(text || '').split('\n');
  let limit = Infinity;
  for (let i = Math.min(lineNo, lines.length) - 1; i >= 0; i--) {
    const l = lines[i];
    if (!l.trim()) continue;
    const ind = indentOf(l);
    const it = itemAt(l);
    if (it && it.indent < limit) return it.name;
    limit = Math.min(limit, ind);
    if (ind === 0) break;
  }
  return null;
}
