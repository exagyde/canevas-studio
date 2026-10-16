// Émulateur Power Fx : erreurs de syntaxe et d’exécution (anglais)
export default {
  // Analyse lexicale
  unterminatedComment: 'Unterminated comment (missing */)',
  unterminatedString: 'Unterminated text string (missing ")',
  unterminatedIdentifier: "Unterminated identifier (missing ')",
  unexpectedChar: 'Unexpected character “{char}”',
  unterminatedInterpolation: 'Unterminated interpolated expression (missing })',
  unterminatedInterpolatedString: 'Unterminated interpolated string',

  // Analyse syntaxique : jeton attendu (« Found » : autre jeton trouvé ; « Eof » : fin de formule atteinte)
  expectedFound: 'Expected “{token}” but found “{found}”',
  expectedEof: 'Expected “{token}” (reached the end of the formula)',
  expectedCloseCallFound: 'Expected “{token}” to close the call to {name} but found “{found}”',
  expectedCloseCallEof: 'Expected “{token}” to close the call to {name} (reached the end of the formula)',
  expectedCloseParenFound: 'Expected “{token}” to close the parenthesis but found “{found}”',
  expectedCloseParenEof: 'Expected “{token}” to close the parenthesis (reached the end of the formula)',
  expectedCloseTableFound: 'Expected “{token}” to close the table but found “{found}”',
  expectedCloseTableEof: 'Expected “{token}” to close the table (reached the end of the formula)',
  expectedCloseRecordFound: 'Expected “{token}” to close the record but found “{found}”',
  expectedCloseRecordEof: 'Expected “{token}” to close the record (reached the end of the formula)',
  expectedAfterFieldFound: 'Expected “{token}” after the field name “{field}” but found “{found}”',
  expectedAfterFieldEof: 'Expected “{token}” after the field name “{field}” (reached the end of the formula)',

  // Analyse syntaxique : autres erreurs
  unexpectedToken: 'Unexpected token “{token}”',
  nameExpectedAfterAs: 'Expected a name after “As”',
  memberNameExpected: 'Expected a property or field name after “.”',
  unexpectedKeyword: 'Unexpected keyword “{keyword}”',
  nameExpectedAfterAt: 'Expected a name after “[@”',
  unexpectedOperator: 'Unexpected operator “{operator}”',
  unexpectedEnd: 'Unexpected end of formula: an expression was expected',
  fieldNameExpected: 'Expected a field name in the record',

  // Exécution
  cannotConvertToNumber: 'The value “{value}” cannot be converted to a number',
  notANumber: 'Non-numeric value ({value})',
  divisionByZero: 'Division by zero',
  averageOfEmptyTable: 'Division by zero (Average of an empty table)',
  unknownNode: 'Unknown node {type}',
  unknownOperator: 'Unknown operator {operator}',
  infiniteLoop: 'Infinite loop detected',
  invalidRegex: 'Invalid regular expression: {details}',
  notABoolean: 'The value “{value}” is not a Boolean',
  invalidGuid: 'Invalid GUID: {value}',
  invalidJson: 'Invalid JSON: {details}',
  indexOutOfRange: 'Index {index} is out of range (1..{max})',
  invalidColor: 'Invalid color: {value}',
  setNeedsVariable: 'Set: the first argument must be a variable name',
  /** Message de Error() sans texte */
  errorDefault: 'Error',
  /** User().FullName sans utilisateur configuré */
  defaultUserName: 'User',

  // Description courte d’une valeur (messages d’erreur, volet Variables)
  valueBlank: 'blank',
  valueTable: { one: 'table ({count} row)', other: 'table ({count} rows)' },
  valueDate: 'date',
  valueColor: 'color',
  valueControl: 'control {name}',
  valueRecord: 'record',

  // Noms de types
  typeChoice: 'Choice ({ns})',
  typeControl: 'Control',
  typeScreen: 'Screen',
  typeEnumeration: 'Enumeration',
};
