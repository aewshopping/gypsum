/**
 * @file Configurable warning/confirmation modal. A single module-level resolve
 * function is stored so the same dialog element can be reused for different
 * confirm flows (e.g. "close with unsaved changes", "delete file", "overwrite OPFS").
 */

const warningDialog = document.getElementById('modal-unsaved-warning');
const warningText   = document.getElementById('modal-unsaved-warning-text');
const proceedBtn    = document.getElementById('modal-unsaved-warning-proceed');
const cancelBtn     = document.getElementById('modal-unsaved-warning-cancel');

let pendingResolve = null;

/**
 * Populates and shows the warning dialog.
 *
 * The text is set as text, never as HTML, because some of it — a property name, a filename — comes
 * from a note. Its newlines are kept by the stylesheet (`white-space: pre-line`).
 *
 * @param {string} mainText - Body text of the warning.
 * @param {string} proceedText - Label for the destructive-action button.
 * @param {string} cancelText - Label for the cancel button.
 * @param {{focus?: 'cancel', proceed?: boolean}} [options] - `focus: 'cancel'` puts focus on the
 *   cancel button rather than the dialog, so an Enter pressed too soon does nothing destructive.
 *   `proceed: false` offers no proceed button at all, for a dialog that can only explain.
 * @returns {Promise<boolean>} Resolves true if the user clicked proceed, false if cancelled.
 */
export function showWarningModal(mainText, proceedText, cancelText, { focus, proceed = true } = {}) {
    warningText.textContent = mainText;
    proceedBtn.textContent  = proceedText;
    cancelBtn.textContent   = cancelText;
    proceedBtn.hidden = !proceed;
    return new Promise(resolve => {
        pendingResolve = resolve;
        warningDialog.showModal();
        // Inside, rather than left to the caller, because a second focus() from outside would depend
        // on running after this one.
        (focus === 'cancel' ? cancelBtn : warningDialog).focus();
    });
}

/**
 * Handles the proceed button click: closes the dialog and resolves the promise.
 */
export function handleWarningProceed() {
    warningDialog.close();
    const resolve = pendingResolve;
    pendingResolve = null;
    resolve?.(true);
}

/**
 * Handles the cancel button click: closes the dialog and resolves the promise.
 */
export function handleWarningCancel() {
    warningDialog.close();
    const resolve = pendingResolve;
    pendingResolve = null;
    resolve?.(false);
}

// Escape closes a <dialog> itself, without going through either button, which left the promise
// pending forever — and with it whatever was waiting on the answer. Escape on a confirm dialog
// means cancel, which is what handleWarningCancel already says. 'cancel' rather than 'close',
// because the buttons close the dialog themselves and would otherwise come back through here.
warningDialog.addEventListener('cancel', handleWarningCancel);
