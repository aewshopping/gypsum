import { downloadBackup } from '../../backup/create-backup.js';

/**
 * @returns {Promise<void>}
 */
export async function handleBackupContent() {
    await downloadBackup(false);
}

/**
 * @returns {Promise<void>}
 */
export async function handleBackupFull() {
    await downloadBackup(true);
}
