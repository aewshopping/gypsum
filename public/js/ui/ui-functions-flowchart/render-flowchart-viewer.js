/**
 * @file The markup the pan and zoom viewer works on: the container, its controls, an empty SVG.
 *
 * Written here rather than by svg-pan-zoom.js so that module stays free of the app's icons and
 * tooltips — it finds these controls by class, as the original found them by id.
 *
 * The two toggles are the app's icon toggle — a `.svg-wrapper-style` label holding its glyph and an
 * invisible checkbox stretched over the whole button, so a press anywhere on it counts, not just on
 * the drawing. Fullscreen swaps maximise for minimise as the note modal's toggle does.
 *
 * **Pan starts on.** The chart cannot scroll the page anyway, and with it off a mouse drag from a
 * box meant for scrolling ends on empty chart and offers a new note. Turning it off is a deliberate
 * step into editing; a re-render keeps whichever it was (readPanZoomState).
 *
 * The viewer sits in `.flowchart-frame`, a plate of the page's alternate colour reaching the column's
 * sides and the foot of the window, so the chart is framed by it.
 *
 * @returns {string} HTML string.
 */
export function renderFlowchartViewer() {
    return `
        <div class="flowchart-frame">
        <div class="pz-container flowchart-viewer">
            <label class="svg-wrapper-style pz-icon pz-fullscreen" data-tip="full screen">
                <svg viewBox="0 0 73.6 70.2" width="73.6" height="70.2"><use href="#icon-maximise"></use></svg>
                <svg viewBox="0 0 71.2 67.1" width="71.2" height="67.1"><use href="#icon-minimise"></use></svg>
                <input type="checkbox" class="pz-fullscreen-check" aria-label="full screen">
            </label>
            <label class="svg-wrapper-style pz-icon pz-panzoom" data-tip="pan and zoom: on to move the chart, off to work on the notes">
                <svg viewBox="0 0 50 50"><use href="#icon-pan"></use></svg>
                <input type="checkbox" class="pz-panzoom-check" aria-label="pan and zoom" checked>
            </label>
            <div class="pz-zoom">
                <button type="button" class="pz-reset svg-wrapper-style" data-tip="reset zoom and position">
                    <svg viewBox="0 0 50 45"><use href="#icon-reset"></use></svg>
                </button>
                <span class="pz-zoom-label" aria-hidden="true">−</span>
                <input type="range" class="pz-zoom-input" aria-label="zoom" min="1" max="20" value="1" step="0.1">
                <span class="pz-zoom-label" aria-hidden="true">+</span>
            </div>
            <svg class="pz-svg flowchart-svg" data-action="flowchart-press" xmlns="http://www.w3.org/2000/svg"></svg>
        </div>
        </div>`;
}
