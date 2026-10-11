/**
 * Marks a hovered link — its line, its text, and the note it is written in — with `.is-hovered` and
 * `.is-link-source` (flowchart-edges.css, flowchart.css), the note wearing the outline it wears when
 * hovered itself. A hovered note marks the links written in it, and not the links into it: its own
 * outline is `:hover` in CSS.
 *
 * Not `:hover` in CSS, because the three are separate elements: the line is drawn under the boxes and
 * the text over them, and CSS cannot match "the elements carrying this edge's number". So the marks
 * are moved on every mouseover — the same arrangement as the table's column hover.
 *
 * @param {MouseEvent} event - Any mouseover in the document.
 * @returns {void}
 */
export function handleFlowchartLinkHover(event) {
    const link = event.target.closest?.('[data-edge]');
    const note = link ? null : event.target.closest?.('.flowchart-svg .flowchart-node[data-file-id]');

    document.querySelectorAll('.flowchart-svg .is-hovered, .flowchart-svg .is-link-source')
        .forEach(element => element.classList.remove('is-hovered', 'is-link-source'));

    if (note) {
        note.closest('svg').querySelectorAll(`[data-edge][data-file-id="${CSS.escape(note.dataset.fileId)}"]`)
            .forEach(element => element.classList.add('is-hovered'));
        return;
    }
    if (!link) return;

    const svg = link.closest('svg');
    svg.querySelectorAll(`[data-edge="${link.dataset.edge}"]`).forEach(element => element.classList.add('is-hovered'));
    svg.querySelector(`.flowchart-node[data-file-id="${CSS.escape(link.dataset.fileId)}"]`)?.classList.add('is-link-source');
}
