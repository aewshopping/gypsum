/**
 * @file The save button's arrow spin, shared by the two buttons that save something.
 *
 * The arrow lives inside the #icon-save symbol, so both buttons that <use> it hold the same
 * element and spin together. Only ever one of them is on screen — the content modal's save button
 * is inside that modal, and the table's control row is behind it — so the shared spin is not
 * visible as one, and giving each its own copy of the glyph would be a lot of path data to avoid
 * something nobody can see.
 */

/** How long the spin runs. Callers that swap the glyph afterwards wait this long first. */
export const SAVE_SPIN_MS = 900;

/**
 * Spins the arrow in the save glyph once.
 * @returns {void}
 */
export function spinSaveArrow() {
    const arrow = document.getElementById('save-disk-arrow');
    arrow?.classList.add('spinning');
    setTimeout(() => arrow?.classList.remove('spinning'), SAVE_SPIN_MS);
}
