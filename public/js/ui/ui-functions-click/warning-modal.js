/**
 * @file Configurable warning/confirmation modal. A single module-level callback
 * is stored so the same dialog element can be reused for different confirm flows
 * (e.g. "close with unsaved changes" and "delete file").
 */

const warningDialog = document.getElementById('modal-unsaved-warning');
const warningText   = document.getElementById('modal-unsaved-warning-text');
const proceedBtn    = document.getElementById('modal-unsaved-warning-proceed');
const cancelBtn     = document.getElementById('modal-unsaved-warning-cancel');

let pendingCallback = null;

/**
 * Populates and shows the warning dialog.
 * @param {string} mainText - Body text of the warning.
 * @param {string} proceedText - Label for the destructive-action button.
 * @param {string} cancelText - Label for the cancel button.
 * @param {Function} onProceed - Called (synchronously) when the proceed button is clicked.
 */
export function showWarningModal(mainText, proceedText, cancelText, onProceed) {
    warningText.textContent  = mainText;
    proceedBtn.textContent   = proceedText;
    cancelBtn.textContent    = cancelText;
    pendingCallback = onProceed;
    warningDialog.showModal();
    warningDialog.focus();
}

/**
 * Handles the proceed button click: closes the dialog and fires the stored callback.
 */
export function handleWarningProceed() {
    warningDialog.close();
    const cb = pendingCallback;
    pendingCallback = null;
    cb?.();
}

/**
 * Handles the cancel button click: closes the dialog and discards the stored callback.
 */
export function handleWarningCancel() {
    warningDialog.close();
    pendingCallback = null;
}
