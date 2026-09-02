import { appState } from '../store.js';
import { resolveNoteName } from '../internal-links/note-name-index.js';

/**
 * @file Owns errorOnLoad: every check that can flag a file, and the string they share.
 *
 * One segment per check, joined with ' | ' and led by the word the property search filters
 * on — 'yaml: 2 lines skipped | links: 1 broken' answers to both errorOnLoad:yaml and
 * errorOnLoad:links, and is what the load-message nudges click through to.
 *
 * Checks come in two kinds:
 *   - parse-time, needing detail that exists only while the file is being read (yaml).
 *     file-info.js calls these as it builds the object, so they are recomputed on every
 *     rebuild and never go stale.
 *   - collection-time, needing the other loaded files (links). These cannot run while the
 *     first file is still being parsed, so checkFileErrors runs them afterwards.
 *
 * To add a check: write a segment function returning its text or null, call it from whichever
 * of the two kinds it belongs to, and give it a distinct leading word. Search and the nudges
 * follow from that word; nothing else needs wiring.
 */

/**
 * Summarises what the YAML front matter got wrong. Parse-time: the detail it reports is gone
 * by the time the file object exists, so file-info.js calls this while it still has it.
 * @param {string[]} skippedLines - reasons collected by parseYaml, one per unreadable line.
 * @param {string[]} shadowedKeys - reserved keys that were dropped from the front matter.
 * @returns {string|null} A short summary, or null when the front matter read cleanly.
 */
export function yamlSegment(skippedLines, shadowedKeys) {
    const parts = [];
    if (skippedLines.length > 0) {
        parts.push(`${skippedLines.length} line${skippedLines.length === 1 ? '' : 's'} skipped`);
    }
    if (shadowedKeys.length > 0) {
        const names = shadowedKeys.map(key => `"${key}"`).join(', ');
        parts.push(`key${shadowedKeys.length === 1 ? '' : 's'} ${names} ignored`);
    }
    return parts.length === 0 ? null : `yaml: ${parts.join(', ')}`;
}

/**
 * Counts the file's [[internal links]] that name no loaded file. Collection-time: the link
 * targets were already gathered during parsing, so this is a lookup per link and no more.
 * @param {object} file - A file object from appState.myFiles.
 * @returns {string|null} A short summary, or null when every link resolves.
 */
function linkSegment(file) {
    let broken = 0;
    for (const target of file.internalLink) {
        if (resolveNoteName(target) === null) broken++;
    }
    return broken === 0 ? null : `links: ${broken} broken`;
}

/**
 * Re-runs the collection-time checks over one file and rewrites its errorOnLoad. Call it
 * wherever a file object is built or rebuilt. Safe to re-run: each segment is replaced
 * rather than appended, so a count can fall or clear — fixing one of two broken links
 * leaves 'links: 1 broken' instead of wiping the lot.
 * @param {object} file - A file object from appState.myFiles.
 * @returns {void}
 */
export function checkFileErrors(file) {
    // Parse-time segments are already fresh: file-info.js rewrites them on every rebuild.
    // Only the collection-time segments listed below are recomputed here.
    const kept = (file.errorOnLoad ?? '')
        .split(' | ')
        .filter(segment => segment.startsWith('yaml:'));

    const segments = [...kept, linkSegment(file)].filter(Boolean);
    file.errorOnLoad = segments.length > 0 ? segments.join(' | ') : null;
}

/**
 * checkFileErrors for every loaded file, for the loaders to call once all files are in.
 * @returns {void}
 */
export function checkAllFileErrors() {
    for (const file of appState.myFiles) checkFileErrors(file);
}
