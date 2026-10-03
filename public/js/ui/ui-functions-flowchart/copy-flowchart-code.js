/**
 * @file The flowchart code view's copy button: the mermaid source, onto the clipboard.
 */

const TICK_MS = 1500; // how long the button shows its tick after a copy

/**
 * Copies the text of the code block beside the pressed button, and ticks the button for a moment.
 *
 * @param {MouseEvent} event
 * @param {HTMLElement} target - The copy button.
 * @returns {Promise<void>}
 */
export async function handleCopyFlowchartCode(event, target) {
    const code = target.closest('.flowchart-code-block').querySelector('.flowchart-code');
    await navigator.clipboard.writeText(code.textContent);
    target.setAttribute('data-copied', '');
    setTimeout(() => target.removeAttribute('data-copied'), TICK_MS);
}
