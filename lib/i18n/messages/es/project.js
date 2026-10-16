// Projets : création, import / export, noms par défaut (espagnol)
export default {
  // noms par défaut
  newAppName: 'Nueva aplicación',
  importedName: 'Proyecto importado',
  demoUserName: 'Usuario Demo',
  defaultFileName: 'pantalla',
  defaultInputFileName: 'archivo',

  // import de fichiers YAML
  controlsWithoutScreen: 'Este archivo contiene controles sin pantalla: péguelos en una pantalla existente (Ctrl+V).',
  nothingFound: 'No se encontró ninguna pantalla, App ni componente.',
  imported: 'Importado: {items}',
  screensCount: { one: '{count} pantalla', other: '{count} pantallas' },
  componentsCount: { one: '{count} componente', other: '{count} componentes' },

  // stockage local
  indexedDbUnavailable: 'IndexedDB no disponible',

  // types de propriétés personnalisées des composants
  kindInput: 'Entrada',
  kindInputHint: 'Valor que la aplicación proporciona a cada instancia.',
  kindOutput: 'Salida',
  kindOutputHint: 'Valor que calcula el componente y que lee la aplicación.',
  kindEvent: 'Evento',
  kindEventHint: 'Comportamiento definido en la instancia y desencadenado por el componente.',
  kindAction: 'Acción',
  kindActionHint: 'Comportamiento del componente al que llama la aplicación.',
  kindInputFunction: 'Función de entrada',
  kindInputFunctionHint: 'Función que proporciona la instancia y a la que llama el componente.',
  kindOutputFunction: 'Función de salida',
  kindOutputFunctionHint: 'Función del componente a la que llama la aplicación.',
};
