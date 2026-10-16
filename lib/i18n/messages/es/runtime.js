// Exécution de l’application émulée (aperçu F5) (espagnol)
export default {
  /** Message précédé de son origine (Bouton1.OnSelect, nom d’un appel externe…) */
  labelMessage: '{label}: {message}',
  syntaxErrorIn: 'Error de sintaxis en {label}: {message}',
  internalError: 'Error interno: {message}',
  namedFormulaError: 'Fórmula con nombre {name}: {message}',

  // Appels externes (flux, API personnalisées, connecteurs)
  externalCallNotConfigured: 'Llamada externa no configurada: {name}(…). Defina una simulación en el panel Power Automate y acciones.',
  callLog: 'Llamada a {name}',
  responseLog: 'Respuesta de {name}',
  mockScriptError: 'Script de simulación de {name}: {message}',
  httpUnavailable: 'Las llamadas HTTP no están disponibles',
  invalidMockJson: 'JSON no válido en la respuesta simulada de {name}: {message}',

  // Sources de données et collections
  collectInvalidTarget: 'Collect: el destino debe ser una colección o un origen de datos',
  recordNotFound: 'No se encontró el registro en {name}',
  patchInvalidTarget: 'Patch: destino no válido',

  // Navigation
  screenNotFound: 'Navigate: no se encontró la pantalla ({name})',
  navigatedTo: 'Navegación a {name}',

  // Formulaires
  formControlExpected: '{action}: se esperaba un control de formulario',
  requiredFieldsEmpty: 'Hay campos obligatorios vacíos.',
  formInvalid: 'Formulario no válido: hay campos obligatorios vacíos.',
  formNoDataSource: 'SubmitForm: la propiedad DataSource del formulario está vacía.',
  saveFailed: 'No se pudo guardar el registro: {message}',

  exitCalled: 'Se llamó a Exit(): fin de la aplicación (emulada).',
};
