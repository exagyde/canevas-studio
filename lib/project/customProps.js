// Propriétés personnalisées des composants (CustomProperties du format pa.yaml).
//
// Où vit la formule d'une propriété personnalisée :
//  - Input, Event, InputFunction : la valeur par défaut est dans CustomProperties.<Nom>.Default ;
//    chaque instance peut la remplacer dans ses propres Properties.
//  - Output, OutputFunction, Action : la formule est dans les Properties de la définition du composant.
import { t } from '../i18n/index.js';

// libellé et aide traduits à la lecture (langue courante)
const PROPERTY_KINDS = [
  {
    id: 'Input',
    side: 'instance',
    typed: 'data',
    get label() { return t('project.kindInput'); },
    get hint() { return t('project.kindInputHint'); },
  },
  {
    id: 'Output',
    side: 'definition',
    typed: 'data',
    get label() { return t('project.kindOutput'); },
    get hint() { return t('project.kindOutputHint'); },
  },
  {
    id: 'Event',
    side: 'instance',
    typed: 'return',
    params: true,
    get label() { return t('project.kindEvent'); },
    get hint() { return t('project.kindEventHint'); },
  },
  {
    id: 'Action',
    side: 'definition',
    typed: 'return',
    params: true,
    get label() { return t('project.kindAction'); },
    get hint() { return t('project.kindActionHint'); },
  },
  {
    id: 'InputFunction',
    side: 'instance',
    typed: 'return',
    params: true,
    get label() { return t('project.kindInputFunction'); },
    get hint() { return t('project.kindInputFunctionHint'); },
  },
  {
    id: 'OutputFunction',
    side: 'definition',
    typed: 'return',
    params: true,
    get label() { return t('project.kindOutputFunction'); },
    get hint() { return t('project.kindOutputFunctionHint'); },
  },
];

export const DATA_TYPES = ['Text', 'Number', 'Boolean', 'DateAndTime', 'Color', 'Currency', 'Record', 'Table', 'Image', 'VideoOrAudio', 'Screen'];

const KIND_INDEX = new Map(PROPERTY_KINDS.map((k) => [k.id, k]));

export function kindInfo(kind) {
  return KIND_INDEX.get(kind) || KIND_INDEX.get('Input');
}

/** La formule est-elle portée par l'instance (défaut dans CustomProperties) ? */
export function isInstanceSide(kind) {
  return kindInfo(kind).side === 'instance';
}

export function isBehaviorKind(kind) {
  return kind === 'Event' || kind === 'Action';
}

/** Paramètres d'un événement / d'une fonction : liste YAML d'objets à une seule clé */
export function paramsOf(raw) {
  const list = Array.isArray(raw?.Parameters) ? raw.Parameters : [];
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    for (const [name, v] of Object.entries(item)) {
      const p = v && typeof v === 'object' ? v : {};
      out.push({ name, dataType: p.DataType || 'Text', description: p.Description || '', isOptional: !!p.IsOptional, default: p.Default });
    }
  }
  return out;
}

/** Propriétés personnalisées d'une définition, dans l'ordre du YAML */
export function customPropertyList(comp) {
  const cps = comp?.customProperties;
  if (!cps || typeof cps !== 'object') return [];
  return Object.entries(cps).map(([name, raw]) => {
    const r = raw && typeof raw === 'object' ? raw : {};
    const kind = KIND_INDEX.has(r.PropertyKind) ? r.PropertyKind : 'Input';
    return {
      name,
      kind,
      dataType: r.DataType,
      returnType: r.ReturnType,
      description: r.Description || '',
      raiseOnReset: !!r.RaiseOnReset,
      params: paramsOf(r),
      default: r.Default === undefined || r.Default === null ? undefined : String(r.Default),
      raw: r,
    };
  });
}
