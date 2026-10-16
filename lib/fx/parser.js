// Parseur Power Fx (Pratt) produisant un AST simple.
import { tokenize, TK, FxSyntaxError, stripEquals } from './lexer.js';
import { t, onLocaleChange } from '../i18n/index.js';

// Précédences (de la plus faible à la plus forte)
const PREC = {
  As: 1,
  Or: 2,
  And: 3,
  In: 4,
  Compare: 5,
  Concat: 6,
  Add: 7,
  Mul: 8,
  Power: 9,
  Prefix: 10,
  Postfix: 11,
};

function binaryInfo(tok) {
  if (tok.type === TK.OP) {
    switch (tok.value) {
      case '||':
        return { op: 'Or', prec: PREC.Or };
      case '&&':
        return { op: 'And', prec: PREC.And };
      case '=':
      case '<>':
      case '<':
      case '>':
      case '<=':
      case '>=':
        return { op: tok.value, prec: PREC.Compare };
      case '&':
        return { op: '&', prec: PREC.Concat };
      case '+':
      case '-':
        return { op: tok.value, prec: PREC.Add };
      case '*':
      case '/':
        return { op: tok.value, prec: PREC.Mul };
      case '^':
        return { op: '^', prec: PREC.Power };
      default:
        return null;
    }
  }
  if (tok.type === TK.KW) {
    switch (tok.value) {
      case 'Or':
        return { op: 'Or', prec: PREC.Or };
      case 'And':
        return { op: 'And', prec: PREC.And };
      case 'in':
        return { op: 'in', prec: PREC.In };
      case 'exactin':
        return { op: 'exactin', prec: PREC.In };
      case 'As':
        return { op: 'As', prec: PREC.As };
      default:
        return null;
    }
  }
  return null;
}

/**
 * Message « jeton attendu » : une clé par contexte (variant) et par cas (autre jeton trouvé ou fin de formule).
 * params : { token, found, name?, field? }
 */
function expectedMessage(variant, eof, params) {
  switch (variant) {
    case 'call':
      return eof ? t('fx.expectedCloseCallEof', params) : t('fx.expectedCloseCallFound', params);
    case 'paren':
      return eof ? t('fx.expectedCloseParenEof', params) : t('fx.expectedCloseParenFound', params);
    case 'table':
      return eof ? t('fx.expectedCloseTableEof', params) : t('fx.expectedCloseTableFound', params);
    case 'record':
      return eof ? t('fx.expectedCloseRecordEof', params) : t('fx.expectedCloseRecordFound', params);
    case 'field':
      return eof ? t('fx.expectedAfterFieldEof', params) : t('fx.expectedAfterFieldFound', params);
    default:
      return eof ? t('fx.expectedEof', params) : t('fx.expectedFound', params);
  }
}

class Parser {
  constructor(tokens, src) {
    this.tokens = tokens;
    this.pos = 0;
    this.src = src;
  }
  peek(k = 0) {
    return this.tokens[Math.min(this.pos + k, this.tokens.length - 1)];
  }
  next() {
    const tok = this.tokens[this.pos];
    if (this.pos < this.tokens.length - 1) this.pos++;
    return tok;
  }
  isOp(v, k = 0) {
    const tok = this.peek(k);
    return tok.type === TK.OP && tok.value === v;
  }
  /** variant : contexte du message (voir expectedMessage) ; params : paramètres propres au contexte */
  expectOp(v, variant = '', params = {}) {
    const tok = this.peek();
    if (tok.type === TK.OP && tok.value === v) return this.next();
    throw new FxSyntaxError(expectedMessage(variant, tok.type === TK.EOF, { ...params, token: v, found: tok.text }), tok.start, tok.end);
  }

  parseFormula() {
    const tok = this.peek();
    if (tok.type === TK.EOF) return { type: 'Blank', start: tok.start, end: tok.end, empty: true };
    const node = this.parseChain();
    const end = this.peek();
    if (end.type !== TK.EOF) {
      if (end.type === TK.ERR) throw new FxSyntaxError(end.message, end.start, end.end);
      throw new FxSyntaxError(t('fx.unexpectedToken', { token: end.text }), end.start, end.end);
    }
    return node;
  }

  // a ; b ; c   (le ";" final est toléré)
  parseChain() {
    const first = this.parseExpr(0);
    if (!this.isOp(';')) return first;
    const items = [first];
    while (this.isOp(';')) {
      this.next();
      const tok = this.peek();
      if (tok.type === TK.EOF || (tok.type === TK.OP && (tok.value === ')' || tok.value === ',' || tok.value === ']' || tok.value === '}'))) break;
      items.push(this.parseExpr(0));
    }
    if (items.length === 1) return first;
    return { type: 'Chain', items, start: first.start, end: items[items.length - 1].end };
  }

  parseExpr(minPrec) {
    let left = this.parsePrefix();
    for (;;) {
      const tok = this.peek();
      const info = binaryInfo(tok);
      if (!info || info.prec <= minPrec) break;
      this.next();
      if (info.op === 'As') {
        const nameTok = this.next();
        if (nameTok.type !== TK.IDENT && nameTok.type !== TK.QIDENT) {
          throw new FxSyntaxError(t('fx.nameExpectedAfterAs'), nameTok.start, nameTok.end);
        }
        left = { type: 'As', expr: left, name: nameTok.value, start: left.start, end: nameTok.end };
        continue;
      }
      const right = this.parseExpr(info.prec);
      left = { type: 'Binary', op: info.op, sym: tok.value, left, right, start: left.start, end: right.end, opStart: tok.start };
    }
    return left;
  }

  parsePrefix() {
    const tok = this.peek();
    if (tok.type === TK.OP && (tok.value === '-' || tok.value === '+' || tok.value === '!')) {
      this.next();
      const operand = this.parseExpr(PREC.Prefix - 1 + 0.5);
      return { type: 'Unary', op: tok.value === '!' ? 'Not' : tok.value, sym: tok.value, expr: operand, start: tok.start, end: operand.end };
    }
    if (tok.type === TK.KW && tok.value === 'Not') {
      this.next();
      const operand = this.parseExpr(PREC.Prefix - 1 + 0.5);
      return { type: 'Unary', op: 'Not', sym: 'Not', expr: operand, start: tok.start, end: operand.end };
    }
    return this.parsePostfix(this.parsePrimary());
  }

  parsePostfix(node) {
    for (;;) {
      const tok = this.peek();
      if (tok.type === TK.OP && tok.value === '.') {
        this.next();
        const nameTok = this.next();
        if (nameTok.type !== TK.IDENT && nameTok.type !== TK.QIDENT && !(nameTok.type === TK.KW)) {
          throw new FxSyntaxError(t('fx.memberNameExpected'), nameTok.start, nameTok.end);
        }
        node = { type: 'Member', obj: node, name: nameTok.value, quoted: nameTok.type === TK.QIDENT, start: node.start, end: nameTok.end, nameStart: nameTok.start };
        continue;
      }
      if (tok.type === TK.OP && tok.value === '(' && (node.type === 'Ident' || node.type === 'Member') && isCallable(node)) {
        this.next();
        const args = this.parseArgs(')');
        const close = this.expectOp(')', 'call', { name: calleeName(node) });
        node = { type: 'Call', name: calleeName(node), callee: node, args, start: node.start, end: close.end, nameEnd: node.end };
        continue;
      }
      if (tok.type === TK.OP && tok.value === '%') {
        this.next();
        node = { type: 'Percent', expr: node, start: node.start, end: tok.end };
        continue;
      }
      if (tok.type === TK.OP && tok.value === '[' && this.isOp('@', 1)) {
        // Table[@Colonne]
        this.next();
        this.next();
        const nameTok = this.next();
        const close = this.expectOp(']');
        node = { type: 'Member', obj: node, name: nameTok.value, quoted: nameTok.type === TK.QIDENT, start: node.start, end: close.end, disambiguated: true };
        continue;
      }
      break;
    }
    return node;
  }

  parseArgs(closer) {
    const args = [];
    if (this.isOp(closer)) return args;
    for (;;) {
      args.push(this.parseChain());
      if (this.isOp(',')) {
        this.next();
        continue;
      }
      break;
    }
    return args;
  }

  parsePrimary() {
    const tok = this.next();
    switch (tok.type) {
      case TK.NUM:
        return { type: 'Num', value: tok.value, start: tok.start, end: tok.end };
      case TK.STR:
        return { type: 'Str', value: tok.value, start: tok.start, end: tok.end };
      case TK.INTERP: {
        const parts = tok.parts.map((p) => {
          if (typeof p === 'string') return { type: 'Str', value: p };
          const sub = parseExpressionText(p.src, p.offset);
          if (sub.error) throw new FxSyntaxError(sub.error.message, sub.error.start, sub.error.end);
          return sub.ast;
        });
        return { type: 'Interp', parts, start: tok.start, end: tok.end };
      }
      case TK.KW:
        if (tok.value === 'true' || tok.value === 'false') return { type: 'Bool', value: tok.value === 'true', start: tok.start, end: tok.end };
        if ((tok.value === 'And' || tok.value === 'Or' || tok.value === 'Not') && this.isOp('(')) {
          // Forme fonctionnelle : And(a, b), Or(a, b), Not(a)
          this.next();
          const args = this.parseArgs(')');
          const close = this.expectOp(')', 'call', { name: tok.value });
          const callee = { type: 'Ident', name: tok.value, start: tok.start, end: tok.end };
          return { type: 'Call', name: tok.value, callee, args, start: tok.start, end: close.end, nameEnd: tok.end };
        }
        throw new FxSyntaxError(t('fx.unexpectedKeyword', { keyword: tok.value }), tok.start, tok.end);
      case TK.IDENT:
        if (tok.placeholder) return { type: 'Placeholder', name: tok.value, start: tok.start, end: tok.end };
        return { type: 'Ident', name: tok.value, quoted: false, start: tok.start, end: tok.end };
      case TK.QIDENT:
        return { type: 'Ident', name: tok.value, quoted: true, start: tok.start, end: tok.end };
      case TK.OP:
        if (tok.value === '(') {
          const inner = this.parseChain();
          const close = this.expectOp(')', 'paren');
          return { type: 'Paren', expr: inner, start: tok.start, end: close.end };
        }
        if (tok.value === '{') return this.parseRecord(tok);
        if (tok.value === '[') {
          if (this.isOp('@')) {
            this.next();
            const nameTok = this.next();
            if (nameTok.type !== TK.IDENT && nameTok.type !== TK.QIDENT) throw new FxSyntaxError(t('fx.nameExpectedAfterAt'), nameTok.start, nameTok.end);
            const close = this.expectOp(']');
            return { type: 'Ident', name: nameTok.value, quoted: nameTok.type === TK.QIDENT, global: true, start: tok.start, end: close.end };
          }
          const items = this.parseArgs(']');
          const close = this.expectOp(']', 'table');
          return { type: 'Table', items, start: tok.start, end: close.end };
        }
        throw new FxSyntaxError(t('fx.unexpectedOperator', { operator: tok.value }), tok.start, tok.end);
      case TK.ERR:
        throw new FxSyntaxError(tok.message, tok.start, tok.end);
      case TK.EOF:
        throw new FxSyntaxError(t('fx.unexpectedEnd'), tok.start, tok.end);
      default:
        throw new FxSyntaxError(t('fx.unexpectedToken', { token: tok.text }), tok.start, tok.end);
    }
  }

  parseRecord(open) {
    const fields = [];
    if (this.isOp('}')) {
      const close = this.next();
      return { type: 'Record', fields, start: open.start, end: close.end };
    }
    for (;;) {
      const nameTok = this.next();
      if (nameTok.type !== TK.IDENT && nameTok.type !== TK.QIDENT && nameTok.type !== TK.KW) {
        throw new FxSyntaxError(t('fx.fieldNameExpected'), nameTok.start, nameTok.end);
      }
      this.expectOp(':', 'field', { field: nameTok.value });
      const value = this.parseChain();
      fields.push({ name: nameTok.value, value, start: nameTok.start, nameEnd: nameTok.end });
      if (this.isOp(',')) {
        this.next();
        if (this.isOp('}')) break;
        continue;
      }
      break;
    }
    const close = this.expectOp('}', 'record');
    return { type: 'Record', fields, start: open.start, end: close.end };
  }
}

function isCallable(node) {
  if (node.type === 'Ident') return !node.global;
  if (node.type === 'Member') return isCallable(node.obj) || node.obj.type === 'Ident';
  return false;
}

function calleeName(node) {
  if (node.type === 'Ident') return node.name;
  if (node.type === 'Member') return calleeName(node.obj) + '.' + node.name;
  return '?';
}

function parseExpressionText(src, offset) {
  try {
    const tokens = tokenize(src, { offset });
    const p = new Parser(tokens, src);
    const ast = p.parseFormula();
    return { ast };
  } catch (e) {
    if (e instanceof FxSyntaxError) return { error: e };
    throw e;
  }
}

const cache = new Map();
const CACHE_MAX = 20000;
// Le cache contient les messages d'erreur traduits : il est vidé au changement de langue
onLocaleChange(() => cache.clear());

/**
 * Parse une formule de propriété (avec ou sans "=" initial).
 * Retourne { ast, error, offset } ; les positions de l'AST sont relatives à la chaîne d'origine.
 */
export function parseFormula(formula) {
  const key = formula;
  const hit = cache.get(key);
  if (hit) return hit;
  const { body, offset } = stripEquals(formula ?? '');
  let result;
  try {
    const tokens = tokenize(body, { offset });
    const p = new Parser(tokens, body);
    const ast = p.parseFormula();
    result = { ast, error: null, offset };
  } catch (e) {
    if (e instanceof FxSyntaxError) result = { ast: null, error: { message: e.message, start: e.start, end: e.end }, offset };
    else result = { ast: null, error: { message: String(e?.message || e), start: offset, end: offset + 1 }, offset };
  }
  if (cache.size > CACHE_MAX) cache.clear();
  cache.set(key, result);
  return result;
}

/** Parcourt l'AST en profondeur. visitor(node, parent) */
export function walk(node, visitor, parent = null) {
  if (!node || typeof node !== 'object') return;
  if (visitor(node, parent) === false) return;
  switch (node.type) {
    case 'Chain':
      node.items.forEach((n) => walk(n, visitor, node));
      break;
    case 'Binary':
      walk(node.left, visitor, node);
      walk(node.right, visitor, node);
      break;
    case 'Unary':
    case 'Percent':
    case 'Paren':
      walk(node.expr, visitor, node);
      break;
    case 'As':
      walk(node.expr, visitor, node);
      break;
    case 'Member':
      walk(node.obj, visitor, node);
      break;
    case 'Call':
      node.args.forEach((a) => walk(a, visitor, node));
      break;
    case 'Record':
      node.fields.forEach((f) => walk(f.value, visitor, node));
      break;
    case 'Table':
      node.items.forEach((n) => walk(n, visitor, node));
      break;
    case 'Interp':
      node.parts.forEach((n) => walk(n, visitor, node));
      break;
    default:
      break;
  }
}
