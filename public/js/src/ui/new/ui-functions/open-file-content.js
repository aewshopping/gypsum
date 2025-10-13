import { appState } from '../../../services/store.js';
import { marked }  from '../../../services/marked.eos.js';

        const modal = document.getElementById('simpleModal');
		const modal_content = document.getElementById('modalContent'); // so we can simulate injecting dynamic text

		let modal_default_style;

export async function handleOpenFileContent(event, target) {

    console.log("opening file content");

        openModal(event, target);
        await moveModal();
        loadContentModal(); // wait until in position
    }
    
    function openModal(event, target) {
        const rect = target.getBoundingClientRect(); // get clicker element co-ordinates
        
        modal_default_style = modal.style; // save default styles so we can reset to them later

        // position the modal over the clicker element
        modal.style.left = `${rect.left}px`;
        modal.style.top = `${rect.top}px`;
        modal.style.width = `${rect.width}px`;
        modal.style.height = `${rect.height}px`;
    
        modal.showModal();

    }
    
    function moveModal() {
        return new Promise(resolve => {
            
            // Add a one-time event listener for the transition to finish
            const handleTransitionEnd = () => {
                // Remove the listener to prevent issues on subsequent calls
                modal.removeEventListener('transitionend', handleTransitionEnd);
                    
                // Resolve the Promise, telling 'await' that we are done
                resolve();
            };

            // Attach the listener BEFORE moving the modal to catch the start of the transition
            modal.addEventListener('transitionend', handleTransitionEnd);
            
            modal.style = modal_default_style; // back to default style
            modal.classList.add('dialog-in-centre'); // switch to chosen style and positioning
            
        });
    }
    
    async function loadContentModal () {
        modal.classList.add('dialog-full-height'); // so we can animate / transition the height
        
        const filechosen = appState.myFiles[1] // TO DO need to match file to clicked element, not just load the first one...
        const file_handle = await filechosen.handle.getFile();
        const file_content = await file_handle.text();
        const file_content_parsed = marked(file_content);
        
        modal_content.innerHTML = file_content_parsed; // TO-DO - make the text arrive nicely, not all at once (alth prob not worth it)
    }
    
    function resetModal(){
        modal.style = modal_default_style; // go back to starting style
        modal_content.textContent=""; //get rid of the contents
        modal.classList.remove('dialog-in-centre'); // remove central positioning and styles
        modal.classList.remove('dialog-full-height'); // remove full height
    }
    
    modal.addEventListener('close', resetModal); // not currently required but might be needed if we want to do more things in the closeModal function
    
    export function closeModal() {
        modal.close(); // TO-DO animate close back to start position. Requires messing around with @starting-style
}