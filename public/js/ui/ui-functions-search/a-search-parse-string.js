/**
 * Parses a search string into a property, an operator, and a search value.
 * Supports an optional property override (e.g., when searching for a specific tag).
 * @param {string} searchString - The raw search string from the UI.
 * @param {string} [propOverride=""] - An optional property to force (e.g., "tags" or "content").
 * @returns {{property: string, value: string, operator: string}} An object containing the parsed search components.
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