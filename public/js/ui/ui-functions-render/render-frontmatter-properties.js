import { parseYaml } from '../../services/file-parsing/yaml-parse.js';

/**
 * Escapes HTML-significant characters in a string so it can be safely injected into markup,
 * including as a quoted attribute value.
 * @param {string} value - The raw string to escape.
 * @returns {string} The escaped string.
 */
function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Renders the HTML for a single property value, based on its type.
 * Arrays are rendered as clickable, tag-style pills (each one triggers a search filter for
 * `property:value`, the same syntax and pathway the search box uses); null is rendered as
 * blank; everything else as text.
 * @param {string} property - The property name the value belongs to.
 * @param {*} value - The property value, as produced by parseYaml.
 * @returns {string} The HTML string for the value cell.
 */
function renderPropertyValue(property, value) {
    if (Array.isArray(value)) {
        return value.map(item => {
            const itemText = escapeHtml(String(item));
            return `<span class="tag tag-pill" data-action="property-filter" data-property="${escapeHtml(property)}" data-value="${itemText}" data-tip="search ${escapeHtml(property)}: ${itemText}">${itemText}</span>`;
        }).join('');
    }
    if (value === null) {
        return '';
    }
    if (typeof value === 'object') {
        return escapeHtml(JSON.stringify(value));
    }
    return escapeHtml(String(value));
}

/**
 * Renders the YAML front-matter of a file's raw text as a "Properties" panel: a heading
 * followed by a two-column grid of property name / property value pairs.
 * @param {string} text - Raw file content.
 * @returns {string} The HTML string for the properties panel, or '' if there is no front matter.
 */
export function renderFrontmatterProperties(text) {
    const properties = parseYaml(text);
    const entries = Object.entries(properties);

    if (entries.length === 0) {
        return '';
    }

    const rowsHtml = entries.map(([name, value]) =>
        `<div class="frontmatter-prop-name">${escapeHtml(name)}</div><div class="frontmatter-prop-value">${renderPropertyValue(name, value)}</div>`
    ).join('');

    return `<div class="frontmatter-properties"><div class="frontmatter-properties-heading">Properties</div><div class="frontmatter-properties-grid">${rowsHtml}</div></div>`;
}
