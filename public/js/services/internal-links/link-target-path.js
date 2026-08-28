/**
 * @file Turns the raw text inside [[...]] into the filepath of the note it names.
 * Pure: no DOM, no filesystem. Used when creating a note that a link points at.
 */
import { VALID_EXTENSIONS, FORBIDDEN_IN_FILENAME, normaliseFolder } from '../../editing/rename-validate.js';

/**
 * Normalises a link target into the path of the file it would be created at.
 * Slash-separated segments become folders, and a target written without a supported
 * extension is treated as '.txt' — so '[[contacts/friends/bob]]' names
 * 'contacts/friends/bob.txt'. Segments are trimmed, so a spaced-out
 * '[[contacts / friends / bob]]' works too.
 *
 * @param {string} target - Raw link target, already stripped of any '|alias' part.
 * @returns {{folder: string, filename: string, filepath: string}|null} null when the
 *   target names nothing creatable — an empty name, a dot-prefixed (hidden) name or
 *   folder, '.'/'..', or a backslash or control character in the filename.
 */
export function linkTargetToFilepath(target) {
    const segments = (target ?? '').split('/').map(segment => segment.trim()).filter(segment => segment !== '');
    if (!segments.length) return null;

    let filename = segments.pop();
    if (!VALID_EXTENSIONS.some(ext => filename.toLowerCase().endsWith(ext))) filename += '.txt';
    if (filename.startsWith('.') || FORBIDDEN_IN_FILENAME.test(filename)) return null;

    const folder = normaliseFolder(segments.join('/'));
    if (folder === null) return null;

    return { folder, filename, filepath: folder ? `${folder}/${filename}` : filename };
}
