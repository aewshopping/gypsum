import { RESERVED_KEYS } from '../services/file-parsing/file-info.js';
import { parseYaml, isQuoted } from '../services/file-parsing/yaml-parse.js';
import { findFrontMatterIndices } from '../services/file-parsing/yaml-find.js';
import { newBlock, keySplice, placeAbove } from './front-matter-splice.js';
import { changedItem, SKIP } from './list-item-splice.js';

/**
 * @file What one note's text becomes under a list of edits, worked out from its text alone. No
 * disk and no appState: apply-raw-edits.js reads the note and hands it here, and
 * write-file-edits.js writes what comes back. Every rule about which bytes an edit may touch — the
 * lock on a note that did not read cleanly, `expect`, keeping the note's own style — lives here.
 */

/**
 * Works out one note's splices and applies them to its text.
 *
 * @param {string} original - The note's text as it is on disk now.
 * @param {Array<object>} fileEdits - This note's edits, in the order they were asked for — see
 *   applyRawEdits for their shape.
 * @param {string} internalId - The note's id, for the records.
 * @returns {{updated: string, records: Array<object>}|null} The new text and one record per edit
 *   that changes it; null when the note is locked or no edit changes anything.
 */
export function planFileEdits(original, fileEdits, internalId) {
    const indices = findFrontMatterIndices(original);

    const errors = [];
    const spans = new Map();
    const parsed = parseYaml(original, errors, spans, indices);

    // §7: a file whose front matter did not read cleanly is not written into. A broken block
    // parses into something meaningless — '- apple: red' into a key nobody created — and
    // splicing into that makes it worse. The table locks those cells too, and for the same three
    // reasons hasYamlError() reports; this is the same question asked of the bytes on disk, which is
    // the only place the answer is current.
    if (errors.length > 0 || RESERVED_KEYS.some(key => key in parsed)) return null;

    // A note with no front matter at all is given an empty one, so that a key is appended to it
    // the same way as to a block that was already there — front-matter-splice.js says where it
    // goes and what it looks like. The block is made once per file rather than per edit, or two
    // new keys would arrive in two blocks; the lines it occupies are then handed on below.
    const text = indices ? original : newBlock(original) + original;
    const blockIndices = indices ?? { start: 0, end: 1 };

    const planned = [];
    fileEdits.forEach((edit, order) => {
        const span = spans.get(edit.property);
        const before = span ? text.slice(span.valueStart, span.valueEnd) : '';

        if (edit.expect !== undefined && edit.expect !== before) return;

        // What the note already looks like at this key, so the write keeps its style rather
        // than choosing one: the form of the value, the indentation of its list items, and
        // whether it is quoted. A key the note does not have yet has none of it.
        const shape = span ? {
            form: span.form,
            itemPrefix: span.items.length
                ? text.slice(span.items[0].lineStart, span.items[0].valueStart)
                : undefined,
            quoted: isQuoted(before.trim()),
        } : {};
        const raw = typeof edit.raw === 'function' ? edit.raw(shape) : edit.raw;

        // No text after the colon means no value, and no value means no key — toYamlText says so
        // by returning '', which every other answer it can give rules out, since they all carry
        // the separating space. Asked before the item path, because an emptied list is the whole
        // key going rather than its items changing one by one. `keepKey` is the one exception: an
        // undo putting back a bare `people:`, whose value was '' to begin with. §5.2.
        const removing = raw === '' && !edit.keepKey;
        if (removing && !span) return;

        const item = !removing && span && edit.items ? changedItem(text, span, edit.items) : null;
        if (item === SKIP) return;

        if (!removing && span && !item && raw === before) return;

        planned.push({ edit, order, span, before, raw, removing, item });
    });

    // A key coming back whose anchor is coming back in this same pass: the anchor is not in the
    // text yet, so it cannot be found there, and would fall back to the end of the block. Its line
    // goes straight after the anchor's instead, in the same insertion. §12.
    const recreated = new Map(planned
        .filter(plan => !plan.span && !plan.removing)
        .map(plan => [plan.edit.property, plan]));

    const placeOf = (plan, seen = new Set()) => {
        const { anchor, gap } = plan.edit;
        if (anchor === undefined || anchor === null || spans.has(anchor)) {
            return { placement: { anchor, gap, anchorSpan: anchor ? spans.get(anchor) : undefined }, rank: 0 };
        }
        const host = recreated.get(anchor);
        if (!host || seen.has(anchor)) return { placement: {}, rank: 0 };
        seen.add(plan.edit.property);
        const hostPlace = placeOf(host, seen);
        return { placement: hostPlace.placement, rank: hostPlace.rank + 1 };
    };

    const splices = planned.map(({ edit, order, span, before, raw, removing, item }) => {
        // One item of a list replaces that item alone; everything else is an ordinary write to
        // the key, and where those bytes go is front-matter-splice.js's answer — shared with the
        // colour picker, which splices the open editor's text by the same rules.
        const { placement, rank } = !span && !removing
            ? placeOf(recreated.get(edit.property))
            : { placement: {}, rank: 0 };
        const target = item
            ? { start: item.start, end: item.end, written: item.written }
            : keySplice(text, edit.property, raw, blockIndices, span,
                { ...placement, keepKey: edit.keepKey });

        return {
            property: edit.property,
            order,
            rank,
            ...target,
            before,
            // The record is the key's whole value span whichever splice it was. An item splice
            // happens inside that span, so the span afterwards is the same replacement applied
            // at the same offset — no re-parse needed.
            after: item
                ? before.slice(0, target.start - span.valueStart) + target.written
                    + before.slice(target.end - span.valueStart)
                : raw,
            existed: Boolean(span),
            // Where a removed key sat, so that undoing this puts it back there. §12.
            ...(removing && placeAbove(text, spans, edit.property, blockIndices)),
        };
    });
    if (splices.length === 0) return null;

    // Back to front. Splice the first key and every later span is off by the length delta;
    // working backwards keeps every span valid without recomputing anything. Two new keys share
    // the one insertion point, so they are applied back to front as well and end up in the
    // order they were asked for — a key placed after another re-created key (its rank) after it.
    splices.sort((a, b) => b.start - a.start || b.rank - a.rank || b.order - a.order);

    let updated = text;
    for (const splice of splices) {
        updated = updated.slice(0, splice.start) + splice.written + updated.slice(splice.end);
    }

    const records = splices.map(splice => ({
        internalId,
        property: splice.property,
        before: splice.before,
        after: splice.after,
        existed: splice.existed,
        ...(splice.anchor !== undefined && { anchor: splice.anchor, gap: splice.gap }),
    }));
    return { updated, records };
}
