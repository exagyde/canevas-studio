// Aides : définition effective d'un nœud (composants compris), cible d'insertion, disposition du parent.
import { controlDef, SCREEN_DEF, APP_DEF, COMPONENT_DEF } from '../catalog/controls.js';
import { findNode } from './model.js';
import { customPropertyList, isInstanceSide } from './customProps.js';

const customMeta = (cp) => ({ name: cp.name, kind: 'formula', group: 'custom', custom: cp });
const instanceDefs = new WeakMap();
const componentDefs = new WeakMap();

/** Définition d'une instance : propriétés personnalisées + valeurs par défaut issues du composant */
function instanceDefOf(comp) {
  if (instanceDefs.has(comp)) return instanceDefs.get(comp);
  const base = controlDef({ head: { Control: 'CanvasComponent' } });
  const cps = customPropertyList(comp);
  const settable = cps.filter((cp) => isInstanceSide(cp.kind));
  const defaults = { ...base.defaults };
  for (const k of ['Width', 'Height']) if (comp.properties?.[k] !== undefined) defaults[k] = comp.properties[k];
  for (const cp of settable) defaults[cp.name] = cp.default ?? '=';
  const props = [...settable.map(customMeta), ...base.props];
  const def = { ...base, defaults, props, propIndex: new Map(props.map((p) => [p.name, p])), outputs: cps.filter((cp) => !isInstanceSide(cp.kind)).map((cp) => cp.name), component: comp };
  // libellé traduit : la copie figerait la langue du premier calcul
  Object.defineProperty(def, 'label', { get: () => base.label, enumerable: true });
  instanceDefs.set(comp, def);
  return def;
}

/** Définition d'un composant : propriétés propres + toutes ses propriétés personnalisées */
function componentDefOf(comp) {
  if (componentDefs.has(comp)) return componentDefs.get(comp);
  const props = [...customPropertyList(comp).map(customMeta), ...COMPONENT_DEF.props];
  const def = { ...COMPONENT_DEF, props, propIndex: new Map(props.map((p) => [p.name, p])) };
  Object.defineProperty(def, 'label', { get: () => COMPONENT_DEF.label, enumerable: true });
  componentDefs.set(comp, def);
  return def;
}

export function defOf(node, kind, project) {
  if (kind === 'app') return APP_DEF;
  if (kind === 'screen') return SCREEN_DEF;
  if (kind === 'component') return componentDefOf(node);
  const def = controlDef(node);
  if (def.id === 'CanvasComponent' && project) {
    const comp = (project.components || []).find((c) => c.name === node.head?.ComponentName);
    if (comp) return instanceDefOf(comp);
  }
  return def;
}

/** Nœud parent pour une insertion : conteneur sélectionné, sinon parent du contrôle, sinon écran */
export function insertionTarget(project, selectedId, screenId) {
  const f = findNode(project, selectedId);
  if (f && (f.kind === 'screen' || f.kind === 'component')) return f.node._id;
  if (f && f.kind === 'control') {
    const def = controlDef(f.node);
    if (def.container && def.id !== 'CanvasComponent') return f.node._id;
    if (f.parent) return f.parent._id;
  }
  return screenId;
}

/** Disposition du parent : 'auto' | 'manual' */
export function parentLayout(parent) {
  if (!parent) return 'manual';
  const def = controlDef(parent);
  if (def.id === 'GroupContainer' && /auto/i.test(String(parent.head?.Variant || ''))) return 'auto';
  if (def.id === 'Form') return 'form';
  return 'manual';
}

