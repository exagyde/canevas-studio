// Prise en main : étapes de la visite guidée du studio, sujets du guide et placement de la bulle.
// Module sans dépendance (testé dans node) ; les textes sont dans le domaine « help » des traductions.

/**
 * Visite guidée du studio. target : valeur de l'attribut data-tour de l'élément mis en évidence
 * (absent ou masqué : bulle centrée) ; open : volet à ouvrir avant l'étape.
 * Textes : help.tour<key>Title et help.tour<key>Text.
 */
export const STUDIO_TOUR = [
  { key: 'Paste', target: 'paste' },
  { key: 'Views', target: 'views' },
  { key: 'Ai', target: 'ai', open: 'ai' },
  { key: 'Copy', target: 'copy' },
  { key: 'Help', target: 'help' },
];

/** Accueil du premier lancement : les trois temps du travail (help.welcome<key>Title / Text) */
export const WELCOME_STEPS = [
  { key: 'Copy', icon: 'Copy' },
  { key: 'Improve', icon: 'Sparkle' },
  { key: 'Paste', icon: 'Paste' },
];

/**
 * Sujets du guide. Titre : help.guide<key> ; paragraphes : help.<item> ;
 * raccourcis : help.<item>Keys (touches) et help.<item> (action).
 */
export const GUIDE_TOPICS = [
  { key: 'Start', icon: 'Paste', ordered: true, items: ['startCopy', 'startPaste', 'startImport'] },
  { key: 'Views', icon: 'Screen', items: ['viewsPreview', 'viewsYaml', 'viewsChanges'] },
  { key: 'Ai', icon: 'Sparkle', items: ['aiSetup', 'aiAsk', 'aiApply'] },
  { key: 'Back', icon: 'Copy', ordered: true, items: ['backCopy', 'backPaste', 'backBaseline'] },
  { key: 'Check', icon: 'Stethoscope', items: ['checkChecker', 'checkPreview', 'checkData'] },
  { key: 'Shortcuts', icon: 'Keyboard', shortcuts: ['keyPaste', 'keyCopy', 'keyUndo', 'keyApply', 'keyShowYaml', 'keyPreview', 'keyRun', 'keyZoom'] },
  { key: 'Data', icon: 'Lock', items: ['dataLocal', 'dataKeys', 'dataLanguage'] },
];

/** Toutes les clés de texte de la prise en main (vérifiées par les tests) */
export function helpKeys() {
  const keys = [];
  for (const s of STUDIO_TOUR) keys.push(`tour${s.key}Title`, `tour${s.key}Text`);
  for (const s of WELCOME_STEPS) keys.push(`welcome${s.key}Title`, `welcome${s.key}Text`);
  for (const g of GUIDE_TOPICS) {
    keys.push(`guide${g.key}`);
    for (const it of g.items || []) keys.push(it);
    for (const it of g.shortcuts || []) keys.push(it, `${it}Keys`);
  }
  return keys;
}

const SIDES = ['bottom', 'top', 'left', 'right'];

/**
 * Position de la bulle de la visite à côté de l'élément ciblé : dessous, dessus, à gauche ou à droite,
 * le premier côté où elle tient, puis recadrée dans la fenêtre. Sans cible (ou cible trop grande) : centrée.
 * @param {{left,top,right,bottom}|null} target rectangle de la cible (marge comprise)
 * @param {{width,height}} card taille de la bulle
 * @param {{width,height}} viewport taille de la fenêtre
 * @returns {{left:number, top:number, side:'bottom'|'top'|'left'|'right'|'center'}}
 */
export function placeCard(target, card, viewport, gap = 12, margin = 12) {
  const clamp = (v, min, max) => Math.max(min, Math.min(v, max));
  const centered = { left: Math.max(margin, (viewport.width - card.width) / 2), top: Math.max(margin, (viewport.height - card.height) / 2), side: 'center' };
  if (!target) return centered;
  const room = {
    bottom: viewport.height - margin - (target.bottom + gap),
    top: target.top - gap - margin,
    right: viewport.width - margin - (target.right + gap),
    left: target.left - gap - margin,
  };
  const side = SIDES.find((s) => (s === 'bottom' || s === 'top' ? room[s] >= card.height : room[s] >= card.width));
  if (!side) return centered;
  const cx = (target.left + target.right) / 2 - card.width / 2;
  const cy = (target.top + target.bottom) / 2 - card.height / 2;
  const pos = {
    bottom: { left: cx, top: target.bottom + gap },
    top: { left: cx, top: target.top - gap - card.height },
    right: { left: target.right + gap, top: cy },
    left: { left: target.left - gap - card.width, top: cy },
  }[side];
  return {
    left: clamp(pos.left, margin, viewport.width - margin - card.width),
    top: clamp(pos.top, margin, viewport.height - margin - card.height),
    side,
  };
}
