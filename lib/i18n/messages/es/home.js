// Page d’accueil : liste des applications, création, import (espagnol)
export default {
  // en-tête et présentation
  brandSub: 'YAML de Power Apps · vista previa · asistente de IA',
  heroTitle: 'Comprenda y modifique sus pantallas de Power Apps con IA',
  heroText: 'Pegue el YAML de una pantalla copiada desde Power Apps Studio, visualice cómo se representa y pida al asistente de IA que la analice y la modifique mientras revisa cada cambio. Después, vuelva a pegar el YAML en Power Apps.',
  blankApp: 'Aplicación en blanco',
  blankAppSub: 'Nuevo proyecto con una pantalla',
  importFiles: 'Importar archivos',
  importFilesSub: 'ZIP con varios YAML o archivos .yml',
  pasteYaml: 'Pegar YAML',
  pasteYamlSub: 'Código copiado desde Power Apps Studio',
  dropHint: 'Suelte sus archivos .zip / .yml para crear un proyecto',

  // liste des applications
  myApps: 'Mis aplicaciones',
  emptyTitle: 'Todavía no hay aplicaciones.',
  emptyText: 'Cree una aplicación, importe un ZIP o arrastre archivos YAML aquí.',
  name: 'Nombre',
  colScreens: 'Pantallas',
  colData: 'Datos',
  colSize: 'Tamaño',
  colModified: 'Modificado',
  tablesCount: { one: '{count} tabla', other: '{count} tablas' },
  flowsCount: { one: '{count} flujo', other: '{count} flujos' },
  actions: 'Acciones',
  open: 'Abrir',
  exportZip: 'Exportar (.zip)',

  // formats d’écran
  presetTablet: 'Tableta 16:9',
  presetHd: 'Escritorio HD',
  presetTablet43: 'Tableta 4:3',
  presetPhone: 'Teléfono',
  presetCustomPage: 'Página personalizada',

  // boîtes de dialogue
  newAppTitle: 'Nueva aplicación de lienzo',
  format: 'Formato',
  create: 'Crear',
  pasteTitle: 'Pegar el YAML de una pantalla',
  pasteHelp: 'En Power Apps Studio, haga clic con el botón derecho en una pantalla de la vista de árbol → <b>Copiar código</b> y péguelo a continuación (formato <code>Screens:</code>).',
  projectName: 'Nombre del proyecto',
  createProject: 'Crear proyecto',
  pastedName: 'Proyecto pegado',
  pastedFileName: 'pegado.yml',
  renameTitle: 'Cambiar el nombre de la aplicación',
  deleteTitle: '¿Eliminar la aplicación?',
  deleteText: '«{name}» se eliminará de este explorador. Si desea conservarla, expórtela antes como .zip.',
  copyName: '{name} (copia)',

  // messages
  storageUnavailable: 'Almacenamiento local no disponible: {message}',
  noYamlFound: 'No se encontró ningún archivo YAML (.yml / .yaml).',
  importImpossible: 'No se pudo importar: {details}',
  filesSkipped: { one: 'Se omitió {count} archivo: {files}', other: 'Se omitieron {count} archivos: {files}' },
  projectImported: { one: 'Proyecto «{name}» importado ({count} pantalla).', other: 'Proyecto «{name}» importado ({count} pantallas).' },
  importError: 'Error de importación: {message}',
  projectDeleted: 'Proyecto eliminado.',
};
