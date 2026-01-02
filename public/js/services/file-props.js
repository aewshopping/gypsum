import { appState } from './store.js';

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

export function updateMyFileProperties(myObject, order=1) {

    const newKeys = Object.keys(myObject);

    // only update for new items
    newKeys.forEach(key => {
        if (!appState.myFilesProperties.has(key)) {
            appState.myFilesProperties.set(key, { 
                name: key, // Using the key as a placeholder name
                order: order 
            });
        }
    });

}
