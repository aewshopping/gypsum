import { appState } from '../store.js';
import { resolveNoteName } from './note-name-index.js';

/**
 * Checks every file's [[internal links]] against the loaded files and records the ones that
 * name nothing. Run once per load, after appState.myFiles is populated and the note-name
 * index has been invalidated — the link targets were already collected during parsing, so
 * this is a map lookup per link and nothing more.
 *
 * The count is folded into the existing errorOnLoad string rather than a property of its own,
 * so the property search finds broken links exactly as it finds yaml problems. A file with
 * both faults carries both segments and answers to both searches.
 *
 * @returns {number} how many files have at least one broken link
 */
export function verifyInternalLinks() {
    let filesWithBrokenLinks = 0;

    for (const file of appState.myFiles) {
        let broken = 0;
        for (const target of file.internalLink) {
            if (resolveNoteName(target) === null) broken++;
        }
        if (broken === 0) continue;

        filesWithBrokenLinks++;
        // The "links" prefix is what the load-message nudge filters on, the way "yaml" is —
        // see load-progress-finish.js.
        const summary = `links: ${broken} broken`;
        file.errorOnLoad = file.errorOnLoad ? `${file.errorOnLoad} | ${summary}` : summary;
    }

    return filesWithBrokenLinks;
}
