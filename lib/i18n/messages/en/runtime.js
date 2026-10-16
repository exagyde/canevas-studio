// Exécution de l’application émulée (aperçu F5) (anglais)
export default {
  /** Message précédé de son origine (Bouton1.OnSelect, nom d’un appel externe…) */
  labelMessage: '{label}: {message}',
  syntaxErrorIn: 'Syntax error in {label}: {message}',
  internalError: 'Internal error: {message}',
  namedFormulaError: 'Named formula {name}: {message}',

  // Appels externes (flux, API personnalisées, connecteurs)
  externalCallNotConfigured: 'External call not configured: {name}(…). Set up a mock in the Power Automate & actions pane.',
  callLog: 'Call to {name}',
  responseLog: 'Response from {name}',
  mockScriptError: 'Mock script for {name}: {message}',
  httpUnavailable: 'HTTP calls are unavailable',
  invalidMockJson: 'Invalid JSON in the mock response for {name}: {message}',

  // Sources de données et collections
  collectInvalidTarget: 'Collect: the target must be a collection or a data source',
  recordNotFound: 'Record not found in {name}',
  patchInvalidTarget: 'Patch: invalid target',

  // Navigation
  screenNotFound: 'Navigate: screen not found ({name})',
  navigatedTo: 'Navigated to {name}',

  // Formulaires
  formControlExpected: '{action}: a Form control was expected',
  requiredFieldsEmpty: 'Some required fields are empty.',
  formInvalid: 'Invalid form: some required fields are empty.',
  formNoDataSource: 'SubmitForm: the DataSource property of the form is empty.',
  saveFailed: 'Could not save the record: {message}',

  exitCalled: 'Exit() called: the (emulated) app has ended.',
};
