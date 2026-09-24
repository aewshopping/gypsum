import { appState } from '../store.js';
import { resolveNoteName } from '../internal-links/note-name-index.js';

/**
 * @file Owns fileIssues: every check that can flag a file, and the string they share.
 *
 * One segment per check, joined with ' | ' and led by the word the property search filters
 * on — 'yaml: 2 lines skipped | links: 1 broken' answers to both fileIssues:yaml and
 * fileIssues:links, and is what the load-message nudges click through to.
 *
 * Checks come in two kinds, and a third source:
 *   - parse-time, needing detail that exists only while the file is being read (yaml).
 *     file-info.js calls these as it builds the object, so they are recomputed on every
 *     rebuild and never go stale.
 *   - collection-time, needing the other loaded files (links). These cannot run while the
 *     first file is still being parsed, so checkFileErrors runs them afterwards.
 *   - the session: an undo that refused this note (undo). Not about the text at all, so it is held
 *     in appState.undoRefusals and drawn from there by checkFileErrors, like a collection-time one.
 *
 * To add a check: write a segment function returning its text or null, call it from whichever
 * of the two kinds it belongs to, and give it a distinct leading word. Search and the nudges
 * follow from that word; nothing else needs wiring.
 */

/** The prefix parseYaml gives a repeated key's error, which is counted apart from skipped lines. */
const DUPLICATE_PREFIX = 'duplicate key: ';

/**
 * Summarises what the YAML front matter got wrong. Parse-time: the detail it reports is gone
 * by the time the file object exists, so file-info.js calls this while it still has it.
 *
 * A duplicated key is worded apart from a skipped line, because nothing was skipped: the parser
 * read it and says so. Both still lead with `yaml:`, so hasYamlError and the load nudge need no
 * change to find either.
 *
 * @param {string[]} parseErrors - reasons collected by parseYaml, one per problem it met.
 * @param {string[]} shadowedKeys - reserved keys that were dropped from the front matter.
 * @returns {string|null} A short summary, or null when the front matter read cleanly.
 */
export function yamlSegment(parseErrors, shadowedKeys) {
    const duplicates = parseErrors.filter(reason => reason.startsWith(DUPLICATE_PREFIX));
    const skipped = parseErrors.length - duplicates.length;

    const parts = [];
    if (skipped > 0) {
        parts.push(`${skipped} line${skipped === 1 ? '' : 's'} skipped`);
    }
    if (duplicates.length > 0) {
        const names = [...new Set(duplicates.map(reason => `"${reason.slice(DUPLICATE_PREFIX.length)}"`))];
        parts.push(`${duplicates.length} duplicate key${duplicates.length === 1 ? '' : 's'} ${names.join(', ')}`);
    }
    if (shadowedKeys.length > 0) {
        const names = shadowedKeys.map(key => `"${key}"`).join(', ');
        parts.push(`key${shadowedKeys.length === 1 ? '' : 's'} ${names} ignored`);
    }
    return parts.length === 0 ? null : `yaml: ${parts.join(', ')}`;
}

/**
 * Whether a file's front matter did not read cleanly — a line the parser skipped, a key written
 * twice, or a key the app reserves that was dropped.
 *
 * Here rather than beside the table, because the leading word is this file's convention: every
 * segment the yaml check writes starts with 'yaml', which is what makes this a lookup rather than a
 * second opinion about what counts as broken.
 *
 * It is what locks a note's front matter cells until it is fixed in the note — see §7 of
 * plans/completed/table-cell-writing.md. The writing path asks the parser itself rather than asking this,
 * because by then it has the file's current bytes in hand and this answer is as old as the load.
 *
 * @param {object} file - A file object from appState.myFiles.
 * @returns {boolean}
 */
export function hasYamlError(file) {
    return hasIssue(file, 'yaml');
}

/**
 * Whether a file's issues carry a segment of this kind. By the segment's leading word, never by a
 * substring of the whole string: a later segment's text — a property name in an undo refusal, say —
 * could contain the word and make a count claim a file it does not have.
 *
 * @param {object} file - A file object from appState.myFiles.
 * @param {string} kind - The segment's leading word: 'yaml', 'links' or 'undo'.
 * @returns {boolean}
 */
export function hasIssue(file, kind) {
    return (file.fileIssues ?? '').split(' | ').some(segment => segment.startsWith(`${kind}:`));
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
 * Says the most recent undo or redo left this note alone, and which one. Neither parse-time nor
 * collection-time: a fact about the session, held in appState.undoRefusals and drawn from there on
 * every rebuild, so it survives a re-read. plans/table-delete-column.md §10.5.
 * @param {object} file - A file object from appState.myFiles.
 * @returns {string|null}
 */
function undoSegment(file) {
    const refusal = appState.undoRefusals.get(file.internalId);
    return refusal ? `undo: ${refusal.count} refused (${refusal.name})` : null;
}

/**
 * Re-runs the collection-time checks over one file and rewrites its fileIssues. Call it
 * wherever a file object is built or rebuilt. Safe to re-run: each segment is replaced
 * rather than appended, so a count can fall or clear — fixing one of two broken links
 * leaves 'links: 1 broken' instead of wiping the lot.
 * @param {object} file - A file object from appState.myFiles.
 * @returns {void}
 */
export function checkFileErrors(file) {
    // Parse-time segments are already fresh: file-info.js rewrites them on every rebuild.
    // Only the collection-time segments listed below are recomputed here.
    const kept = (file.fileIssues ?? '')
        .split(' | ')
        .filter(segment => segment.startsWith('yaml:'));

    const segments = [...kept, linkSegment(file), undoSegment(file)].filter(Boolean);
    file.fileIssues = segments.length > 0 ? segments.join(' | ') : null;
}

/**
 * checkFileErrors for every loaded file, for the loaders to call once all files are in.
 * @returns {void}
 */
export function checkAllFileErrors() {
    for (const file of appState.myFiles) checkFileErrors(file);
}
