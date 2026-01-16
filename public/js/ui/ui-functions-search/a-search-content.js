import { appState } from "../../services/store.js";
import { getFilterMap } from "./a-search-helpers.js";
import { findContentMatches } from "./a-content-matches.js";
import { updateSearchState } from "./a-search-helpers.js";
import { recordMatch } from "./a-search-helpers.js";


export async function searchContent(filterId, searchValue, property, type, operator) {
    const MAX_SNIPPETS = 5;
    const SNIPPET_TOTAL_LENGTH = 80;
    const keyedResults = getFilterMap(filterId);

    try {
        const processingPromises = appState.myFiles.map(async (fileObject) => {
            try {
                const file = await fileObject.handle.getFile();
                const text = await file.text();

                // Logic to find matches
                const result = findContentMatches(
                    text,
                    searchValue,
                    property, type, operator,
                    MAX_SNIPPETS,
                    SNIPPET_TOTAL_LENGTH
                );

                // Use the standardized record helper
                recordMatch(keyedResults, fileObject.id, result);

            } catch (fileErr) {
                console.error(`Failed to process file: ${fileObject.filename}`, fileErr);
            }
        });

        await Promise.all(processingPromises);

        updateSearchState(filterId, keyedResults);

    } catch (error) {
        console.error("Critical error during batch search:", error);
    }
}

