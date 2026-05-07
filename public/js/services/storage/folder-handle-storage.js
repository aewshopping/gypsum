const DB_NAME = 'gypsum';
const STORE_NAME = 'saved_folder';
const KEY = 'handle';

/**
 * @returns {Promise<IDBDatabase>}
 */
function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = e => e.target.result.createObjectStore(STORE_NAME);
        req.onsuccess = e => resolve(e.target.result);
        req.onerror = e => reject(e.target.error);
    });
}

/**
 * Persists a directory handle to IndexedDB.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @returns {Promise<void>}
 */
export async function saveHandle(dirHandle) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(dirHandle, KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = e => reject(e.target.error);
    });
}

/**
 * Retrieves the persisted directory handle from IndexedDB.
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
export async function loadSavedHandle() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(KEY);
        req.onsuccess = e => resolve(e.target.result ?? null);
        req.onerror = e => reject(e.target.error);
    });
}

/**
 * Removes the persisted directory handle from IndexedDB.
 * @returns {Promise<void>}
 */
export async function clearSavedHandle() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = e => reject(e.target.error);
    });
}
