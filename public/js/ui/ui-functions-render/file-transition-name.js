/**
 * Converts a file ID (filepath) to a valid CSS custom-ident for use as a view-transition-name.
 * @param {string} fileId - The file's unique ID (filepath).
 * @returns {string} A CSS custom-ident prefixed with "vt-".
 */
export function fileTransitionName(fileId) {
    return 'vt-' + fileId.replace(/[^a-zA-Z0-9]/g, '-');
}
