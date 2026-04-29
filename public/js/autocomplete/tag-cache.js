import { appState } from '../services/store.js';

let _cache = null;

/**
 * Returns a flat array of all completable tag strings built from appState.myParentMap.
 * Format: 'parent/child' for parented tags, bare child name for orphans.
 * Result is cached until invalidateTagCache() is called.
 * @returns {string[]}
 */
export function getTagArray() {
    if (_cache) return _cache;

    const out = [];
    for (const [parent, childMap] of appState.myParentMap) {
        if (parent === 'orphan') {
            for (const child of childMap.keys()) out.push(child);
        } else if (parent !== 'all') {
            for (const child of childMap.keys()) out.push(`${parent}/${child}`);
        }
    }
    _cache = out;
    return _cache;
}

/**
 * Marks the cache stale. Call after appState.myParentMap is rebuilt.
 * @returns {void}
 */
export function invalidateTagCache() { _cache = null; }
