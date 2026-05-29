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
 * @param {string} mainText - Body text of the warning.
 * @param {string} proceedText - Label for the destructive-action button.
 * @param {string} cancelText - Label for the cancel button.
 * @returns {Promise<boolean>} Resolves true if the user clicked proceed, false if cancelled.
 */
export function showWarningModal(mainText, proceedText, cancelText) {
    warningText.textContent = mainText;
    proceedBtn.textContent  = proceedText;
    cancelBtn.textContent   = cancelText;
    return new Promise(resolve => {
        pendingResolve = resolve;
        warningDialog.showModal();
        warningDialog.focus();
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
