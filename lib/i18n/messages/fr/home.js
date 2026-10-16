// Page d’accueil : liste des applications, création, import (français)
export default {
  // en-tête et présentation
  brandSub: 'YAML Power Apps · aperçu · assistant IA',
  heroTitle: 'Comprendre et modifier vos écrans Power Apps avec l’IA',
  heroText: 'Collez le YAML d’un écran copié depuis Power Apps Studio, visualisez son rendu, faites-le analyser et modifier par l’assistant IA en vérifiant chaque changement, puis recollez le YAML dans Power Apps.',
  blankApp: 'Application vide',
  blankAppSub: 'Nouveau projet avec un écran',
  importFiles: 'Importer des fichiers',
  importFilesSub: 'ZIP de plusieurs YAML ou fichiers .yml',
  pasteYaml: 'Coller du YAML',
  pasteYamlSub: 'Code copié depuis Power Apps Studio',
  dropHint: 'Déposez vos fichiers .zip / .yml pour créer un projet',

  // liste des applications
  myApps: 'Mes applications',
  emptyTitle: 'Aucune application pour le moment.',
  emptyText: 'Créez une application, importez un ZIP ou déposez des fichiers YAML ici.',
  name: 'Nom',
  colScreens: 'Écrans',
  colData: 'Données',
  colSize: 'Taille',
  colModified: 'Modifié',
  tablesCount: { one: '{count} table(s)', other: '{count} table(s)' },
  flowsCount: { one: '{count} flux', other: '{count} flux' },
  actions: 'Actions',
  open: 'Ouvrir',
  exportZip: 'Exporter (.zip)',

  // formats d’écran
  presetTablet: 'Tablette 16:9',
  presetHd: 'Bureau HD',
  presetTablet43: 'Tablette 4:3',
  presetPhone: 'Téléphone',
  presetCustomPage: 'Page personnalisée',

  // boîtes de dialogue
  newAppTitle: 'Nouvelle application canevas',
  format: 'Format',
  create: 'Créer',
  pasteTitle: 'Coller le YAML d’un écran',
  pasteHelp: 'Dans Power Apps Studio : clic droit sur un écran dans l’arborescence → <b>Copier le code</b>, puis collez-le ci-dessous (format <code>Screens:</code>).',
  projectName: 'Nom du projet',
  createProject: 'Créer le projet',
  pastedName: 'Projet collé',
  pastedFileName: 'collage.yml',
  renameTitle: 'Renommer l’application',
  deleteTitle: 'Supprimer l’application ?',
  deleteText: '« {name} » sera supprimée de ce navigateur. Exportez-la d’abord en .zip si vous souhaitez la conserver.',
  copyName: '{name} (copie)',

  // messages
  storageUnavailable: 'Stockage local indisponible : {message}',
  noYamlFound: 'Aucun fichier YAML (.yml / .yaml) trouvé.',
  importImpossible: 'Import impossible : {details}',
  filesSkipped: { one: '{count} fichier(s) ignoré(s) : {files}', other: '{count} fichier(s) ignoré(s) : {files}' },
  projectImported: { one: 'Projet « {name} » importé ({count} écran(s)).', other: 'Projet « {name} » importé ({count} écran(s)).' },
  importError: "Erreur d'import : {message}",
  projectDeleted: 'Projet supprimé.',
};
