const { test, expect } = require('@playwright/test');
const { setupMockFilesYamlShapes, setupMockFilesFalsyTags, loadFolder, appModule } = require('../helpers');

/**
 * Parses a front matter block and returns the result, the recorded errors and, when asked, the
 * spans resolved back into the text they point at.
 *
 * The parser is a function from text to values, so it is called here rather than in a page — see
 * appModule in helpers.js.
 *
 * @param {string} doc - The whole file text, front matter included.
 * @param {boolean} [withSpans=false] - Also resolve every span into its substring.
 */
async function parse(doc, withSpans = false) {
  const { parseYaml } = await appModule('services/file-parsing/yaml-parse.js');
  const errors = [];
  const spans = withSpans ? new Map() : null;
  const data = parseYaml(doc, errors, spans);
  const resolved = {};
  if (spans) {
    for (const [key, span] of spans) {
      resolved[key] = {
        form: span.form,
        key: doc.slice(span.lineStart, span.valueStart),
        value: doc.slice(span.valueStart, span.valueEnd),
        items: span.items.map(item => ({
          value: doc.slice(item.valueStart, item.valueEnd),
          prefix: doc.slice(item.lineStart, item.valueStart),
        })),
      };
    }
  }
  return { data, errors, spans: resolved };
}

const block = (yaml) => `---\n${yaml}\n---\n\n# Body\n`;

// The table in §0 of plans/completed/yaml-parser.md: every one of these used to produce an empty object,
// shown in the table as [object Object].
test('a list is read whatever whitespace precedes the dash', async () => {
  const spaces = await parse(block('tags:\n  - web\n  - prod'));
  const tab = await parse(block('tags:\n\t- web\n\t- prod'));
  const flush = await parse(block('tags:\n- web\n- prod'));
  const nbsp = await parse(block('tags:\n\u00a0- web\n\u00a0- prod'));

  for (const result of [spaces, tab, flush, nbsp]) {
    expect(result.data).toEqual({ tags: ['web', 'prod'] });
    expect(result.errors).toEqual([]);
  }
});

test('a dash line holding a colon is a list item, and says so', async () => {
  const { data, errors } = await parse(block('tags:\n  - apple: red'));

  // Previously read as a key named '- apple', with nothing recorded.
  expect(data).toEqual({ tags: ['apple: red'] });
  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain('list item holding a key');
});

test('a key left holding nothing is dropped rather than stored as an empty object', async () => {
  expect((await parse(block('foo:\nbar: 1'))).data).toEqual({ bar: 1 });
  expect((await parse(block('a:\n  b:\nc: 1'))).data).toEqual({ c: 1 });
});

test('flow lists are read, quoted items included', async () => {
  expect((await parse(block('tags: [ web, production ]'))).data).toEqual({ tags: ['web', 'production'] });
  expect((await parse(block('tags: ["spider web", "production"]'))).data).toEqual({ tags: ['spider web', 'production'] });
  expect((await parse(block('tags: [web]'))).data).toEqual({ tags: ['web'] });
  expect((await parse(block('tags: []'))).data).toEqual({ tags: [] });
});

test('a bracket that does not open a list is left as text', async () => {
  const prose = await parse(block('note: [draft] needs work'));
  expect(prose.data).toEqual({ note: '[draft] needs work' });
  expect(prose.errors).toEqual([]);

  const unclosed = await parse(block('tags: [a, b'));
  expect(unclosed.data).toEqual({ tags: '[a, b' });
  expect(unclosed.errors[0]).toContain('unclosed flow list');
});

test('nesting still works, with spaces, tabs, and lists flush with their key', async () => {
  expect((await parse(block('a:\n  b: 1\n  c: 2'))).data).toEqual({ a: { b: 1, c: 2 } });
  expect((await parse(block('a:\n  b:\n    - x\n    - y\n  c: 3'))).data).toEqual({ a: { b: ['x', 'y'], c: 3 } });
  expect((await parse(block('a:\n  b:\n  - x\n  - y\n  c: 3'))).data).toEqual({ a: { b: ['x', 'y'], c: 3 } });
  expect((await parse(block('a:\n\tb: 1'))).data).toEqual({ a: { b: 1 } });
  expect((await parse(block('tags:\n- web\nother: 1'))).data).toEqual({ tags: ['web'], other: 1 });
  expect((await parse(block('a:\n- 1\nb:\n- 2'))).data).toEqual({ a: [1], b: [2] });
});

test('shapes the parser does not support are reported rather than mangled', async () => {
  const onArray = await parse(block('items:\n  - name: a\n    id: 1'));
  expect(onArray.errors.some(text => text.includes('key inside a list'))).toBe(true);

  const orphan = await parse(block('title: X\n- orphan'));
  expect(orphan.data).toEqual({ title: 'X' });
  expect(orphan.errors[0]).toContain('no parent key');

  const filled = await parse(block('a:\n  x: 1\n- 2'));
  expect(filled.errors[0]).toContain('already holds values');
});

test('values keep their types, and Infinity stays text', async () => {
  const { data } = await parse(block('a: true\nb: false\nc: null\nd: ~\ne: 12\nf: "12"\ng: 2025-09-30\nh: Infinity\ni: http://a.b/c:8080'));
  expect(data).toEqual({
    a: true, b: false, c: null, d: null, e: 12, f: '12',
    g: '2025-09-30', h: 'Infinity', i: 'http://a.b/c:8080',
  });
});

test('a number is kept only when its own text comes back', async () => {
  // `01` is the integer 1 by the letter of the YAML spec, and nothing afterwards can recover the
  // `0` — so the cell drew `1`, a search for `01` found nothing, and editing that cell wrote back
  // `"02"`. The app declines the lossy half of the core schema so that a cell can keep showing the
  // note's own text. See DATA-STRUCTURES.md, "How a front matter value is read".
  const { data } = await parse(block([
    'padded: 01', 'zeros: 007', 'trailing: 1.50', 'signed: +3', 'exponent: 1e3',
    'tiny: .5', 'negzero: -0', 'huge: 12345678901234567890',
    'plain: 42', 'negative: -1.5', 'zero: 0', 'year: 2026',
  ].join('\n')));

  expect(data).toEqual({
    padded: '01', zeros: '007', trailing: '1.50', signed: '+3', exponent: '1e3',
    tiny: '.5', negzero: '-0', huge: '12345678901234567890',
    // A text that is already exactly its own number is still a number, so a number column goes on
    // sorting numerically without anyone having to say so.
    plain: 42, negative: -1.5, zero: 0, year: 2026,
  });
});

test('a list keeps the text of every item it holds', async () => {
  // Both forms, because the items are read on two different paths through the parser.
  const { data } = await parse(block('flow: [01, 02, 10]\nblock:\n  - 007\n  - 8'));
  expect(data).toEqual({ flow: ['01', '02', 10], block: ['007', 8] });
});

test('what the writer quotes is still decided by the spec, not by what the parser keeps', async () => {
  // needsQuoting() protects the text from *other* readers — Obsidian, PyYAML — so it has to go on
  // asking what YAML says `02` means, even though gypsum itself now keeps the text either way.
  // Were it to follow the parser, `02` would be written bare and every other reader would see 2.
  const { needsQuoting } = await appModule('services/file-parsing/yaml-value-write.js');
  for (const text of ['01', '007', '1.50', '+3', '1e3']) {
    expect(needsQuoting(text), `${text} must still be quoted on the way out`).toBe(true);
  }

  // And the round trip the two halves add up to: written quoted, read back as the same text.
  const { data } = await parse(block('note: "02"'));
  expect(data.note).toBe('02');
});

// §6.1: the shape that used to have its first paragraphs eaten, and the shape that must not be.
test('a setext heading no longer claims the front matter block', async () => {
  const setext = 'My Title\n---\n\nSome body text.\n\nAnother section\n---\n\nmore text';
  expect((await parse(setext)).data).toEqual({});

  const rules = '# Title\n\n---\n\nSection one\n\n---\n\nSection two';
  expect((await parse(rules)).data).toEqual({});
});

test('front matter under an ATX heading is still front matter', async () => {
  const doc = '# my title \n---\nday: Monday\n---\n';
  expect((await parse(doc)).data).toEqual({ day: 'Monday' });
});

// A note's own tag above its front matter. The '#' test that lets a heading sit there has to let
// a tag sit there too, and the block below is what stops that allowance costing a note its body.
test('a tag line above the block is still front matter', async () => {
  const withTitle = '# this is my title\n\n#admin\n\n---\nday: Monday\n---\n';
  expect((await parse(withTitle)).data).toEqual({ day: 'Monday' });

  const tagOnly = '#admin\n\n---\nday: Monday\n---\n';
  expect((await parse(tagOnly)).data).toEqual({ day: 'Monday' });

  const adjacent = '#work/q3 #admin\n---\nday: Monday\n---\n';
  expect((await parse(adjacent)).data).toEqual({ day: 'Monday' });
});

// The shapes that show what refusing prose above the separator is worth. Both hold something that
// reads as front matter, so the block test alone would claim them: the list is asserted through
// the rendered output because a keyless list parses to nothing either way — what would be lost is
// the body, not the values.
test('a setext heading over a list or a key is not front matter', async () => {
  const { parseContent } = await appModule('services/parse-content.js');
  const list = 'My Title\n---\n\n- milk\n- eggs\n\nAnother section\n---\n';
  expect(parseContent(list)).toContain('milk');

  const key = 'My Title\n---\n\nNote: this is important\n\nAnother section\n---\n';
  expect((await parse(key)).data).toEqual({});
});

test('a note whose front matter is eaten keeps its body in the rendered output', async () => {
  const { parseContent } = await appModule('services/parse-content.js');
  const rendered = parseContent('My Title\n---\n\nSome body text.\n\nAnother section\n---\n\nmore text');
  expect(rendered).toContain('Some body text.');
  expect(rendered).toContain('Another section');
});

test('spans point at each value, and at each item of a list', async () => {
  const doc = '---\ntitle: Hello\ntags:\n  - web\n  # a comment inside the list\n  - prod\nflush:\n- a\n- b\nflow: [x, "y z"]\nnest:\n  deep: 1\n---\n';
  const { spans } = await parse(doc, true);

  expect(spans.title).toMatchObject({ form: 'scalar', value: ' Hello' });
  expect(spans.nest).toMatchObject({ form: 'map', value: '\n  deep: 1' });

  expect(spans.tags.form).toBe('block');
  expect(spans.tags.value).toBe('\n  - web\n  # a comment inside the list\n  - prod');
  expect(spans.tags.items).toEqual([
    { value: 'web', prefix: '  - ' },
    { value: 'prod', prefix: '  - ' },
  ]);

  // The prefix is what an insert copies, so a flush list has to report its own, not the indented one.
  expect(spans.flush.items.map(item => item.prefix)).toEqual(['- ', '- ']);
  expect(spans.flow.form).toBe('flow');
  expect(spans.flow.items.map(item => item.value)).toEqual(['x', '"y z"']);
});

test('a span reaches back to its key, whatever the value does afterwards', async () => {
  // lineStart with valueEnd is the whole key — the bytes a delete takes out. The key is always on
  // the line lineStart begins and valueStart is always on that same line, so a multi-line value
  // moves valueEnd down the file and leaves the near end exactly where it was.
  const doc = '---\ntitle: Hello\ntags:\n  - web\n  - prod\nflow: [x, y]\n  spaced : 1\n---\n';
  const { spans } = await parse(doc, true);

  expect(spans.title.key).toBe('title:');
  expect(spans.tags.key).toBe('tags:');
  expect(spans.flow.key).toBe('flow:');
  // indentation and a space before the colon are part of the key's line, so a delete takes them too
  expect(spans.spaced.key).toBe('  spaced :');

  // and the far end is the last line the value took, so key + value is every line of it
  expect(spans.tags.key + spans.tags.value).toBe('tags:\n  - web\n  - prod');
});

test('a blank or comment line after a list is outside the key it follows', async () => {
  // Which is what lets a comment survive its neighbour's key being removed: valueEnd is only ever
  // pushed forward by a line the parser actually reads.
  const doc = '---\ntags:\n  - web\n\n# a note about tail\ntail: yes\n---\n';
  const { parseYaml } = await appModule('services/file-parsing/yaml-parse.js');
  const spans = new Map();
  parseYaml(doc, [], spans);

  const tags = spans.get('tags');
  expect(doc.slice(tags.lineStart, tags.valueEnd)).toBe('tags:\n  - web');
});

test('editing one list item leaves every other byte alone, comments included', async () => {
  const doc = '---\ntitle: Hello\ntags:\n  - web\n  # a comment inside the list\n  - prod\n---\n\nBody\n';
  const { parseYaml } = await appModule('services/file-parsing/yaml-parse.js');
  const spans = new Map();
  parseYaml(doc, [], spans);
  const item = spans.get('tags').items[1];
  const edited = doc.slice(0, item.valueStart) + 'staging' + doc.slice(item.valueEnd);

  expect(edited).toBe('---\ntitle: Hello\ntags:\n  - web\n  # a comment inside the list\n  - staging\n---\n\nBody\n');
});

test('an inserted item copies the indentation already in the file', async () => {
  const { parseYaml } = await appModule('services/file-parsing/yaml-parse.js');
  const insert = (doc) => {
    const spans = new Map();
    parseYaml(doc, [], spans);
    const items = spans.get('tags').items;
    const last = items[items.length - 1];
    const prefix = doc.slice(last.lineStart, last.valueStart);
    return doc.slice(0, last.valueEnd) + '\n' + prefix + 'added' + doc.slice(last.valueEnd);
  };

  expect(insert('---\ntags:\n  - web\n---\n')).toBe('---\ntags:\n  - web\n  - added\n---\n');
  expect(insert('---\ntags:\n- web\n---\n')).toBe('---\ntags:\n- web\n- added\n---\n');
  expect(insert('---\ntags:\n\t- web\n---\n')).toBe('---\ntags:\n\t- web\n\t- added\n---\n');
});

test('spans and splices survive CRLF line endings', async () => {
  const doc = '---\r\ntitle: Hi\r\ntags:\r\n  - a\r\n  - b\r\n---\r\nbody';
  const { data, spans } = await parse(doc, true);

  expect(data).toEqual({ title: 'Hi', tags: ['a', 'b'] });
  // The '\r' belongs to the line ending, not the value — a span that swallowed it would delete it.
  expect(spans.title.value).toBe(' Hi');
  expect(spans.tags.items[0].value).toBe('a');
});

test('the new shapes register as properties when a folder is loaded', async ({ page }) => {
  await setupMockFilesYamlShapes(page);
  // addInitScript only reaches the next navigation, and beforeEach has already been here.
  await page.goto('/');
  await loadFolder(page);

  const files = await page.evaluate(() =>
    window.appState.myFiles
      .map(file => ({ name: file.filename, status: file.status ?? null, people: file.people ?? null, error: file.errorOnLoad }))
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  expect(files).toEqual([
    { name: 'flow.md', status: 'live', people: ['ada lovelace', 'alan'], error: null },
    { name: 'flush.md', status: 'draft', people: ['alice', 'bob'], error: null },
    { name: 'tabbed.md', status: 'done', people: ['carol'], error: null },
  ]);
});

test('a block opening on the first line is front matter even when none of it parses', async () => {
  // Nothing precedes the separator, so it cannot be a thematic break — the file is claiming
  // front matter, and a block that then fails to parse should report itself rather than go quiet.
  const { data, errors } = await parse('---\na line with no colon\n---\n\n# Title\n');

  expect(data).toEqual({});
  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain('unrecognised line');
});

test('below the first line, a block of prose is not claimed', async () => {
  const { data, errors } = await parse('# my title\n---\nnot front matter\n---\n');
  expect(data).toEqual({});
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------------------------
// flow-list.js: a list as one line of text, in both directions. Here rather than in its own file
// because it borrows the parser's comma scanner — one scanner, so the editor and the file can
// never disagree about where an item ends. See plans/completed/table-cell-editors.md §3.

/**
 * splitFlowItems, called directly.
 * @param {string} text
 */
const split = async (text) =>
  (await appModule('services/file-parsing/flow-list.js')).splitFlowItems(text);

/**
 * joinFlowItems, read straight back.
 * @param {string[]} items
 */
const roundTrip = async (items) => {
  const { splitFlowItems, joinFlowItems } = await appModule('services/file-parsing/flow-list.js');
  const text = joinFlowItems(items);
  return { text, back: splitFlowItems(text) };
};

test('a comma-separated line reads back as its items', async () => {
  expect(await split('John Smith, Jane Doe')).toEqual(['John Smith', 'Jane Doe']);
  expect(await split('"Doe, Jane", Sam')).toEqual(['Doe, Jane', 'Sam']);
});

test('empty items and a trailing comma fall out, which the scanner already did', async () => {
  expect(await split(' a , , b,')).toEqual(['a', 'b']);
  expect(await split('')).toEqual([]);
});

test('a newline separates items too, and no quote protects it', async () => {
  // Pasting a column out of a spreadsheet then does what it looks like it should, and no item can
  // hold a line break — which is the one thing that destroys a front matter block outright.
  expect(await split('a\nb\nc')).toEqual(['a', 'b', 'c']);
  expect(await split('"a\nb"')).toEqual(['"a', 'b"']);
  expect(await split('a, b\nc, d')).toEqual(['a', 'b', 'c', 'd']);
});

test('items that need quoting survive a round trip through the editor', async () => {
  expect(await roundTrip(['a', 'b'])).toEqual({ text: 'a, b', back: ['a', 'b'] });

  for (const items of [['Smith, John', 'Jane'], ["it's, here"], ['say "hi", now'], ['  padded  ']]) {
    const { back } = await roundTrip(items);
    expect(back).toEqual(items.map(item => item.trim()));
  }
});

test('an item is not coerced to a number or a boolean on the way out', async () => {
  // coerceValue would have: the editor deals in text, and what a value means is the parser's
  // business when the file is read back.
  expect(await split('12, true, null')).toEqual(['12', 'true', 'null']);
});

// The tags key is merged into the TagMap and then deleted, and the delete is what stops the
// `...(yamlData)` spread putting front matter over the top of that Map. Both used to sit behind
// `if (yamlData.tags)`, so a note saying `tags: false` skipped the delete along with the merge and
// `file.tags` came out a boolean. The table happened to be guarded; render-file-list-list.js and
// render-file-list-grid.js call file.tags.keys() straight out and threw, taking two whole views
// down over one word in one note.
test('a tags key holding false or null still leaves the TagMap in place', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await setupMockFilesFalsyTags(page);
  await page.goto('/');
  await loadFolder(page);

  const kinds = await page.evaluate(() =>
    window.appState.myFiles
      .map(file => [file.filename, file.tags instanceof Map, [...file.tags.keys()].join(',')])
      .sort((a, b) => a[0].localeCompare(b[0]))
  );

  expect(kinds).toEqual([
    // `false` is a value, so it becomes the tag it spells, the way `123` would.
    ['bare-tags.md', true, 'real'],
    ['false-tags.md', true, 'false'],
    // null is missing everywhere else in the app, so it is not a tag either.
    ['null-tags.md', true, ''],
  ]);

  // The two views that read the Map without checking it is one. Both drew nothing and threw.
  await page.selectOption('#view-select', 'list');
  await expect(page.locator('.list-view > li')).toHaveCount(3);

  await page.selectOption('#view-select', 'cards');
  await expect(page.locator('.note-grid')).toHaveCount(3);

  expect(errors).toEqual([]);
});

// plans/table-delete-column.md §5.3: a key written twice is an error, so the note is locked.

test('a repeated key gives one error per repeat, and the last occurrence is still the value', async () => {
  const doc = block('people: ann\nstatus: draft\npeople: bob\npeople: cat');
  const { data, errors, spans } = await parse(doc, true);
  expect(errors).toEqual(['duplicate key: people', 'duplicate key: people']);
  expect(data.people).toBe('cat');
  expect(spans.people.value).toBe(' cat');
});

test('a bare key followed by the same key with a value is a duplicate', async () => {
  const { errors } = await parse(block('people:\npeople: bob'));
  expect(errors).toEqual(['duplicate key: people']);
});

test('the same key under two different parents is not a duplicate', async () => {
  const { errors } = await parse(block('a:\n  name: x\nb:\n  name: y\nname: z'));
  expect(errors).toEqual([]);
});

test('yamlSegment words a duplicate apart from skipped lines', async () => {
  const { yamlSegment } = await appModule('services/file-parsing/file-errors.js');
  expect(yamlSegment(['duplicate key: people'], [])).toBe('yaml: 1 duplicate key "people"');
  expect(yamlSegment(['unrecognised line: x', 'no parent key for list item: - y', 'duplicate key: people'], []))
    .toBe('yaml: 2 lines skipped, 1 duplicate key "people"');
});
