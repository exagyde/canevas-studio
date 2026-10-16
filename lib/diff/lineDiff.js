// Comparaison ligne à ligne de deux textes (algorithme de Myers), pour afficher les modifications du YAML.

// au-delà, les textes sont jugés entièrement différents (mémoire ~ MAX_EDITS²)
const MAX_EDITS = 2000;

/**
 * @returns {Array<{ type: 'eq'|'del'|'add', text: string, a: number|null, b: number|null }>}
 *  a / b : numéros de ligne (1-based) dans l'ancien / le nouveau texte
 */
export function diffLines(before, after) {
  const a = splitLines(before);
  const b = splitLines(after);
  // préfixe et suffixe communs (cas le plus fréquent : quelques lignes modifiées)
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const ops = [];
  for (let i = 0; i < start; i++) ops.push({ type: 'eq', text: a[i], a: i + 1, b: i + 1 });
  const mid = myers(a.slice(start, endA), b.slice(start, endB));
  for (const op of mid) ops.push({ ...op, a: op.a === null ? null : op.a + start, b: op.b === null ? null : op.b + start });
  for (let i = 0; i < a.length - endA; i++) ops.push({ type: 'eq', text: a[endA + i], a: endA + i + 1, b: endB + i + 1 });
  return ops;
}

function splitLines(text) {
  const t = String(text ?? '').replace(/\r\n/g, '\n');
  if (!t) return [];
  return (t.endsWith('\n') ? t.slice(0, -1) : t).split('\n');
}

/** Plus courte suite de suppressions / ajouts (indices 1-based relatifs aux tableaux fournis) */
function myers(a, b) {
  const N = a.length;
  const M = b.length;
  if (!N && !M) return [];
  if (!N) return b.map((text, j) => ({ type: 'add', text, a: null, b: j + 1 }));
  if (!M) return a.map((text, i) => ({ type: 'del', text, a: i + 1, b: null }));
  const max = Math.min(N + M, MAX_EDITS);
  const off = max + 1;
  const V = new Int32Array(2 * max + 3);
  const trace = [];
  let found = -1;
  for (let d = 0; d <= max && found < 0; d++) {
    trace.push({ base: off - d - 1, v: V.slice(off - d - 1, off + d + 2) });
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && V[off + k - 1] < V[off + k + 1]) ? V[off + k + 1] : V[off + k - 1] + 1;
      let y = x - k;
      while (x < N && y < M && a[x] === b[y]) {
        x++;
        y++;
      }
      V[off + k] = x;
      if (x >= N && y >= M) {
        found = d;
        break;
      }
    }
  }
  // textes trop différents : tout l'ancien est supprimé, tout le nouveau ajouté
  if (found < 0) return [...a.map((text, i) => ({ type: 'del', text, a: i + 1, b: null })), ...b.map((text, j) => ({ type: 'add', text, a: null, b: j + 1 }))];

  const out = [];
  let x = N;
  let y = M;
  for (let d = found; d > 0; d--) {
    const { base, v } = trace[d];
    const at = (kk) => v[off + kk - base];
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      out.push({ type: 'eq', text: a[x - 1], a: x, b: y });
      x--;
      y--;
    }
    if (x === prevX) out.push({ type: 'add', text: b[y - 1], a: null, b: y });
    else out.push({ type: 'del', text: a[x - 1], a: x, b: null });
    x = prevX;
    y = prevY;
  }
  while (x > 0 && y > 0) {
    out.push({ type: 'eq', text: a[x - 1], a: x, b: y });
    x--;
    y--;
  }
  return out.reverse();
}

export function diffStats(ops) {
  let added = 0;
  let removed = 0;
  for (const op of ops) {
    if (op.type === 'add') added++;
    else if (op.type === 'del') removed++;
  }
  return { added, removed, changed: added + removed > 0 };
}

/**
 * Regroupe les lignes en blocs affichables : les longues séries de lignes identiques
 * sont repliées en { type: 'skip', count, ops } (contexte de `context` lignes autour des changements).
 */
export function foldDiff(ops, context = 3) {
  const rows = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i].type !== 'eq') {
      rows.push(ops[i++]);
      continue;
    }
    let j = i;
    while (j < ops.length && ops[j].type === 'eq') j++;
    const run = ops.slice(i, j);
    const head = i === 0 ? 0 : context;
    const tail = j === ops.length ? 0 : context;
    if (run.length > head + tail + 1) {
      rows.push(...run.slice(0, head));
      rows.push({ type: 'skip', count: run.length - head - tail, ops: run.slice(head, run.length - tail) });
      rows.push(...run.slice(run.length - tail));
    } else rows.push(...run);
    i = j;
  }
  return rows;
}
