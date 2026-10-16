'use client';
// Affichage d'une comparaison de textes (YAML, formule) : lignes supprimées / ajoutées, contexte replié.
import { useEffect, useMemo, useState } from 'react';
import { diffLines, diffStats, foldDiff } from '@/lib/diff/lineDiff';
import { useI18n } from '@/components/common/i18n';

export function computeDiff(before, after) {
  const ops = diffLines(before, after);
  return { ops, stats: diffStats(ops) };
}

export function DiffStats({ stats }) {
  const { t } = useI18n();
  return (
    <span className="diff-stats" title={`${t('studio.linesAdded', { count: stats.added })}, ${t('studio.linesRemoved', { count: stats.removed })}`}>
      <span className="add">+{stats.added}</span> <span className="del">−{stats.removed}</span>
    </span>
  );
}

/** Partie différente entre deux lignes appariées (préfixe et suffixe communs exclus) */
function changedRange(text, other) {
  let s = 0;
  while (s < text.length && s < other.length && text[s] === other[s]) s++;
  let e = 0;
  while (e < text.length - s && e < other.length - s && text[text.length - 1 - e] === other[other.length - 1 - e]) e++;
  return s === 0 && e === 0 ? null : [s, text.length - e];
}

/** Associe les suppressions suivies d'ajouts de même longueur (ligne modifiée) */
function withHighlights(rows) {
  const out = rows.map((r) => ({ ...r }));
  for (let i = 0; i < out.length; ) {
    if (out[i].type !== 'del') {
      i++;
      continue;
    }
    let j = i;
    while (j < out.length && out[j].type === 'del') j++;
    let k = j;
    while (k < out.length && out[k].type === 'add') k++;
    if (k - j === j - i) {
      for (let n = 0; n < j - i; n++) {
        out[i + n].hl = changedRange(out[i + n].text, out[j + n].text);
        out[j + n].hl = changedRange(out[j + n].text, out[i + n].text);
      }
    }
    i = Math.max(k, i + 1);
  }
  return out;
}

export default function DiffView({ before, after, ops: given, context = 3, emptyText, maxHeight }) {
  const { t } = useI18n();
  const ops = useMemo(() => given || diffLines(before, after), [given, before, after]);
  const rows = useMemo(() => withHighlights(foldDiff(ops, context)), [ops, context]);
  const [opened, setOpened] = useState(() => new Set());
  useEffect(() => setOpened(new Set()), [rows]);
  if (!diffStats(ops).changed) return <div className="diff-empty">{emptyText ?? t('studio.noChanges')}</div>;
  return (
    <div className="diff" style={maxHeight ? { maxHeight } : undefined}>
      {rows.map((r, i) =>
        r.type === 'skip' ? (
          opened.has(i) ? (
            r.ops.map((o, j) => <Row key={`${i}-${j}`} op={o} />)
          ) : (
            <button key={i} type="button" className="diff-skip" onClick={() => setOpened((cur) => new Set(cur).add(i))}>
              {t('studio.unchangedLines', { count: r.count })}
            </button>
          )
        ) : (
          <Row key={i} op={r} />
        ),
      )}
    </div>
  );
}

function Row({ op }) {
  const sign = op.type === 'add' ? '+' : op.type === 'del' ? '−' : '';
  const text = op.text || ' ';
  return (
    <div className={`diff-row ${op.type}`}>
      <span className="diff-no">{op.a ?? ''}</span>
      <span className="diff-no">{op.b ?? ''}</span>
      <span className="diff-sign">{sign}</span>
      <span className="diff-text">
        {op.hl ? (
          <>
            {text.slice(0, op.hl[0])}
            <mark>{text.slice(op.hl[0], op.hl[1])}</mark>
            {text.slice(op.hl[1])}
          </>
        ) : (
          text
        )}
      </span>
    </div>
  );
}
