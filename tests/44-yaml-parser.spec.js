const { test, expect } = require('@playwright/test');
const { setupMockFilesYamlShapes, loadFolder } = require('./helpers');

/**
 * Parses a front matter block in the page and returns the result, the recorded errors and,
 * when asked, the spans resolved back into the text they point at.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} doc - The whole file text, front matter included.
 * @param {boolean} [withSpans=false] - Also resolve every span into its substring.
 */
async function parse(page, doc, withSpans = false) {
  return page.evaluate(async ({ doc, withSpans }) => {
    const { parseYaml } = await import('/public/js/services/file-parsing/yaml-parse.js');
    const errors = [];
    const spans = withSpans ? new Map() : null;
    const data = parseYaml(doc, errors, spans);
    const resolved = {};
    if (spans) {
      for (const [key, span] of spans) {
        resolved[key] = {
          form: span.form,
          value: doc.slice(span.valueStart, span.valueEnd),
          items: span.items.map(item => ({
            value: doc.slice(item.valueStart, item.valueEnd),
            prefix: doc.slice(item.lineStart, item.valueStart),
          })),
        };
      }
    }
    return { data, errors, spans: resolved };
  }, { doc, withSpans });
}

const block = (yaml) => `---\n${yaml}\n---\n\n# Body\n`;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

// The table in §0 of plans/yaml-parser.md: every one of these used to produce an empty object,
// shown in the table as [object Object].
test('a list is read whatever whitespace precedes the dash', async ({ page }) => {
  const spaces = await parse(page, block('tags:\n  - web\n  - prod'));
  const tab = await parse(page, block('tags:\n\t- web\n\t- prod'));
  const flush = await parse(page, block('tags:\n- web\n- prod'));
  const nbsp = await parse(page, block('tags:\n\u00a0- web\n\u00a0- prod'));

  for (const result of [spaces, tab, flush, nbsp]) {
    expect(result.data).toEqual({ tags: ['web', 'prod'] });
    expect(result.errors).toEqual([]);
  }
});

test('a dash line holding a colon is a list item, and says so', async ({ page }) => {
  const { data, errors } = await parse(page, block('tags:\n  - apple: red'));

  // Previously read as a key named '- apple', with nothing recorded.
  expect(data).toEqual({ tags: ['apple: red'] });
  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain('list item holding a key');
});

test('a key left holding nothing is dropped rather than stored as an empty object', async ({ page }) => {
  expect((await parse(page, block('foo:\nbar: 1'))).data).toEqual({ bar: 1 });
  expect((await parse(page, block('a:\n  b:\nc: 1'))).data).toEqual({ c: 1 });
});

test('flow lists are read, quoted items included', async ({ page }) => {
  expect((await parse(page, block('tags: [ web, production ]'))).data).toEqual({ tags: ['web', 'production'] });
  expect((await parse(page, block('tags: ["spider web", "production"]'))).data).toEqual({ tags: ['spider web', 'production'] });
  expect((await parse(page, block('tags: [web]'))).data).toEqual({ tags: ['web'] });
  expect((await parse(page, block('tags: []'))).data).toEqual({ tags: [] });
});

test('a bracket that does not open a list is left as text', async ({ page }) => {
  const prose = await parse(page, block('note: [draft] needs work'));
  expect(prose.data).toEqual({ note: '[draft] needs work' });
  expect(prose.errors).toEqual([]);

  const unclosed = await parse(page, block('tags: [a, b'));
  expect(unclosed.data).toEqual({ tags: '[a, b' });
  expect(unclosed.errors[0]).toContain('unclosed flow list');
});

test('nesting still works, with spaces, tabs, and lists flush with their key', async ({ page }) => {
  expect((await parse(page, block('a:\n  b: 1\n  c: 2'))).data).toEqual({ a: { b: 1, c: 2 } });
  expect((await parse(page, block('a:\n  b:\n    - x\n    - y\n  c: 3'))).data).toEqual({ a: { b: ['x', 'y'], c: 3 } });
  expect((await parse(page, block('a:\n  b:\n  - x\n  - y\n  c: 3'))).data).toEqual({ a: { b: ['x', 'y'], c: 3 } });
  expect((await parse(page, block('a:\n\tb: 1'))).data).toEqual({ a: { b: 1 } });
  expect((await parse(page, block('tags:\n- web\nother: 1'))).data).toEqual({ tags: ['web'], other: 1 });
  expect((await parse(page, block('a:\n- 1\nb:\n- 2'))).data).toEqual({ a: [1], b: [2] });
});

test('shapes the parser does not support are reported rather than mangled', async ({ page }) => {
  const onArray = await parse(page, block('items:\n  - name: a\n    id: 1'));
  expect(onArray.errors.some(text => text.includes('key inside a list'))).toBe(true);

  const orphan = await parse(page, block('title: X\n- orphan'));
  expect(orphan.data).toEqual({ title: 'X' });
  expect(orphan.errors[0]).toContain('no parent key');

  const filled = await parse(page, block('a:\n  x: 1\n- 2'));
  expect(filled.errors[0]).toContain('already holds values');
});

test('values keep their types, and Infinity stays text', async ({ page }) => {
  const { data } = await parse(page, block('a: true\nb: false\nc: null\nd: ~\ne: 12\nf: "12"\ng: 2025-09-30\nh: Infinity\ni: http://a.b/c:8080'));
  expect(data).toEqual({
    a: true, b: false, c: null, d: null, e: 12, f: '12',
    g: '2025-09-30', h: 'Infinity', i: 'http://a.b/c:8080',
  });
});

// §6.1: the shape that used to have its first paragraphs eaten, and the shape that must not be.
test('a setext heading no longer claims the front matter block', async ({ page }) => {
  const setext = 'My Title\n---\n\nSome body text.\n\nAnother section\n---\n\nmore text';
  expect((await parse(page, setext)).data).toEqual({});

  const rules = '# Title\n\n---\n\nSection one\n\n---\n\nSection two';
  expect((await parse(page, rules)).data).toEqual({});
});

test('front matter under an ATX heading is still front matter', async ({ page }) => {
  const doc = '# my title \n---\nday: Monday\n---\n';
  expect((await parse(page, doc)).data).toEqual({ day: 'Monday' });
});

test('a note whose front matter is eaten keeps its body in the rendered output', async ({ page }) => {
  const rendered = await page.evaluate(async () => {
    const { parseContent } = await import('/public/js/services/parse-content.js');
    return parseContent('My Title\n---\n\nSome body text.\n\nAnother section\n---\n\nmore text');
  });
  expect(rendered).toContain('Some body text.');
  expect(rendered).toContain('Another section');
});

test('spans point at each value, and at each item of a list', async ({ page }) => {
  const doc = '---\ntitle: Hello\ntags:\n  - web\n  # a comment inside the list\n  - prod\nflush:\n- a\n- b\nflow: [x, "y z"]\nnest:\n  deep: 1\n---\n';
  const { spans } = await parse(page, doc, true);

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

test('editing one list item leaves every other byte alone, comments included', async ({ page }) => {
  const doc = '---\ntitle: Hello\ntags:\n  - web\n  # a comment inside the list\n  - prod\n---\n\nBody\n';
  const edited = await page.evaluate(async (doc) => {
    const { parseYaml } = await import('/public/js/services/file-parsing/yaml-parse.js');
    const spans = new Map();
    parseYaml(doc, [], spans);
    const item = spans.get('tags').items[1];
    return doc.slice(0, item.valueStart) + 'staging' + doc.slice(item.valueEnd);
  }, doc);

  expect(edited).toBe('---\ntitle: Hello\ntags:\n  - web\n  # a comment inside the list\n  - staging\n---\n\nBody\n');
});

test('an inserted item copies the indentation already in the file', async ({ page }) => {
  const insert = async (doc) => page.evaluate(async (doc) => {
    const { parseYaml } = await import('/public/js/services/file-parsing/yaml-parse.js');
    const spans = new Map();
    parseYaml(doc, [], spans);
    const items = spans.get('tags').items;
    const last = items[items.length - 1];
    const prefix = doc.slice(last.lineStart, last.valueStart);
    return doc.slice(0, last.valueEnd) + '\n' + prefix + 'added' + doc.slice(last.valueEnd);
  }, doc);

  expect(await insert('---\ntags:\n  - web\n---\n')).toBe('---\ntags:\n  - web\n  - added\n---\n');
  expect(await insert('---\ntags:\n- web\n---\n')).toBe('---\ntags:\n- web\n- added\n---\n');
  expect(await insert('---\ntags:\n\t- web\n---\n')).toBe('---\ntags:\n\t- web\n\t- added\n---\n');
});

test('spans and splices survive CRLF line endings', async ({ page }) => {
  const doc = '---\r\ntitle: Hi\r\ntags:\r\n  - a\r\n  - b\r\n---\r\nbody';
  const { data, spans } = await parse(page, doc, true);

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

test('a block opening on the first line is front matter even when none of it parses', async ({ page }) => {
  // Nothing precedes the separator, so it cannot be a thematic break — the file is claiming
  // front matter, and a block that then fails to parse should report itself rather than go quiet.
  const { data, errors } = await parse(page, '---\na line with no colon\n---\n\n# Title\n');

  expect(data).toEqual({});
  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain('unrecognised line');
});

test('below the first line, a block of prose is not claimed', async ({ page }) => {
  const { data, errors } = await parse(page, '# my title\n---\nnot front matter\n---\n');
  expect(data).toEqual({});
  expect(errors).toEqual([]);
});
