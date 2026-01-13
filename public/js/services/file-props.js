import { appState, FILE_PROPERTIES } from './store.js';


/**
 * Add property keys from `myObject` into `appState.myFilesProperties`.
 *
 * For each own key in `myObject`, if the key is not already present in
 * `appState.myFilesProperties` (a Map), this function adds an entry with
 * `{ name: key, order }`.
 *
 * Side effects: mutates `appState.myFilesProperties`.
 *
 * @param {Object} myObject - Source object whose keys become file property keys.
 * @param {number} [order=1] - Default order value for newly added properties.
 * @returns {void}
 */

export function updateMyFilesProperties(myObject, order = 1) {
    const newKeys = Object.keys(myObject);
    const currentProperties = appState.myFilesProperties;

    newKeys.forEach(key => {
        // Only proceed if the key is not already present
        if (!currentProperties.has(key)) {
            
            // check if the property is in the loopkup table... if it is load up all the keys and values to myFilesProperties
            if (FILE_PROPERTIES.has(key)) {
                // Get the existing property object
                const propObject = FILE_PROPERTIES.get(key);
                
                // Use spread syntax to copy all properties into a new object
                const subItems = { ...propObject };

                currentProperties.set(key, subItems);
            } else {
                // Fallback: Add the default entry if not found in FILE_PROPERTIES
                currentProperties.set(key, {
                    name: key,
                    order: order
                });
            }
        }
    });
}
