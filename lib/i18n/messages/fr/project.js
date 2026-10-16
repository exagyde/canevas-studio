// Projets : création, import / export, noms par défaut (français)
export default {
  // noms par défaut
  newAppName: 'Nouvelle application',
  importedName: 'Projet importé',
  demoUserName: 'Utilisateur Démo',
  defaultFileName: 'ecran',
  defaultInputFileName: 'fichier',

  // import de fichiers YAML
  controlsWithoutScreen: 'Ce fichier contient des contrôles sans écran : collez-les dans un écran existant (Ctrl+V).',
  nothingFound: 'Aucun écran, App ou composant trouvé.',
  imported: 'Importé : {items}',
  screensCount: { one: '{count} écran(s)', other: '{count} écran(s)' },
  componentsCount: { one: '{count} composant(s)', other: '{count} composant(s)' },

  // stockage local
  indexedDbUnavailable: 'IndexedDB indisponible',

  // types de propriétés personnalisées des composants
  kindInput: 'Entrée',
  kindInputHint: 'Valeur fournie par l’application à chaque instance.',
  kindOutput: 'Sortie',
  kindOutputHint: 'Valeur calculée par le composant, lue par l’application.',
  kindEvent: 'Événement',
  kindEventHint: 'Comportement défini sur l’instance, déclenché par le composant.',
  kindAction: 'Action',
  kindActionHint: 'Comportement du composant appelé par l’application.',
  kindInputFunction: 'Fonction d’entrée',
  kindInputFunctionHint: 'Fonction fournie par l’instance, appelée par le composant.',
  kindOutputFunction: 'Fonction de sortie',
  kindOutputFunctionHint: 'Fonction du composant appelée par l’application.',
};
