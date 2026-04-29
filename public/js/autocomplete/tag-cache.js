import { appState } from '../services/store.js';

let _cache = null;

/**
 * Returns a flat array of all unique child tag names from appState.myParentMap.
 * Uses the 'all' key, which contains every child tag exactly once regardless of
 * whether it also appears under a named parent — so '#brie' and '#cheese/brie'
 * both contribute 'brie', not a duplicate 'cheese/brie' entry.
 * Result is cached until invalidateTagCache() is called.
 * @returns {string[]}
 */
export function getTagArray() {
    if (_cache) return _cache;
    _cache = [...(appState.myParentMap.get('all')?.keys() ?? [])];
    return _cache;
}

/**
 * Marks the cache stale. Call after appState.myParentMap is rebuilt.
 * @returns {void}
 */
export function invalidateTagCache() { _cache = null; }
