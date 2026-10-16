// Mesure de texte (hauteur automatique des étiquettes).
let ctx2d = null;

function getCtx() {
  if (ctx2d) return ctx2d;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  ctx2d = c.getContext('2d');
  return ctx2d;
}

const cache = new Map();

/**
 * Hauteur (px) d'un texte rendu dans une largeur donnée.
 * @param {string} text
 * @param {{ fontFamily: string, fontSizePx: number, fontWeight: number|string, lineHeight: number, width: number, wrap: boolean }} o
 */
export function measureTextHeight(text, o) {
  const key = `${o.fontFamily}|${o.fontSizePx}|${o.fontWeight}|${o.lineHeight}|${Math.round(o.width)}|${o.wrap}|${text}`;
  if (cache.has(key)) return cache.get(key);
  const lh = o.fontSizePx * (o.lineHeight || 1.2);
  const ctx = getCtx();
  let lines = 0;
  const paragraphs = String(text ?? '').split('\n');
  if (!ctx) {
    const charW = o.fontSizePx * 0.55;
    for (const p of paragraphs) lines += o.wrap ? Math.max(1, Math.ceil((p.length * charW) / Math.max(1, o.width))) : 1;
  } else {
    ctx.font = `${o.fontWeight || 400} ${o.fontSizePx}px ${o.fontFamily}`;
    for (const p of paragraphs) {
      if (!o.wrap) {
        lines += 1;
        continue;
      }
      const words = p.split(/(\s+)/);
      let cur = '';
      let n = 1;
      for (const w of words) {
        const test = cur + w;
        if (ctx.measureText(test).width > o.width && cur.trim() !== '') {
          n++;
          cur = w.trimStart();
        } else cur = test;
      }
      lines += n;
    }
  }
  const h = Math.ceil(Math.max(1, lines) * lh);
  if (cache.size > 5000) cache.clear();
  cache.set(key, h);
  return h;
}
