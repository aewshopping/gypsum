let _rule = null;   // { sheet, index } — lazy-initialised on first hover
let _activeProp = null;

/**
 * Finds the column-hover CSS rule by its unique selector fragment.
 * The fragment .list-table .note-table-cell[data-prop= appears only in this rule.
 *
 * Recurses through @import rules: in development style.css is nothing but imports, and
 * an imported sheet's rules are not reachable from document.styleSheets. The bundled
 * single-file build inlines everything into one sheet, where the rule is top level.
 *
 * @param {CSSStyleSheet} [sheet] - Sheet to search; defaults to every document sheet.
 * @returns {{ sheet: CSSStyleSheet, index: number }|null}
 */
function findColHoverRule(sheet) {
    const sheets = sheet ? [sheet] : [...document.styleSheets];

    for (const currentSheet of sheets) {
        let rules;
        try { rules = currentSheet.cssRules; } catch (_) { continue; } // cross-origin sheet — skip

        for (let i = 0; i < rules.length; i++) {
            if (rules[i].styleSheet) {
                const found = findColHoverRule(rules[i].styleSheet); // an @import
                if (found) return found;
            } else if (rules[i].selectorText?.includes('.list-table .note-table-cell[data-prop=')) {
                return { sheet: currentSheet, index: i };
            }
        }
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
        `.list-table .note-table-cell[data-prop=${val}]` +
        `{ background-color: if(style(--colours-suppress: true): var(--colour-neutral-alt); else: color-mix(in oklch, attr(data-color type(<color>), var(--colour-neutral-alt)) 80%, var(--color-mono-contr, var(--colour-contr)))); }`,
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
