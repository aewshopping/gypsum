/**
 * @file A `marked` Renderer subclass that tags each rendered block-level element with the
 * 1-based line number (in the raw source text) it was produced from, via a
 * `data-src-line-start` attribute. Lets consumers (e.g. the diff highlighter) map raw-text
 * line numbers to rendered DOM elements directly, instead of re-rendering lines and
 * text-searching the DOM. Only a start line is tracked — an element's end is derivable from
 * the next tagged element's start line.
 */

import { Renderer } from './marked.eos.js';

// Methods whose token.raw is a literal slice of the source. Excludes content nested inside a
// blockquote/list item's own body — marked re-lexes that from dedented text, so its raw no
// longer matches the source. Also excludes `html`: marked calls that same renderer method for
// both real HTML blocks *and* inline HTML tags embedded in text (e.g. the <span> tagParser
// injects for #tags), and there's no reliable line to report for the latter. `text` has the
// same block/inline overlap but is harmless to include: its rendered output never starts with
// '<', so tagWithLine never mutates it, and any bogus nextOffset advance from an inline call
// gets overwritten by the enclosing tracked method's own authoritative update once that returns.
const TRACKED_METHODS = ['heading', 'paragraph', 'code', 'hr', 'table', 'text', 'list', 'listitem', 'blockquote'];

// These two recurse into this.parser.parse() on that dedented content; list() only calls
// this.listitem() directly, which is itself trustworthy, so it needs no special handling.
const REENTRANT_METHODS = new Set(['blockquote', 'listitem']);

/**
 * Inserts a `data-src-line-start` attribute into the opening tag of a rendered HTML fragment.
 * Uses `indexOf('>')` rather than a regex — marked always escapes literal '>' in attribute
 * values, so the first one is always the real tag end.
 *
 * @param {string} html - HTML fragment returned by a base Renderer method.
 * @param {number} line - 1-based source line to record.
 * @returns {string} The fragment with the attribute inserted, or unchanged if empty/not a tag.
 */
export function tagWithLine(html, line) {
    const tagEnd = html.indexOf('>');
    if (!html.startsWith('<') || tagEnd === -1) return html;
    return html.slice(0, tagEnd) + ` data-src-line-start="${line}"` + html.slice(tagEnd);
}

/**
 * A `marked` Renderer that tags rendered block-level elements with their source line number.
 * Construct one fresh per `marked(text, { renderer })` call — state is per-instance.
 */
export class SourceTrackingRenderer extends Renderer {
    /**
     * @param {string} sourceText - Exact text passed to `marked()` (post front-matter
     *   placeholder substitution and tag-parsing), with line endings normalized to '\n'.
     * @param {number} [lineOffset=0] - Lines to add to any line number past the front-matter
     *   placeholder, correcting for it having collapsed the original block to one line. Pass
     *   `indices.end - indices.start` from `findFrontMatterIndices`, or 0 if none.
     * @param {number} [placeholderLine=0] - 1-based line number of the placeholder in
     *   `sourceText`. Lines at or before this need no correction.
     * @param {boolean} [liveCheckboxes=false] - Renders task-list checkboxes without `disabled`
     *   when true. Historical snapshots should stay read-only, so callers pass this only when
     *   parsing the live/current version of a file.
     */
    constructor(sourceText, lineOffset = 0, placeholderLine = 0, liveCheckboxes = false) {
        super();

        // Character offset, not a running line count: advancing it is exact (token.raw is by
        // construction the next raw.length characters), unlike counting newlines per token.
        this.nextOffset = 0;

        // True for the duration of a REENTRANT_METHODS call's own super call, so nested tracked
        // methods invoked on its dedented content skip tracking instead of tagging wrong lines
        // and corrupting nextOffset for everything after.
        this.suppressed = false;

        // Line of the list item currently being rendered — checkbox() reads this, since it gets
        // no token of its own to compute a line from (see below).
        this.currentListItemLine = null;

        for (const name of TRACKED_METHODS) {
            const base = Renderer.prototype[name];
            this[name] = (token) => {
                // Searches forward from nextOffset rather than requiring an exact match there,
                // because untracked tokens can sit between tracked ones — most commonly the
                // blank-line "space" token blockTokens emits between blocks, which we don't
                // (and don't need to) track. This also catches marked's Parser.parse()
                // occasionally building a synthetic token (e.g. merging consecutive bare text
                // lines) whose raw is rendered HTML rather than source text: indexOf just won't
                // find it, and we fall back to plain rendering.
                const foundAt = sourceText.indexOf(token.raw, this.nextOffset);
                if (this.suppressed || foundAt === -1) {
                    return base.call(this, token);
                }

                const startOffset = foundAt;
                const rawLine = sourceText.slice(0, startOffset).split('\n').length;
                const reportedLine = rawLine + (rawLine > placeholderLine ? lineOffset : 0);
                if (name === 'listitem') this.currentListItemLine = reportedLine;

                const isReentrant = REENTRANT_METHODS.has(name);
                if (isReentrant) this.suppressed = true;
                const html = base.call(this, token);
                if (isReentrant) this.suppressed = false;

                // token.raw is always authoritative here, regardless of what the super call did.
                this.nextOffset = startOffset + token.raw.length;

                return tagWithLine(html, reportedLine);
            };
        }

        // checkbox() gets no token of its own — listitem() calls it directly with just
        // {checked}, since the "[ ] "/"[x] " marker is stripped from the source before the
        // item's body is parsed. Its line is always the enclosing list item's line, set above.
        const baseCheckbox = Renderer.prototype.checkbox;
        this.checkbox = (token) => {
            const rawHtml = baseCheckbox.call(this, token);
            // Base output is always "<input [checked=\"\" ]disabled=\"\" type=\"checkbox\">" —
            // stripping this fixed substring is what makes the checkbox clickable on the live
            // render. Safe as a plain string op since marked.eos.js is vendored/pinned.
            const html = liveCheckboxes ? rawHtml.replace('disabled="" ', '') : rawHtml;
            return tagWithLine(html, this.currentListItemLine);
        };
    }
}
