const { test, expect } = require('@playwright/test');

/**
 * Step 1 of plans/table-cell-writing.md: the quoting rule, on its own.
 *
 * Pure text in, text out, so these are unit tests — no folder loaded, no table, no disk. The
 * round-trip block at the bottom is the one that matters: it writes a value the way the app would
 * and reads it back with the app's own parser, which is the only thing that can prove the rule is
 * right rather than merely plausible.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

/** needsQuoting() for each text, in a scalar and inside a flow list. */
const asks = (page, texts) => page.evaluate(async (texts) => {
  const { needsQuoting } = await import('/public/js/services/file-parsing/yaml-value-write.js');
  return texts.map(text => ({ scalar: needsQuoting(text), item: needsQuoting(text, true) }));
}, texts);

/**
 * Writes each value into a one-key block the way the app would, parses it back, and returns what
 * came out — the whole point of the rule, stated as a test.
 */
const roundTrip = (page, texts) => page.evaluate(async (texts) => {
  const { needsQuoting, quoteYaml } = await import('/public/js/services/file-parsing/yaml-value-write.js');
  const { parseYaml } = await import('/public/js/services/file-parsing/yaml-parse.js');
  return texts.map(text => {
    const written = needsQuoting(text) ? quoteYaml(text) : text;
    const errors = [];
    const data = parseYaml(`---\nnote: ${written}\nafter: kept\n---\n# Body\n`, errors);
    return { written, value: data.note, after: data.after, errors };
  });
}, texts);

test('the shapes that would break the block are quoted', async ({ page }) => {
  const [colon, colonEnd, dash, hash, quote, bracket, newline] =
    await asks(page, ['due: friday', 'trailing:', '- not a list', '#work', '"quoted"', '[draft]', 'two\nlines']);

  for (const answer of [colon, colonEnd, dash, hash, quote, bracket, newline]) {
    expect(answer.scalar).toBe(true);
    expect(answer.item).toBe(true);
  }
});

test('a value that would read back as something else is quoted', async ({ page }) => {
  // The group that damages files rather than the group everyone imagines: written plainly, every
  // one of these comes back as a different thing than was typed.
  const answers = await asks(page, ['007', '42', '-1.5', 'true', 'false', 'null', '~']);
  for (const answer of answers) expect(answer.scalar).toBe(true);
});

test('ordinary text is left alone, and so is a date', async ({ page }) => {
  const answers = await asks(page, ['draft', 'a b c', 'Jane Doe', '2026-03-01', '1 March 2026',
                                    'in progress', 'a <b> c', 'ratio 3:4']);
  for (const answer of answers) expect(answer.scalar).toBe(false);
});

test('a comma, a bracket or a quote is quoted inside a flow list only', async ({ page }) => {
  const [comma, close] = await asks(page, ['Smith, John', 'a] b']);

  // a block item runs to the end of its line, so none of these can end it early
  expect(comma.scalar).toBe(false);
  expect(close.scalar).toBe(false);
  expect(comma.item).toBe(true);
  expect(close.item).toBe(true);
});

test('an empty value is written as empty quotes rather than nothing', async ({ page }) => {
  // `note:` with nothing after it opens a nested map, which the parser prunes — the key would
  // survive in the file and vanish from the table, taking its column with it.
  const [empty] = await roundTrip(page, ['']);
  expect(empty.written).toBe('""');
  expect(empty.value).toBe('');
});

test('every value comes back as itself, and the next key survives', async ({ page }) => {
  const texts = ['draft', '007', 'true', 'null', 'due: friday', '- not a list', '#work',
                 '[draft]', '2026-03-01', 'a <b> c', "it's fine", 'she said "hi"', '42'];
  const results = await roundTrip(page, texts);

  results.forEach((result, i) => {
    expect(result.value, `${texts[i]} written as ${result.written}`).toBe(texts[i]);
    expect(result.after).toBe('kept');   // the block is intact, not just this one value
    expect(result.errors).toEqual([]);
  });
});

test('the quote character is the one the text does not use', async ({ page }) => {
  const written = await page.evaluate(async () => {
    const { quoteYaml } = await import('/public/js/services/file-parsing/yaml-value-write.js');
    return { plain: quoteYaml('a, b'), hasDouble: quoteYaml('she said "hi"'), hasSingle: quoteYaml("it's") };
  });

  expect(written.plain).toBe('"a, b"');
  expect(written.hasDouble).toBe(`'she said "hi"'`);   // double quotes would end the run early
  expect(written.hasSingle).toBe(`"it's"`);
});

test('a quoted flow item still reads back as one item', async ({ page }) => {
  const items = await page.evaluate(async () => {
    const { needsQuoting, quoteYaml } = await import('/public/js/services/file-parsing/yaml-value-write.js');
    const { splitFlowItems } = await import('/public/js/services/file-parsing/flow-list.js');
    const write = text => (needsQuoting(text, true) ? quoteYaml(text) : text);
    return splitFlowItems([write('Smith, John'), write('Jane Doe'), write('a", b')].join(', '));
  });

  expect(items).toEqual(['Smith, John', 'Jane Doe', 'a", b']);
});
