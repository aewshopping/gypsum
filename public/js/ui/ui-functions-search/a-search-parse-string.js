/**
 * Parses a string using basic string methods.
 * Ensures the operator is at index 1 or later (2nd position or later).
 * @param {string} parseSearchString - The string to be parsed.
 * @returns {object} - { property, value, operator }
 */
export function parseSearchString(searchString, propOverride = "") {
  // Array of possible operators for future expansion
  const operators = [':', '=']; // in future this will be a longer list
  const containsOperators = [':', '=']; // so we can normalise to a consistent ":""
  
  if (propOverride) {
    return {
      property: propOverride,
      value: searchString,
      operator: ":"
    }
  }

  let foundOperator = null;
  let firstIndex = -1;

  for (const op of operators) {
    const index = searchString.indexOf(op);
    
    // index > 0 ensures the operator is NOT the first character
    if (index > 0 && (firstIndex === -1 || index < firstIndex)) {
      firstIndex = index;
      foundOperator = op;
    }
  }

  // Fallback if no operator is found or if it was at the very start
  if (foundOperator === null) {
    return {
      property: "allProperties",
      value: searchString,
      operator: ":" // default
    };
  }

  // Normalization logic: if the found operator is a "contains" type ie "=" or ":", convert to ":"
  const normalizedOperator = containsOperators.includes(foundOperator) 
    ? ":" 
    : foundOperator;

  return {
    property: searchString.substring(0, firstIndex),
    value: searchString.substring(firstIndex + foundOperator.length),
    operator: normalizedOperator
  };
}