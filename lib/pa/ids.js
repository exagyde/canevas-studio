let counter = 0;
const seed = Math.random().toString(36).slice(2, 6);

/** Identifiant interne unique (non sérialisé dans le YAML). */
export function newId(prefix = 'n') {
  counter += 1;
  return `${prefix}_${seed}${counter.toString(36)}`;
}
