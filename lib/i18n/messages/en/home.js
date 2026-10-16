// Page d’accueil : liste des applications, création, import (anglais)
export default {
  // en-tête et présentation
  brandSub: 'Power Apps YAML · preview · AI assistant',
  heroTitle: 'Understand and edit your Power Apps screens with AI',
  heroText: 'Paste the YAML of a screen copied from Power Apps Studio, see how it renders, and have the AI assistant analyze and edit it while you review each change. Then paste the YAML back into Power Apps.',
  blankApp: 'Blank app',
  blankAppSub: 'New project with one screen',
  importFiles: 'Import files',
  importFilesSub: 'ZIP of several YAML files, or .yml files',
  pasteYaml: 'Paste YAML',
  pasteYamlSub: 'Code copied from Power Apps Studio',
  dropHint: 'Drop your .zip / .yml files to create a project',

  // liste des applications
  myApps: 'My apps',
  emptyTitle: 'No apps yet.',
  emptyText: 'Create an app, import a ZIP, or drop YAML files here.',
  name: 'Name',
  colScreens: 'Screens',
  colData: 'Data',
  colSize: 'Size',
  colModified: 'Modified',
  tablesCount: { one: '{count} table', other: '{count} tables' },
  flowsCount: { one: '{count} flow', other: '{count} flows' },
  actions: 'Actions',
  open: 'Open',
  exportZip: 'Export (.zip)',

  // formats d’écran
  presetTablet: 'Tablet 16:9',
  presetHd: 'HD desktop',
  presetTablet43: 'Tablet 4:3',
  presetPhone: 'Phone',
  presetCustomPage: 'Custom page',

  // boîtes de dialogue
  newAppTitle: 'New canvas app',
  format: 'Format',
  create: 'Create',
  pasteTitle: 'Paste screen YAML',
  pasteHelp: 'In Power Apps Studio, right-click a screen in the tree view → <b>Copy code</b>, then paste it below (<code>Screens:</code> format).',
  projectName: 'Project name',
  createProject: 'Create project',
  pastedName: 'Pasted project',
  pastedFileName: 'pasted.yml',
  renameTitle: 'Rename app',
  deleteTitle: 'Delete app?',
  deleteText: '“{name}” will be deleted from this browser. To keep it, export it as a .zip first.',
  copyName: '{name} (copy)',

  // messages
  storageUnavailable: 'Local storage unavailable: {message}',
  noYamlFound: 'No YAML files (.yml / .yaml) found.',
  importImpossible: 'Import failed: {details}',
  filesSkipped: { one: '{count} file skipped: {files}', other: '{count} files skipped: {files}' },
  projectImported: { one: 'Project “{name}” imported ({count} screen).', other: 'Project “{name}” imported ({count} screens).' },
  importError: 'Import error: {message}',
  projectDeleted: 'Project deleted.',
};
