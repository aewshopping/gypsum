import { appState } from './store.js';

export function updateMyFileProperties(myObject, order=1) {

    const newKeys = Object.keys(myObject);

    newKeys.forEach(key => {
        if (!appState.myFilesProperties.has(key)) {
            appState.myFilesProperties.set(key, order);
        }
    });

}
