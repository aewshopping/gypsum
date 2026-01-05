/**
 * Simple YAML Parser - vibe coded by google gemini 30 Sept 2025
 * A lightweight YAML parser for basic front-matter extraction.
 * I could switch this out for a better library later if needed but for now this is fine, and I want to keep file size down.
 *
 * This ES module exports a function to parse basic YAML into a JavaScript object.
 * It supports maps (key: value), nested objects via indentation, basic sequences (- item),
 * and coercion for null, boolean, and number types.
 *
 * IMPORTANT: Only parses the content found between the first two '---' lines.
 * If the starting '---' is not found within the first 5 lines (indices 0-4), parsing stops,
 * and an empty object ({}) is returned.
 *
 * @param {string} yamlString - The raw YAML content.
 * @returns {object} The parsed JavaScript object.
 */
export const parseYaml = (yamlString) => {
  let lines = yamlString.split("\n");
    const separator = "---";

    const firstSeparatorIndex = lines.findIndex((line) => line.trim() === separator);

    if (firstSeparatorIndex === -1 || firstSeparatorIndex > 4) {
      return {};
    }

    const secondSeparatorIndex = lines.findIndex(
      (line, index) => index > firstSeparatorIndex && line.trim() === separator
    );

    // Check if the separators are on the first and subsequent lines.
    if (firstSeparatorIndex !== 0 || secondSeparatorIndex === -1) {
      return {};
    }

    lines = lines.slice(firstSeparatorIndex + 1, secondSeparatorIndex);

    const root = {};
    const stack = [{ object: root, indent: -1, key: null }];
	const coerceValue = (value) => {
	  let trimmed = value.trim();

	  // 1. Handle explicit types (null, true, false)
	  if (trimmed === "null" || trimmed === "~") return null;
	  if (trimmed === "true") return true;
	  if (trimmed === "false") return false;

	  const firstChar = trimmed.charAt(0);
	  const lastChar = trimmed.charAt(trimmed.length - 1);
	  
	  // 2. CHECK FOR QUOTES (The critical change)
	  const isQuoted = trimmed.length >= 2 && 
					   (firstChar === '"' && lastChar === '"' || firstChar === "'" && lastChar === "'");

	  if (isQuoted) {
		// If it was quoted, remove the quotes and return the result AS A STRING.
		// This bypasses the number coercion step below.
		return trimmed.substring(1, trimmed.length - 1).trim();
	  }

	  // 3. Coerce to Number (Only if it wasn't quoted)
	  const numValue = Number(trimmed);
	  if (!isNaN(numValue) && trimmed !== "") return numValue;

	  // 4. Fallback to original string
	  return trimmed;
	};
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine === "" || trimmedLine.startsWith("#")) {
        continue;
      }
      let currentIndent = 0;
      while (currentIndent < line.length && line[currentIndent] === " ") {
        currentIndent++;
      }
      while (stack.length > 1 && currentIndent <= stack[stack.length - 1].indent) {
        stack.pop();
      }
      const currentContext = stack[stack.length - 1];
      let targetScope = currentContext.object;
      const colonIndex = trimmedLine.indexOf(":");
      if (colonIndex !== -1) {
        const key = trimmedLine.substring(0, colonIndex).trim();
        const valueContent = trimmedLine.substring(colonIndex + 1).trim();
        if (valueContent === "") {
          const newObject = {};
          targetScope[key] = newObject;
          stack.push({ object: newObject, indent: currentIndent, key });
        } else {
          targetScope[key] = coerceValue(valueContent);
        }
      } else if (trimmedLine.startsWith("- ")) {
        const valueContent = trimmedLine.substring(2).trim();
        const currentContext2 = stack[stack.length - 1];
        const parentContext = stack[stack.length - 2];
        if (!parentContext) {
          console.error(`[YAML Error] Root level list item unsupported: ${trimmedLine}`);
          continue;
        }
        const keyToUpdate = currentContext2.key;
        if (keyToUpdate) {
          let arrayRef = parentContext.object[keyToUpdate];
          if (!Array.isArray(arrayRef)) {
            arrayRef = [];
            parentContext.object[keyToUpdate] = arrayRef;
            stack[stack.length - 1].object = arrayRef;
          }
          if (valueContent === "") {
            const newObject = {};
            arrayRef.push(newObject);
            stack.push({ object: newObject, indent: currentIndent, key: null });
          } else {
            arrayRef.push(coerceValue(valueContent));
          }
        } else {
          console.error(`[YAML Error] Failed to find parent key for list item: ${trimmedLine}`);
        }
      } else {
        console.warn(`[YAML Warning] Skipping unrecognized line: ${trimmedLine}`);
      }
    }
    return root;
  };