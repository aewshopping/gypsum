/**
 * @file The flowchart code view's copy button: the mermaid source, onto the clipboard.
 */

/**
 * Copies the text of the code block beside the pressed button.
 *
 * @param {MouseEvent} event
 * @param {HTMLElement} target - The copy button.
 * @returns {Promise<void>}
 */
export async function handleCopyFlowchartCode(event, target) {
    const code = target.closest('.flowchart-code-block').querySelector('.flowchart-code');
    await navigator.clipboard.writeText(code.textContent);
}
