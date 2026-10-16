// Émulateur Power Fx : erreurs de syntaxe et d’exécution (espagnol)
export default {
  // Analyse lexicale
  unterminatedComment: 'Comentario sin cerrar (falta */)',
  unterminatedString: 'Cadena de texto sin cerrar (falta ")',
  unterminatedIdentifier: "Identificador sin cerrar (falta ')",
  unexpectedChar: 'Carácter inesperado «{char}»',
  unterminatedInterpolation: 'Expresión interpolada sin cerrar (falta })',
  unterminatedInterpolatedString: 'Cadena interpolada sin cerrar',

  // Analyse syntaxique : jeton attendu (« Found » : autre jeton trouvé ; « Eof » : fin de formule atteinte)
  expectedFound: 'Se esperaba «{token}», pero se encontró «{found}»',
  expectedEof: 'Se esperaba «{token}» (se alcanzó el final de la fórmula)',
  expectedCloseCallFound: 'Se esperaba «{token}» para cerrar la llamada a {name}, pero se encontró «{found}»',
  expectedCloseCallEof: 'Se esperaba «{token}» para cerrar la llamada a {name} (se alcanzó el final de la fórmula)',
  expectedCloseParenFound: 'Se esperaba «{token}» para cerrar el paréntesis, pero se encontró «{found}»',
  expectedCloseParenEof: 'Se esperaba «{token}» para cerrar el paréntesis (se alcanzó el final de la fórmula)',
  expectedCloseTableFound: 'Se esperaba «{token}» para cerrar la tabla, pero se encontró «{found}»',
  expectedCloseTableEof: 'Se esperaba «{token}» para cerrar la tabla (se alcanzó el final de la fórmula)',
  expectedCloseRecordFound: 'Se esperaba «{token}» para cerrar el registro, pero se encontró «{found}»',
  expectedCloseRecordEof: 'Se esperaba «{token}» para cerrar el registro (se alcanzó el final de la fórmula)',
  expectedAfterFieldFound: 'Se esperaba «{token}» después del nombre de campo «{field}», pero se encontró «{found}»',
  expectedAfterFieldEof: 'Se esperaba «{token}» después del nombre de campo «{field}» (se alcanzó el final de la fórmula)',

  // Analyse syntaxique : autres erreurs
  unexpectedToken: 'Token inesperado «{token}»',
  nameExpectedAfterAs: 'Se esperaba un nombre después de «As»',
  memberNameExpected: 'Se esperaba un nombre de propiedad o de campo después de «.»',
  unexpectedKeyword: 'Palabra clave inesperada «{keyword}»',
  nameExpectedAfterAt: 'Se esperaba un nombre después de «[@»',
  unexpectedOperator: 'Operador inesperado «{operator}»',
  unexpectedEnd: 'Final de fórmula inesperado: se esperaba una expresión',
  fieldNameExpected: 'Se esperaba un nombre de campo en el registro',

  // Exécution
  cannotConvertToNumber: 'El valor «{value}» no se puede convertir en un número',
  notANumber: 'Valor no numérico ({value})',
  divisionByZero: 'División por cero',
  averageOfEmptyTable: 'División por cero (Average de una tabla vacía)',
  unknownNode: 'Nodo desconocido {type}',
  unknownOperator: 'Operador desconocido {operator}',
  infiniteLoop: 'Se detectó un bucle infinito',
  invalidRegex: 'Expresión regular no válida: {details}',
  notABoolean: 'El valor «{value}» no es un booleano',
  invalidGuid: 'GUID no válido: {value}',
  invalidJson: 'JSON no válido: {details}',
  indexOutOfRange: 'El índice {index} está fuera del intervalo (1..{max})',
  invalidColor: 'Color no válido: {value}',
  setNeedsVariable: 'Set: el primer argumento debe ser un nombre de variable',
  /** Message de Error() sans texte */
  errorDefault: 'Error',
  /** User().FullName sans utilisateur configuré */
  defaultUserName: 'Usuario',

  // Description courte d’une valeur (messages d’erreur, volet Variables)
  valueBlank: 'vacío',
  valueTable: { one: 'tabla ({count} fila)', other: 'tabla ({count} filas)' },
  valueDate: 'fecha',
  valueColor: 'color',
  valueControl: 'control {name}',
  valueRecord: 'registro',

  // Noms de types
  typeChoice: 'Opción ({ns})',
  typeControl: 'Control',
  typeScreen: 'Pantalla',
  typeEnumeration: 'Enumeración',
};
