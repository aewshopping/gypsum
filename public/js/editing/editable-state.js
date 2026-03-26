let isCurrentVersion = true;

/**
 * Returns whether the modal is showing the current (editable) version of the file.
 * @returns {boolean}
 */
export function getIsCurrentVersion() {
    return isCurrentVersion;
}

/**
 * Sets whether the modal is showing the current (editable) version of the file.
 * @param {boolean} val
 * @returns {void}
 */
export function setIsCurrentVersion(val) {
    isCurrentVersion = val;
}
