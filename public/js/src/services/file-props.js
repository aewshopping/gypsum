import { appState } from './store.js';

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
