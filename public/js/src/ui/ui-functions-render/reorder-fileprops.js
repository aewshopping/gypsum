import { appState } from '../../services/store.js';

export function reOrderMap() {

    const filePropertiesMap = appState.myFilesProperties;

    // Convert map to array, reorder by "order" then update the map with this order
    // Convert Map entries ([id, properties] pairs) to an array of objects to allow sorting
    const fileArray = [...filePropertiesMap.entries()].map(([id, properties]) => ({
        id,
        ...properties
    }));

    // Sort the Array by 'order' ascending (asc)
    fileArray.sort((a, b) => a.order - b.order);

    // delete old map so we can insert values in correct order
    filePropertiesMap.clear();

    // Update/Re-index the original Map
    // Iterates over the sorted array and modifies the original Map items by reference
    fileArray.forEach((file, index) => {
        const newOrder = index + 1; // New order starts from 1
        file.order = newOrder;
        
        // Get the object reference from the Map and update its 'order' property
        filePropertiesMap.set(file.id, file);
    });

    console.log(filePropertiesMap);

}