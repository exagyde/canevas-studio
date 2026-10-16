// Projets : création, import / export, noms par défaut (anglais)
export default {
  // noms par défaut
  newAppName: 'New app',
  importedName: 'Imported project',
  demoUserName: 'Demo User',
  defaultFileName: 'screen',
  defaultInputFileName: 'file',

  // import de fichiers YAML
  controlsWithoutScreen: 'This file contains controls without a screen: paste them into an existing screen (Ctrl+V).',
  nothingFound: 'No screen, App, or component found.',
  imported: 'Imported: {items}',
  screensCount: { one: '{count} screen', other: '{count} screens' },
  componentsCount: { one: '{count} component', other: '{count} components' },

  // stockage local
  indexedDbUnavailable: 'IndexedDB unavailable',

  // types de propriétés personnalisées des composants
  kindInput: 'Input',
  kindInputHint: 'Value provided by the app to each instance.',
  kindOutput: 'Output',
  kindOutputHint: 'Value calculated by the component and read by the app.',
  kindEvent: 'Event',
  kindEventHint: 'Behavior defined on the instance and triggered by the component.',
  kindAction: 'Action',
  kindActionHint: 'Component behavior called by the app.',
  kindInputFunction: 'Input function',
  kindInputFunctionHint: 'Function provided by the instance and called by the component.',
  kindOutputFunction: 'Output function',
  kindOutputFunctionHint: 'Component function called by the app.',
};
