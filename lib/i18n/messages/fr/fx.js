// Émulateur Power Fx : erreurs de syntaxe et d’exécution (français)
export default {
  // Analyse lexicale
  unterminatedComment: 'Commentaire non terminé (*/ manquant)',
  unterminatedString: 'Chaîne de caractères non terminée (" manquant)',
  unterminatedIdentifier: "Identificateur non terminé (' manquant)",
  unexpectedChar: 'Caractère inattendu « {char} »',
  unterminatedInterpolation: 'Expression interpolée non terminée (} manquant)',
  unterminatedInterpolatedString: 'Chaîne interpolée non terminée',

  // Analyse syntaxique : jeton attendu (« Found » : autre jeton trouvé ; « Eof » : fin de formule atteinte)
  expectedFound: '« {token} » attendu, « {found} » trouvé',
  expectedEof: '« {token} » attendu (fin de formule atteinte)',
  expectedCloseCallFound: "« {token} » attendu pour fermer l'appel de {name}, « {found} » trouvé",
  expectedCloseCallEof: "« {token} » attendu pour fermer l'appel de {name} (fin de formule atteinte)",
  expectedCloseParenFound: '« {token} » attendu pour fermer la parenthèse, « {found} » trouvé',
  expectedCloseParenEof: '« {token} » attendu pour fermer la parenthèse (fin de formule atteinte)',
  expectedCloseTableFound: '« {token} » attendu pour fermer la table, « {found} » trouvé',
  expectedCloseTableEof: '« {token} » attendu pour fermer la table (fin de formule atteinte)',
  expectedCloseRecordFound: "« {token} » attendu pour fermer l'enregistrement, « {found} » trouvé",
  expectedCloseRecordEof: "« {token} » attendu pour fermer l'enregistrement (fin de formule atteinte)",
  expectedAfterFieldFound: '« {token} » attendu après le nom de champ « {field} », « {found} » trouvé',
  expectedAfterFieldEof: '« {token} » attendu après le nom de champ « {field} » (fin de formule atteinte)',

  // Analyse syntaxique : autres erreurs
  unexpectedToken: 'Jeton inattendu « {token} »',
  nameExpectedAfterAs: 'Nom attendu après « As »',
  memberNameExpected: 'Nom de propriété ou de champ attendu après « . »',
  unexpectedKeyword: 'Mot-clé « {keyword} » inattendu',
  nameExpectedAfterAt: 'Nom attendu après « [@ »',
  unexpectedOperator: 'Opérateur « {operator} » inattendu',
  unexpectedEnd: 'Fin de formule inattendue : une expression est attendue',
  fieldNameExpected: "Nom de champ attendu dans l'enregistrement",

  // Exécution
  cannotConvertToNumber: 'Impossible de convertir « {value} » en nombre',
  notANumber: 'Valeur non numérique ({value})',
  divisionByZero: 'Division par zéro',
  averageOfEmptyTable: 'Division par zéro (Average sur une table vide)',
  unknownNode: 'Nœud inconnu {type}',
  unknownOperator: 'Opérateur inconnu {operator}',
  infiniteLoop: 'Boucle infinie détectée',
  invalidRegex: 'Expression régulière invalide : {details}',
  notABoolean: "« {value} » n'est pas un booléen",
  invalidGuid: 'GUID invalide : {value}',
  invalidJson: 'JSON invalide : {details}',
  indexOutOfRange: 'Index {index} hors limites (1..{max})',
  invalidColor: 'Couleur invalide : {value}',
  setNeedsVariable: 'Set : le premier argument doit être un nom de variable',
  /** Message de Error() sans texte */
  errorDefault: 'Erreur',
  /** User().FullName sans utilisateur configuré */
  defaultUserName: 'Utilisateur',

  // Description courte d’une valeur (messages d’erreur, volet Variables)
  valueBlank: 'vide',
  valueTable: { one: 'table ({count} ligne)', other: 'table ({count} lignes)' },
  valueDate: 'date',
  valueColor: 'couleur',
  valueControl: 'contrôle {name}',
  valueRecord: 'enregistrement',

  // Noms de types
  typeChoice: 'Choix ({ns})',
  typeControl: 'Contrôle',
  typeScreen: 'Écran',
  typeEnumeration: 'Énumération',
};
