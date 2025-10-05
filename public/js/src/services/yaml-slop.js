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
    let lines = yamlString.split('\n');
    const separator = '---';

    // 1. Check for YAML document indicators (---) and extract the relevant section
    const firstSeparatorIndex = lines.findIndex(line => line.trim() === separator);

    // CRITICAL UPDATE: Stop parsing if '---' is not found or is found beyond the 5th line (index 5 or greater).
    if (firstSeparatorIndex === -1 || firstSeparatorIndex > 4) {
        // Return empty object if '---' is not present in the expected header region.
        return {};
    }

    // If we reach here, a valid starting '---' has been found (index 0-4).

    const secondSeparatorIndex = lines.findIndex(
        (line, index) => index > firstSeparatorIndex && line.trim() === separator
    );

    if (secondSeparatorIndex !== -1) {
        // Found both separators: extract content between them
        lines = lines.slice(firstSeparatorIndex + 1, secondSeparatorIndex);
    } else {
        // Only the first separator found (typical front-matter structure): extract content from there to the end
        lines = lines.slice(firstSeparatorIndex + 1);
    }
    // Now 'lines' holds only the front matter content to be parsed.


    const root = {};
    // The stack maintains the current object/array context, its indentation,
    // and the key that created this context.
    // Structure: [{ object: current_scope_object, indent: level, key: string | null }]
    const stack = [{ object: root, indent: -1, key: null }];

    /**
     * Attempts to coerce a string value into a native JavaScript type (number, boolean, null).
     * It also strips matching single or double quotes.
     * @param {string} value - The raw string value.
     * @returns {*} The coerced value or the original trimmed string.
     */
    const coerceValue = (value) => {
        let trimmed = value.trim();

        if (trimmed === 'null' || trimmed === '~') return null;
        if (trimmed === 'true') return true;
        if (trimmed === 'false') return false;

        // Check for Quoted Strings and strip quotes
        const firstChar = trimmed.charAt(0);
        const lastChar = trimmed.charAt(trimmed.length - 1);

        if (trimmed.length >= 2 && ((firstChar === '"' && lastChar === '"') || (firstChar === "'" && lastChar === "'"))) {
            // If the string is quoted, remove the quotes and re-trim (for cases like " value ")
            trimmed = trimmed.substring(1, trimmed.length - 1).trim();
        }

        // Check if it's a number, but ignore empty strings
        const numValue = Number(trimmed);
        if (!isNaN(numValue) && trimmed !== '') return numValue;
        
        return trimmed;
    };

    for (const line of lines) {
        // 1. Ignore empty lines, lines with only spaces, and comments
        const trimmedLine = line.trim();
        if (trimmedLine === '' || trimmedLine.startsWith('#')) {
            continue;
        }

        // 2. Calculate current indentation by counting leading spaces (Optimization: Avoids Regex on every line)
        let currentIndent = 0;
        while (currentIndent < line.length && line[currentIndent] === ' ') {
            currentIndent++;
        }

        // 3. Adjust context stack based on indentation (moving up the hierarchy)
        // Pop contexts that have equal or greater indentation
        while (stack.length > 1 && currentIndent <= stack[stack.length - 1].indent) {
            stack.pop();
        }

        const currentContext = stack[stack.length - 1];
        let targetScope = currentContext.object;

        // --- Optimization: Handle Key-Value Pair (Map) using string indexing instead of Regex ---
        const colonIndex = trimmedLine.indexOf(':');

        if (colonIndex !== -1) {
            // Key is substring before the colon
            const key = trimmedLine.substring(0, colonIndex).trim();
            // Value content is substring after the colon
            const valueContent = trimmedLine.substring(colonIndex + 1).trim();

            if (valueContent === '') {
                // It's a nested structure (new object/map)
                const newObject = {};
                targetScope[key] = newObject;
                // Push new context onto the stack, storing the key that created it
                stack.push({ object: newObject, indent: currentIndent, key: key });
            } else {
                // It's a scalar value
                targetScope[key] = coerceValue(valueContent);
            }

        // --- Handle List Item (Sequence) ---
        // Matches `- value`
        } else if (trimmedLine.startsWith('- ')) {
            const valueContent = trimmedLine.substring(2).trim();

            // The list item belongs to the context defined two levels up (parentContext),
            // using the key stored in the immediate currentContext.
            const currentContext = stack[stack.length - 1];
            const parentContext = stack[stack.length - 2];
            
            if (!parentContext) {
                 console.error(`[YAML Error] Root level list item unsupported: ${trimmedLine}`);
                 continue;
            }

            // Retrieve the key directly from the current context object on the stack
            const keyToUpdate = currentContext.key; 

            if (keyToUpdate) {
                let arrayRef = parentContext.object[keyToUpdate];

                // If the value hasn't been converted to an array yet, do so now.
                if (!Array.isArray(arrayRef)) {
                    arrayRef = [];
                    parentContext.object[keyToUpdate] = arrayRef;
                    // Update the stack to point to the new array
                    stack[stack.length - 1].object = arrayRef;
                }

                if (valueContent === '') {
                    // Nested object inside a list item (e.g., `-\n  subkey: value`).
                    const newObject = {};
                    arrayRef.push(newObject);
                    // Push the new object context onto the stack
                    stack.push({ object: newObject, indent: currentIndent, key: null }); // Nested list item object doesn't have a map key
                } else {
                    // Simple value
                    arrayRef.push(coerceValue(valueContent));
                }
            } else {
                 console.error(`[YAML Error] Failed to find parent key for list item: ${trimmedLine}`);
            }

        } else {
            // Unrecognized line format
            console.warn(`[YAML Warning] Skipping unrecognized line: ${trimmedLine}`);
        }
    }

    return root;
};
