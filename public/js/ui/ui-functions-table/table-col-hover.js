let _rule = null;   // { sheet, index } — lazy-initialised on first hover
let _activeProp = null;

/**
 * Finds the column-hover CSS rule by its unique selector fragment.
 * The combination .note-table-header ~ .note-table appears only in this rule.
 * Works in development (separate CSS files) and the bundled single-file build.
 * @returns {{ sheet: CSSStyleSheet, index: number }|null}
 */
function findColHoverRule() {
    for (const sheet of document.styleSheets) {
        try {
            for (let i = 0; i < sheet.cssRules.length; i++) {
                if (sheet.cssRules[i].selectorText?.includes('.note-table-header ~ .note-table')) {
                    return { sheet, index: i };
                }
            }
        } catch (_) { /* cross-origin sheet — skip */ }
    }
    return null;
}

/**
 * Replaces the placeholder rule's attribute-value with the hovered column's prop name,
 * or restores the empty-string sentinel when the pointer leaves all headers.
 * @param {string|null} prop
 */
function updateColHoverRule(prop) {
    if (!_rule) _rule = findColHoverRule();
    if (!_rule) return;

    const { sheet, index } = _rule;
    const val = prop ? `"${CSS.escape(prop)}"` : '""';
    sheet.deleteRule(index);
    sheet.insertRule(
        `.note-table-header .note-table-cell-header:has([data-property=${val}]),` +
        `.note-table-header ~ .note-table .note-table-cell[data-prop=${val}]` +
        `{ background-color: var(--table-hover-bg); }`,
        index
    );
}

/**
 * Mouseover handler — highlights the column matching the hovered header cell.
 * Reads column identity from the existing [data-property] sort button.
 * Attach to document via event-listeners-add.js.
 * @param {MouseEvent} evt
 */
export function handleTableColHover(evt) {
    const headerCell = evt.target.closest('.note-table-cell-header');
    const prop = headerCell?.querySelector('[data-property]')?.dataset.property ?? null;
    if (prop === _activeProp) return;
    _activeProp = prop;
    updateColHoverRule(prop);
}
