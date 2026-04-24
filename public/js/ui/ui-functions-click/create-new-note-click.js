import { appState } from '../../services/store.js';
import { getFileDataAndMetadata } from '../../services/file-parsing/file-info.js';
import { handleOpenFileContent } from './open-file-content-view-trans.js';
import { activateTextMode } from '../../editing/activate-text-mode.js';
import { renderFiles } from '../ui-functions-render/a-render-all-files.js';

/**
 * Finds the first available note-N.txt filename by querying the real filesystem.
 * Checking the filesystem (not just appState.myFiles) prevents overwriting files
 * created externally since the folder was loaded.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @returns {Promise<string>}
 */
async function findUnusedFilename(dirHandle) {
    let n = 1;
    while (true) {
        const name = `note-${n}.txt`;
        try {
            await dirHandle.getFileHandle(name, { create: false });
            n++;
        } catch {
            return name;
        }
    }
}

/**
 * Creates a new empty .txt file in the loaded folder, adds it to appState, then
 * opens it in the modal (animating from the button) with txt edit mode active.
 * The file list re-renders inside the transition so the new card is ready when
 * the modal closes.
 * @async
 * @param {Event} event - The click event.
 * @param {HTMLElement} target - The new-note button element.
 * @returns {Promise<void>}
 */
export async function handleCreateNewNote(event, target) {
    if (!appState.dirHandle) return;

    const newFilename = await findUnusedFilename(appState.dirHandle);

    const newHandle = await appState.dirHandle.getFileHandle(newFilename, { create: true });
    const writable = await newHandle.createWritable();
    await writable.write('');
    await writable.close();

    const fileObj = await getFileDataAndMetadata(newHandle, appState.myFiles.length);
    const newFile = { ...fileObj, filepath: newFilename, id: newFilename };
    appState.myFiles.push(newFile);
    appState.myFileHandlesMap.set(newFilename, newHandle);

    // handleOpenFileContent reads fileId from target.dataset.fileId synchronously,
    // so we set and remove the attribute around the call with no async gap.
    target.dataset.fileId = newFilename;
    handleOpenFileContent(event, target, () => {
        activateTextMode();
        renderFiles();
    });
    delete target.dataset.fileId;
}
