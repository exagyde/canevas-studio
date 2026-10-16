// Exécution de l’application émulée (aperçu F5) (français)
export default {
  /** Message précédé de son origine (Bouton1.OnSelect, nom d’un appel externe…) */
  labelMessage: '{label} : {message}',
  syntaxErrorIn: 'Erreur de syntaxe dans {label} : {message}',
  internalError: 'Erreur interne : {message}',
  namedFormulaError: 'Formule nommée {name} : {message}',

  // Appels externes (flux, API personnalisées, connecteurs)
  externalCallNotConfigured: 'Appel externe non configuré : {name}(…) — définissez une simulation dans le volet Flux & actions.',
  callLog: 'Appel {name}',
  responseLog: 'Réponse {name}',
  mockScriptError: 'Script de simulation {name} : {message}',
  httpUnavailable: 'Appel HTTP indisponible',
  invalidMockJson: 'Réponse simulée JSON invalide pour {name} : {message}',

  // Sources de données et collections
  collectInvalidTarget: 'Collect : la cible doit être une collection ou une source de données',
  recordNotFound: 'Enregistrement introuvable dans {name}',
  patchInvalidTarget: 'Patch : cible invalide',

  // Navigation
  screenNotFound: 'Navigate : écran introuvable ({name})',
  navigatedTo: 'Navigation vers {name}',

  // Formulaires
  formControlExpected: '{action} : un contrôle Formulaire est attendu',
  requiredFieldsEmpty: 'Des champs obligatoires sont vides.',
  formInvalid: 'Formulaire invalide : des champs obligatoires sont vides.',
  formNoDataSource: 'SubmitForm : la propriété DataSource du formulaire est vide.',
  saveFailed: "Échec de l'enregistrement : {message}",

  exitCalled: 'Exit() appelé : fin de l’application (émulée).',
};
