import { INFO_TYPE } from '../../constants.js';
import { isInfoColumn, isPropertyEditable } from '../../services/property-type.js';

/**
 * @file The mark a column wears to say what it holds, and whether the app owns it.
 *
 * One builder for the two places a column is listed — the table header and the column picker —
 * because they answer the same two questions and must not answer them differently. The picker
 * drew a plain type glyph on every row while the header drew a padlock on the locked ones, so a
 * column the app fills in looked settable in one place and locked in the other.
 */

/**
 * How far each type's drawing moves up and left on a locked column, freeing the bottom-right corner
 * for the padlock.
 *
 * A number per type because each drawing fills its box differently — the calendar and the list reach
 * the bottom right, the T and the i do not. Chosen by eye against the plain glyphs, magnified and at
 * the size the header draws them.
 *
 * **A new type needs an entry here** as well as its `#icon-type-<name>` symbol.
 */
const LOCK_SHIFT = {
    string:   '-6 -4',
    number:   '-7 -5',
    date:     '-6 -7',
    datetime: '-4 -6',
    array:    '-6 -7',
    info:     '-6 -4',
};

/**
 * The glyph a column wears, which answers two questions in one mark.
 *
 * **Which drawing**: the column's own type, unless the app fills the column in, in which case the
 * info glyph says so — the type underneath is unchanged and still drives sorting and rendering.
 *
 * **Whether it is locked**: a column whose type is the app's wears the same drawing moved up and
 * left, with the padlock laid over the corner that frees. Composed here from the two symbols rather
 * than drawn as a combined symbol per type, so the padlock exists once and a type's shape once.
 *
 * **One element either way**, which is the point of a badge rather than a second glyph: a padlock
 * beside the type glyph made the header carry a heading and three marks, and `lastModified` had to
 * widen 20px to hold them. The type drawing is never scaled, so the mark measures the same on a
 * locked column as on an open one.
 *
 * The locked question is `isPropertyEditable()`, the same one cell-editor.js asks before giving a
 * caret and the same one the picker asks before offering the type dialog, so the mark and the
 * behaviour cannot drift apart.
 *
 * The type `<use>` comes first because column-type-set.js redraws the glyph with
 * `querySelector('.type-glyph use')` — the drawing is what changes, and the padlock never does. It
 * only ever runs on an unlocked column, which has no second `<use>` anyway.
 *
 * The viewBox is what the shift and the badge's own coordinates are measured in, so it is declared
 * rather than left to the symbol: both `<use>` elements have to land in the same 50×50 space.
 *
 * @param {object} column - The column, carrying `name` and `type`.
 * @param {string} className - The caller's own class, which sizes and colours the mark.
 * @param {string} [lockedTip] - A tooltip for the locked variant. The header wants one, because its
 *   cell's own tip says nothing about it; the picker does not, because its button already carries a
 *   fuller one and a data-tip here would win over it — tooltip.js resolves with
 *   closest('[data-tip]').
 * @returns {string} The HTML for the glyph.
 */
export function typeGlyph(column, className, lockedTip = '') {
    const glyph = isInfoColumn(column.name) ? INFO_TYPE.value : column.type;
    const open = `<svg class="type-glyph ${className}" viewBox="0 0 50 50" aria-hidden="true"`;

    if (isPropertyEditable(column.name)) {
        return `${open}><use href="#icon-type-${glyph}"></use></svg>`;
    }

    return `${open}${lockedTip ? ` data-tip="${lockedTip}"` : ''}>` +
             `<use href="#icon-type-${glyph}" transform="translate(${LOCK_SHIFT[glyph]})"></use>` +
             `<use href="#icon-lock-badge"></use></svg>`;
}
