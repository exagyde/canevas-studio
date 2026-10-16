// Lexer Power Fx (syntaxe invariante en-US : "," séparateur d'arguments, ";" chaînage).
import { t } from '../i18n/index.js';

export const TK = {
  NUM: 'num',
  STR: 'str',
  INTERP: 'interp',
  IDENT: 'ident',
  QIDENT: 'qident',
  OP: 'op',
  KW: 'kw',
  COMMENT: 'comment',
  WS: 'ws',
  ERR: 'err',
  EOF: 'eof',
};

const KEYWORDS = new Set(['And', 'Or', 'Not', 'in', 'exactin', 'As', 'true', 'false']);

const ID_START = /[\p{L}_]/u;
const ID_PART = /[\p{L}\p{N}\p{Mn}\p{Mc}\p{Pc}\p{Cf}_]/u;

const OPERATORS = [
  '<=', '>=', '<>', '&&', '||',
  '=', '<', '>', '+', '-', '*', '/', '^', '%', '&', '!', '.', '@', ',', ';', ':', '(', ')', '[', ']', '{', '}',
];

export class FxSyntaxError extends Error {
  constructor(message, start, end) {
    super(message);
    this.start = start;
    this.end = end ?? start + 1;
  }
}

/**
 * Découpe une formule en jetons.
 * @param {string} src texte de la formule (sans le "=" initial)
 * @param {object} opts { keepTrivia: bool, offset: number }
 */
export function tokenize(src, opts = {}) {
  const { keepTrivia = false, offset = 0 } = opts;
  const tokens = [];
  let i = 0;
  const n = src.length;
  const push = (type, start, end, extra) => {
    tokens.push({ type, start: start + offset, end: end + offset, text: src.slice(start, end), ...extra });
  };
  const prevSignificant = () => {
    for (let k = tokens.length - 1; k >= 0; k--) {
      const t = tokens[k];
      if (t.type !== TK.WS && t.type !== TK.COMMENT) return t;
    }
    return null;
  };

  while (i < n) {
    const c = src[i];
    const start = i;

    // Espaces
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === ' ') {
      while (i < n && /[ \t\n\r ]/.test(src[i])) i++;
      if (keepTrivia) push(TK.WS, start, i);
      continue;
    }

    // Commentaires
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      if (keepTrivia) push(TK.COMMENT, start, i);
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const close = src.indexOf('*/', i + 2);
      if (close < 0) {
        i = n;
        if (keepTrivia) push(TK.COMMENT, start, i);
        else push(TK.ERR, start, i, { message: t('fx.unterminatedComment') });
        continue;
      }
      i = close + 2;
      if (keepTrivia) push(TK.COMMENT, start, i);
      continue;
    }

    // Chaîne interpolée $"..."
    if (c === '$' && src[i + 1] === '"') {
      const res = scanInterpolated(src, i);
      if (res.error) {
        i = res.end;
        push(TK.ERR, start, i, { message: res.error });
        continue;
      }
      i = res.end;
      push(TK.INTERP, start, i, { parts: res.parts.map((p) => (typeof p === 'string' ? p : { src: p.src, offset: p.offset + offset })) });
      continue;
    }

    // Chaîne
    if (c === '"') {
      i++;
      let value = '';
      let closed = false;
      while (i < n) {
        if (src[i] === '"') {
          if (src[i + 1] === '"') {
            value += '"';
            i += 2;
            continue;
          }
          i++;
          closed = true;
          break;
        }
        value += src[i];
        i++;
      }
      if (!closed) push(TK.ERR, start, i, { message: t('fx.unterminatedString'), value });
      else push(TK.STR, start, i, { value });
      continue;
    }

    // Identificateur entre apostrophes
    if (c === "'") {
      i++;
      let value = '';
      let closed = false;
      while (i < n) {
        if (src[i] === "'") {
          if (src[i + 1] === "'") {
            value += "'";
            i += 2;
            continue;
          }
          i++;
          closed = true;
          break;
        }
        if (src[i] === '\n') break;
        value += src[i];
        i++;
      }
      if (!closed) push(TK.ERR, start, i, { message: t('fx.unterminatedIdentifier'), value });
      else push(TK.QIDENT, start, i, { value });
      continue;
    }

    const prev = prevSignificant();
    const afterOperand = prev && (prev.type === TK.IDENT || prev.type === TK.QIDENT || prev.type === TK.NUM || prev.type === TK.STR || (prev.type === TK.OP && (prev.text === ')' || prev.text === ']' || prev.text === '}' || prev.text === '%')));

    // Espace réservé de modèle de carte : %DATACARD_FIELD_NAME.ID%
    if (c === '%' && !afterOperand) {
      const m = /^%[A-Za-z_][\w.]*%/.exec(src.slice(i));
      if (m) {
        i += m[0].length;
        push(TK.IDENT, start, i, { value: m[0], placeholder: true });
        continue;
      }
    }

    // Nombre
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || '') && !afterOperand)) {
      const m = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
      i += m[0].length;
      push(TK.NUM, start, i, { value: parseFloat(m[0]) });
      continue;
    }

    // Identificateur
    if (ID_START.test(c)) {
      i++;
      while (i < n && ID_PART.test(src[i])) i++;
      const text = src.slice(start, i);
      if (KEYWORDS.has(text)) push(TK.KW, start, i, { value: text });
      else push(TK.IDENT, start, i, { value: text });
      continue;
    }

    // Opérateurs
    let matched = null;
    for (const op of OPERATORS) {
      if (src.startsWith(op, i)) {
        matched = op;
        break;
      }
    }
    if (matched) {
      i += matched.length;
      push(TK.OP, start, i, { value: matched });
      continue;
    }

    i++;
    push(TK.ERR, start, i, { message: t('fx.unexpectedChar', { char: c }) });
  }
  tokens.push({ type: TK.EOF, start: n + offset, end: n + offset, text: '' });
  return tokens;
}

// Analyse une chaîne interpolée $"texte {expr} texte"
function scanInterpolated(src, i) {
  const parts = [];
  let j = i + 2;
  let lit = '';
  const n = src.length;
  while (j < n) {
    const ch = src[j];
    if (ch === '"') {
      if (src[j + 1] === '"') {
        lit += '"';
        j += 2;
        continue;
      }
      if (lit) parts.push(lit);
      return { parts, end: j + 1 };
    }
    if (ch === '{') {
      if (src[j + 1] === '{') {
        lit += '{';
        j += 2;
        continue;
      }
      if (lit) parts.push(lit);
      lit = '';
      // cherche l'accolade fermante correspondante
      let depth = 1;
      let k = j + 1;
      while (k < n && depth > 0) {
        const c2 = src[k];
        if (c2 === '"') {
          k++;
          while (k < n && !(src[k] === '"' && src[k + 1] !== '"')) k += src[k] === '"' ? 2 : 1;
          k++;
          continue;
        }
        if (c2 === "'") {
          k++;
          while (k < n && src[k] !== "'") k++;
          k++;
          continue;
        }
        if (c2 === '{') depth++;
        else if (c2 === '}') depth--;
        if (depth === 0) break;
        k++;
      }
      if (depth !== 0) return { error: t('fx.unterminatedInterpolation'), end: n };
      parts.push({ src: src.slice(j + 1, k), offset: j + 1 });
      j = k + 1;
      continue;
    }
    if (ch === '}' && src[j + 1] === '}') {
      lit += '}';
      j += 2;
      continue;
    }
    lit += ch;
    j++;
  }
  return { error: t('fx.unterminatedInterpolatedString'), end: n };
}

/** Retourne le texte de la formule sans le "=" initial et le décalage correspondant. */
export function stripEquals(formula) {
  if (typeof formula !== 'string') return { body: String(formula ?? ''), offset: 0, hasEquals: false };
  if (formula.startsWith('=')) return { body: formula.slice(1), offset: 1, hasEquals: true };
  return { body: formula, offset: 0, hasEquals: false };
}
